import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { BSON, MongoServerError, ObjectId } from "mongodb";
import {
  close,
  deleteDocument,
  insertDocument,
  open,
  parse,
  readCollection,
  replaceDocument,
  serialize,
  updateDocument,
} from "../src/service/mongo.js";

const ID = new ObjectId("000000000000000000000001");
const OTHER_ID = new ObjectId("000000000000000000000002");
const CODE_SCOPE_ERROR = "MongoDB Code values with scope cannot be used in guarded edits.";
const fieldValue = (field) => ({ $getField: { field: { $literal: field }, input: "$$ROOT" } });

function mockWriteClient(outcomes = {}) {
  const calls = [];
  const invoke = async (method, args) => {
    calls.push({ method, args });
    const outcome = outcomes[method];
    if (outcome instanceof Error) throw outcome;
    if (typeof outcome === "function") return outcome(...args);
    if (outcome) return outcome;
    if (method === "insertOne") return { acknowledged: true, insertedId: args[0]._id ?? ID };
    if (method === "deleteOne") return { acknowledged: true, deletedCount: 1 };
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  };
  const collection = {
    insertOne: async (...args) => invoke("insertOne", args),
    updateOne: async (...args) => invoke("updateOne", args),
    replaceOne: async (...args) => invoke("replaceOne", args),
    deleteOne: async (...args) => invoke("deleteOne", args),
  };
  const client = {
    db(name) {
      return {
        collection(table) {
          return new Proxy(collection, {
            get(target, property) {
              if (property === "namespace") return { db: name, collection: table };
              return target[property];
            },
          });
        },
      };
    },
  };
  return { client, calls };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to reject.");
}

function expectRootGuard(filter, original) {
  expect(filter._id).toEqual(ID);
  expect(Object.values(filter.$expr.$let.vars)).toEqual(["$$ROOT"]);
  const [[variable]] = Object.entries(filter.$expr.$let.vars);
  const reference = `$$${variable}`;
  expect(filter.$expr.$let.in.$cond.if).toEqual({
    $eq: [{ $type: reference }, { $type: { $literal: original } }],
  });
  expect(filter.$expr.$let.in.$cond.then.$and[0].$eq[1]).toEqual({ $literal: Object.keys(original) });
}

function writeGuardedValue(client, operation, { schema = "app", table = "users", id, original, next }) {
  if (operation === "update") {
    return updateDocument(client, {
      schema, table, id: serialize(id), original, set: { value: serialize(next) },
    });
  }
  if (operation === "replace") {
    return replaceDocument(client, {
      schema,
      table,
      original,
      document: serialize({ _id: id, value: next, status: "replacement" }),
    });
  }
  return deleteDocument(client, { schema, table, id: serialize(id), original });
}

describe("canonical MongoDB Extended JSON", () => {
  it("round-trips identity, dates, decimal, int64, int32, and nested BSON", () => {
    const value = {
      _id: ID,
      at: new Date("2026-01-02T03:04:05Z"),
      amount: BSON.Decimal128.fromString("19.99"),
      visits: BSON.Long.fromString("9223372036854775806"),
      nested: { count: new BSON.Int32(7), values: [true, null] },
    };

    const text = serialize(value);
    expect(text).toContain('"$oid"');
    expect(text).toContain('"$date":{"$numberLong":"1767323045000"}');
    expect(text).toContain('"$numberDecimal":"19.99"');
    expect(text).toContain('"$numberLong":"9223372036854775806"');

    const decoded = parse(text);
    expect(decoded._id).toBeInstanceOf(ObjectId);
    expect(decoded.at).toBeInstanceOf(Date);
    expect(decoded.amount).toBeInstanceOf(BSON.Decimal128);
    expect(BSON.Long.isLong(decoded.visits)).toBe(true);
    expect(decoded.nested.count).toBeInstanceOf(BSON.Int32);
    expect(serialize(decoded)).toBe(text);
    expect(parse(serialize(null))).toBeNull();
    expect(parse(serialize(""))).toBe("");
    expect(() => serialize(undefined)).toThrow("omit the field");
  });

  it("rejects malformed EJSON, unknown operators, and prototype pollution fields", () => {
    expect(() => parse("{")).toThrow("Invalid MongoDB Extended JSON");
    expect(() => parse('{"value":{"$unknown":"x"}}')).toThrow("Unknown MongoDB Extended JSON operator");
    expect(() => parse('{"__proto__":{"polluted":true}}')).toThrow("unsafe MongoDB field");
    expect(() => parse('{"nested":{"constructor":"x"}}')).toThrow("unsafe MongoDB field");
    expect(() => parse('{"$options":"i"}')).toThrow("unsafe MongoDB field");
  });
});

describe("MongoDB collection browsing snapshots", () => {
  it("keeps display rows compatible and adds aligned canonical documents and presence", async () => {
    const documents = [
      {
        _id: ID,
        nullable: null,
        empty: "",
        nested: { at: new Date("2026-01-02T03:04:05Z") },
      },
      { _id: OTHER_ID, empty: "" },
    ];
    const cursor = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      toArray: async () => documents,
    };
    const collection = { find: () => cursor, countDocuments: async () => new BSON.Int32(2) };
    const client = { db: () => ({ collection: () => collection }) };

    const page = await readCollection(client, { schema: "app", table: "users" });
    expect(page.columns).toEqual(["_id", "nullable", "empty", "nested"]);
    expect(page.rows[0]).toEqual([
      ID.toHexString(),
      null,
      "",
      '{"at":{"$date":"2026-01-02T03:04:05Z"}}',
    ]);
    expect(page.present).toEqual([
      [true, true, true, true],
      [true, false, true, false],
    ]);
    expect(page.documents).toHaveLength(2);
    expect(parse(page.documents[0]).nullable).toBeNull();
    expect(parse(page.documents[0]).empty).toBe("");
    expect(parse(page.documents[0]).nested.at).toBeInstanceOf(Date);
    expect(Object.hasOwn(parse(page.documents[1]), "nullable")).toBe(false);
    expect(page.rows).toHaveLength(page.documents.length);
    expect(page.total).toBe(2);
    expect(page.readOnly).toBe(false);
  });
});

describe("MongoDB document insertion", () => {
  it("inserts a parsed BSON document and returns canonical identity", async () => {
    const { client, calls } = mockWriteClient();
    const document = { _id: ID, amount: BSON.Decimal128.fromString("2.50"), empty: "", nullable: null };
    const result = await insertDocument(client, {
      schema: "app",
      table: "users",
      document: serialize(document),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("insertOne");
    expect(calls[0].args[0]._id).toBeInstanceOf(ObjectId);
    expect(calls[0].args[0].amount).toBeInstanceOf(BSON.Decimal128);
    expect(calls[0].args[0].empty).toBe("");
    expect(calls[0].args[0].nullable).toBeNull();
    expect(result).toEqual({ count: 1, insertedId: serialize(ID) });
  });

  it("keeps duplicate-key failures clear and conflict-aware", async () => {
    const duplicate = new MongoServerError({
      message: "E11000 duplicate key error collection: acme.users index: email_1 dup key: { email: \"private@example.test\" }",
      code: 11000,
    });
    const { client } = mockWriteClient({ insertOne: duplicate });
    const error = await rejection(insertDocument(client, {
      schema: "app",
      table: "users",
      document: serialize({ _id: ID }),
    }));

    expect(error).toMatchObject({ code: "MONGO_DUPLICATE_KEY", status: 409, cause: duplicate });
    expect(error.message).toContain("same unique key");
    expect(error.message).not.toContain("E11000");
    expect(error.message).not.toContain("email_1");
    expect(error.message).not.toContain("private@example.test");
  });

  it("rejects non-object and unsafe documents before touching the collection", async () => {
    const { client, calls } = mockWriteClient();
    const documents = [
      "null",
      "[]",
      serialize("scalar"),
      serialize(new Date()),
      serialize({ "nested.field": 1 }),
      serialize({ "": 1 }),
      '{"$where":"x"}',
      '{"safe":{"$unknown":1}}',
      '{"__proto__":{}}',
    ];

    for (const document of documents) {
      await expect(insertDocument(client, { schema: "app", table: "users", document })).rejects.toMatchObject({
        code: "MONGO_INVALID_REQUEST",
        status: 400,
      });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("MongoDB top-level updates", () => {
  it("matches edited original values while distinguishing null, missing, and empty", async () => {
    const { client, calls } = mockWriteClient({
      // The real driver may expose BSON Int32 count objects rather than plain numbers.
      updateOne: { acknowledged: true, matchedCount: new BSON.Int32(1), modifiedCount: new BSON.Int32(2) },
    });
    const original = { _id: ID, nullable: null, empty: "", remove: "old", keep: "unchanged" };
    const result = await updateDocument(client, {
      schema: "app",
      table: "users",
      id: serialize(ID),
      original: serialize(original),
      set: {
        nullable: serialize("now set"),
        empty: serialize(""),
        added: serialize(new BSON.Int32(3)),
      },
      unset: ["remove", "absent"],
    });

    expect(calls).toHaveLength(1);
    const [filter, update] = calls[0].args;
    expect(filter._id).toEqual(ID);
    expect(filter.$expr.$and).toHaveLength(5);
    for (const [index, field, expected] of [
      [0, "nullable", null],
      [1, "empty", ""],
      [3, "remove", "old"],
    ]) {
      const comparison = filter.$expr.$and[index];
      const [[variable, actual]] = Object.entries(comparison.$let.vars);
      const reference = `$$${variable}`;
      expect(actual).toEqual(fieldValue(field));
      expect(comparison.$let.in.$and).toEqual([
        { $eq: [{ $type: reference }, { $type: { $literal: expected } }] },
        { $eq: [reference, { $literal: expected }] },
      ]);
    }
    expect(filter.$expr.$and[2]).toEqual({ $eq: [{ $type: fieldValue("added") }, "missing"] });
    expect(filter.$expr.$and[4]).toEqual({ $eq: [{ $type: fieldValue("absent") }, "missing"] });
    expect(serialize(filter)).not.toContain("unchanged");
    expect(update.$set.nullable).toBe("now set");
    expect(update.$set.empty).toBe("");
    expect(update.$set.added).toBeInstanceOf(BSON.Int32);
    expect(update.$unset).toEqual({ remove: "", absent: "" });
    expect(result).toEqual({ count: 1, matchedCount: 1, modifiedCount: 2 });
  });

  it("rejects _id edits, unsafe fields, malformed values, and empty updates before writing", async () => {
    const { client, calls } = mockWriteClient();
    const original = serialize({ _id: ID, value: "old" });
    const base = { schema: "app", table: "users", id: serialize(ID), original };
    const requests = [
      { ...base, set: { _id: serialize(OTHER_ID) } },
      { ...base, unset: ["_id"] },
      { ...base, set: { "profile.role": serialize("admin") } },
      { ...base, set: { $set: serialize("admin") } },
      { ...base, set: { "": serialize("admin") } },
      { ...base, set: { "bad\0field": serialize("admin") } },
      { ...base, set: { constructor: serialize("admin") } },
      { ...base, set: { value: "not-json" } },
      { ...base, set: {}, unset: [] },
      { ...base, id: serialize(OTHER_ID), set: { value: serialize("new") } },
    ];

    for (const request of requests) {
      await expect(updateDocument(client, request)).rejects.toMatchObject({ code: "MONGO_INVALID_REQUEST" });
    }
    expect(calls).toHaveLength(0);
  });

  it("sanitizes unique-index update failures", async () => {
    const duplicate = new MongoServerError({
      message: "E11000 duplicate key error collection: acme.users index: email_1 dup key: { email: \"private@example.test\" }",
      code: 11000,
    });
    const { client } = mockWriteClient({ updateOne: duplicate });
    const original = serialize({ _id: ID, email: "old@example.test" });
    const error = await rejection(updateDocument(client, {
      schema: "app",
      table: "users",
      id: serialize(ID),
      original,
      set: { email: serialize("private@example.test") },
    }));

    expect(error).toMatchObject({ code: "MONGO_DUPLICATE_KEY", status: 409, cause: duplicate });
    expect(error.message).toBe("MongoDB update failed: a document with the same unique key already exists.");
    expect(error.message).not.toContain("E11000");
    expect(error.message).not.toContain("private@example.test");
  });

  it("requires exactly one matched document", async () => {
    for (const matchedCount of [0, 2]) {
      const { client } = mockWriteClient({
        updateOne: { acknowledged: true, matchedCount, modifiedCount: 0 },
      });
      const error = await rejection(updateDocument(client, {
        schema: "app",
        table: "users",
        id: serialize(ID),
        original: serialize({ _id: ID, value: "old" }),
        set: { value: serialize("new") },
      }));
      expect(error).toMatchObject({ code: "MONGO_CONFLICT", status: 409 });
      expect(error.message).toContain(`matched: ${matchedCount}`);
    }
  });
});

describe("MongoDB replacement and deletion", () => {
  it("replaces against the exact original snapshot and accepts a no-op match", async () => {
    const { client, calls } = mockWriteClient({
      replaceOne: { acknowledged: true, matchedCount: 1, modifiedCount: 0 },
    });
    const original = { _id: ID, nullable: null, nested: { value: BSON.Long.fromNumber(8) } };
    const result = await replaceDocument(client, {
      schema: "app",
      table: "users",
      original: serialize(original),
      document: serialize(original),
    });

    expect(calls[0].method).toBe("replaceOne");
    const [filter, replacement] = calls[0].args;
    expectRootGuard(filter, original);
    expect(serialize(filter.$expr)).toContain("$objectToArray");
    expect(serialize(filter.$expr)).toContain('"$numberLong":"8"');
    expect(replacement.nested.value).toBeInstanceOf(BSON.Long);
    expect(result).toEqual({ count: 1, matchedCount: 1, modifiedCount: 0 });
  });

  it("rejects replacement _id removal or changes before writing", async () => {
    const { client, calls } = mockWriteClient();
    const original = serialize({ _id: ID, value: "old" });
    for (const document of [serialize({ value: "new" }), serialize({ _id: OTHER_ID, value: "new" })]) {
      await expect(replaceDocument(client, {
        schema: "app",
        table: "users",
        original,
        document,
      })).rejects.toThrow("preserve the original _id");
    }
    expect(calls).toHaveLength(0);
  });

  it("sanitizes unique-index replacement failures", async () => {
    const duplicate = new MongoServerError({
      message: "E11000 duplicate key error collection: acme.users index: email_1 dup key: { email: \"private@example.test\" }",
      code: 11000,
    });
    const { client } = mockWriteClient({ replaceOne: duplicate });
    const original = serialize({ _id: ID, email: "old@example.test" });
    const error = await rejection(replaceDocument(client, {
      schema: "app",
      table: "users",
      original,
      document: serialize({ _id: ID, email: "private@example.test" }),
    }));

    expect(error).toMatchObject({ code: "MONGO_DUPLICATE_KEY", status: 409, cause: duplicate });
    expect(error.message).toBe("MongoDB replace failed: a document with the same unique key already exists.");
    expect(error.message).not.toContain("E11000");
    expect(error.message).not.toContain("private@example.test");
  });

  it("reports stale replacements as conflicts", async () => {
    const { client } = mockWriteClient({
      replaceOne: { acknowledged: true, matchedCount: 0, modifiedCount: 0 },
    });
    const original = serialize({ _id: ID, value: "old" });
    const error = await rejection(replaceDocument(client, {
      schema: "app",
      table: "users",
      original,
      document: original,
    }));
    expect(error).toMatchObject({ code: "MONGO_CONFLICT", status: 409 });
  });

  it("deletes against the exact original snapshot and verifies the supplied id", async () => {
    const { client, calls } = mockWriteClient();
    const original = { _id: ID, nullable: null, empty: "" };
    const result = await deleteDocument(client, {
      schema: "app",
      table: "users",
      id: serialize(ID),
      original: serialize(original),
    });

    expect(calls[0].method).toBe("deleteOne");
    expectRootGuard(calls[0].args[0], original);
    expect(result).toEqual({ count: 1, deletedCount: 1 });

    const validation = mockWriteClient();
    await expect(deleteDocument(validation.client, {
      schema: "app",
      table: "users",
      id: serialize(OTHER_ID),
      original: serialize(original),
    })).rejects.toThrow("does not match");
    expect(validation.calls).toHaveLength(0);
  });

  it("reports an already changed or deleted document as a conflict", async () => {
    const { client } = mockWriteClient({ deleteOne: { acknowledged: true, deletedCount: 0 } });
    const error = await rejection(deleteDocument(client, {
      schema: "app",
      table: "users",
      id: serialize(ID),
      original: serialize({ _id: ID }),
    }));
    expect(error).toMatchObject({ code: "MONGO_CONFLICT", status: 409 });
  });
});

describe("MongoDB Code-with-scope guards", () => {
  it("rejects top-level and nested scoped Code before update, replace, or delete writes", async () => {
    for (const nested of [false, true]) {
      for (const operation of ["update", "replace", "delete"]) {
        const { client, calls } = mockWriteClient();
        const scoped = new BSON.Code("return privateValue;", { privateValue: new BSON.Int32(1) });
        const value = nested ? { items: [{ callback: scoped }] } : scoped;
        const original = serialize({ _id: ID, value, status: "current" });
        const error = await rejection(writeGuardedValue(client, operation, {
          id: ID,
          original,
          next: "next",
        }));

        expect(error).toMatchObject({ code: "MONGO_INVALID_REQUEST", status: 400 });
        expect(error.message).toBe(CODE_SCOPE_ERROR);
        expect(error.message).not.toContain("privateValue");
        expect(calls).toHaveLength(0);
      }
    }
  });

  it("allows field updates that do not guard an unrelated scoped Code value", async () => {
    const { client, calls } = mockWriteClient();
    const original = serialize({
      _id: ID,
      value: "old",
      callback: new BSON.Code("return privateValue;", { privateValue: new BSON.Int32(1) }),
    });
    const result = await writeGuardedValue(client, "update", { id: ID, original, next: "new" });

    expect(result).toEqual({ count: 1, matchedCount: 1, modifiedCount: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("updateOne");
  });
});

const liveMongo = process.env.MONGO_LIVE_TEST === "1" ? it : it.skip;
const liveMongoDsn = process.env.MONGO_TEST_DSN
  ?? "mongodb://explorer:explorer@127.0.0.1:57017/acme?authSource=admin";

describe("MongoDB live BSON identity guards", () => {
  liveMongo("conflicts on Int32 to Long changes for update, replace, and delete", async () => {
    const client = open(liveMongoDsn);
    const table = `mongo_type_guard_${randomUUID().replaceAll("-", "")}`;
    const target = client.db("acme").collection(table);
    try {
      for (const nested of [false, true]) {
        for (const operation of ["update", "replace", "delete"]) {
          const id = new ObjectId();
          const expected = nested
            ? { items: [{ count: new BSON.Int32(1) }] }
            : new BSON.Int32(1);
          const changed = nested
            ? { items: [{ count: BSON.Long.fromNumber(1) }] }
            : BSON.Long.fromNumber(1);
          const next = nested
            ? { items: [{ count: new BSON.Int32(2) }] }
            : new BSON.Int32(2);
          await target.insertOne({ _id: id, value: changed, status: "current" });
          const original = serialize({ _id: id, value: expected, status: "current" });
          const idText = serialize(id);
          let write;
          if (operation === "update") {
            write = updateDocument(client, {
              schema: "acme", table, id: idText, original, set: { value: serialize(next) },
            });
          } else if (operation === "replace") {
            write = replaceDocument(client, {
              schema: "acme",
              table,
              original,
              document: serialize({ _id: id, value: next, status: "replacement" }),
            });
          } else {
            write = deleteDocument(client, { schema: "acme", table, id: idText, original });
          }

          const error = await rejection(write);
          expect(error).toMatchObject({ code: "MONGO_CONFLICT", status: 409 });
          const current = await target.findOne({ _id: id });
          expect(serialize(current.value)).toBe(serialize(changed));
          expect(current.status).toBe("current");
        }
      }
    } finally {
      await target.drop().catch(() => {});
      await close(client);
    }
  }, 20_000);

  liveMongo("rejects scoped Code snapshots after Int32 to Long scope changes without writing", async () => {
    const client = open(liveMongoDsn);
    const table = `mongo_code_scope_guard_${randomUUID().replaceAll("-", "")}`;
    const target = client.db("acme").collection(table);
    try {
      for (const nested of [false, true]) {
        for (const operation of ["update", "replace", "delete"]) {
          const id = new ObjectId();
          const expectedCode = new BSON.Code("return privateValue;", {
            privateValue: new BSON.Int32(1),
          });
          const changedCode = new BSON.Code("return privateValue;", {
            privateValue: BSON.Long.fromNumber(1),
          });
          const expected = nested ? { items: [{ callback: expectedCode }] } : expectedCode;
          const changed = nested ? { items: [{ callback: changedCode }] } : changedCode;
          await target.insertOne({ _id: id, value: expected, status: "current" });
          const original = serialize(await target.findOne({ _id: id }));
          await target.replaceOne({ _id: id }, { _id: id, value: changed, status: "current" });

          const error = await rejection(writeGuardedValue(client, operation, {
            schema: "acme",
            table,
            id,
            original,
            next: "next",
          }));
          expect(error).toMatchObject({ code: "MONGO_INVALID_REQUEST", status: 400 });
          expect(error.message).toBe(CODE_SCOPE_ERROR);
          expect(error.message).not.toContain("privateValue");
          const current = await target.findOne({ _id: id });
          expect(serialize(current.value)).toBe(serialize(changed));
          expect(current.status).toBe("current");
        }
      }
    } finally {
      await target.drop().catch(() => {});
      await close(client);
    }
  }, 20_000);

  liveMongo("matches unchanged guardable BSON scalar and nested values", async () => {
    const client = open(liveMongoDsn);
    const table = `mongo_bson_guard_${randomUUID().replaceAll("-", "")}`;
    const target = client.db("acme").collection(table);
    const id = new ObjectId();
    try {
      await target.insertOne({
        _id: id,
        int32: new BSON.Int32(1),
        int64: BSON.Long.fromNumber(1),
        double: new BSON.Double(1),
        decimal: BSON.Decimal128.fromString("1"),
        string: "value",
        object: { nested: new BSON.Int32(1) },
        array: [BSON.Long.fromNumber(1), null],
        binary: new BSON.Binary(new Uint8Array([1, 2, 3])),
        objectId: OTHER_ID,
        boolean: true,
        date: new Date("2026-01-02T03:04:05Z"),
        null: null,
        regex: new BSON.BSONRegExp("^a", "i"),
        javascript: new BSON.Code("return 1;"),
        symbol: new BSON.BSONSymbol("legacy"),
        timestamp: new BSON.Timestamp({ t: 1, i: 1 }),
        minKey: new BSON.MinKey(),
        maxKey: new BSON.MaxKey(),
        dbRef: new BSON.DBRef("items", OTHER_ID, "acme", { rank: new BSON.Int32(1) }),
      });
      const original = serialize(await target.findOne({ _id: id }));
      await replaceDocument(client, { schema: "acme", table, original, document: original });
      const deleted = await deleteDocument(client, { schema: "acme", table, id: serialize(id), original });
      expect(deleted).toEqual({ count: 1, deletedCount: 1 });
    } finally {
      await target.drop().catch(() => {});
      await close(client);
    }
  }, 20_000);
});
