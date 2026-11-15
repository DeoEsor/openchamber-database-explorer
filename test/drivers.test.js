import { describe, expect, it } from "bun:test";
import { ObjectId } from "mongodb";
import { documentFilter, readCollection, serialize as serializeMongo } from "../src/service/mongo.js";
import { introspect as introspectRedis, readKeys } from "../src/service/redis.js";

describe("MongoDB adapter", () => {
  it("builds bounded operator filters and escapes regular expressions", () => {
    expect(documentFilter({ col: "age", op: "gte", val: "18" })).toEqual({ age: { $gte: 18 } });
    const filter = documentFilter({ col: "name", op: "contains", val: "a.b" });
    expect(filter.name).toBeInstanceOf(RegExp);
    expect(filter.name.test("a.b")).toBe(true);
    expect(filter.name.test("axb")).toBe(false);
    expect(() => documentFilter({ col: "$where", op: "eq", val: "x" })).toThrow("Invalid MongoDB field name");
  });

  it("serializes BSON identifiers and nested values", () => {
    const id = new ObjectId("000000000000000000000001");
    expect(serializeMongo(id)).toBe(id.toHexString());
    expect(serializeMongo({ at: new Date("2026-01-02T03:04:05Z") })).toContain("2026-01-02T03:04:05Z");
  });

  it("returns heterogeneous documents through the shared page contract", async () => {
    const documents = [
      { _id: new ObjectId("000000000000000000000001"), name: "Ada", profile: { role: "admin" } },
      { _id: new ObjectId("000000000000000000000002"), name: "Grace", tags: ["math"] },
    ];
    const cursor = {
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      toArray: async () => documents,
    };
    const collection = { find: () => cursor, countDocuments: async () => 2 };
    const client = { db: () => ({ collection: () => collection }) };
    const page = await readCollection(client, { schema: "app", table: "users" });
    expect(page.columns).toEqual(["_id", "name", "profile", "tags"]);
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0][0]).toBe("000000000000000000000001");
    expect(page.rows[0][2]).toBe('{"role":"admin"}');
    expect(page.total).toBe(2);
    expect(page.readOnly).toBe(true);
  });
});

describe("Redis adapter", () => {
  it("describes only the selected logical database", async () => {
    const client = { isOpen: true, dbSize: async () => 3 };
    const schemas = await introspectRedis(client, "2");
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe("db2");
    expect(schemas[0].tables[0].approxRows).toBe(3);
  });

  it("uses SCAN and reads typed values", async () => {
    const calls = [];
    const client = {
      isOpen: true,
      scanIterator: async function* () { yield ["user:1", "profile:1"]; },
      type: async (key) => key.startsWith("user") ? "string" : "hash",
      ttl: async () => -1,
      get: async (key) => { calls.push(["get", key]); return "Ada"; },
      hGetAll: async (key) => { calls.push(["hGetAll", key]); return { role: "admin" }; },
    };
    const page = await readKeys(client, { limit: 100 });
    expect(page.total).toBe(2);
    expect(page.rows).toEqual([
      ["profile:1", "hash", "-1", '{"role":"admin"}'],
      ["user:1", "string", "-1", "Ada"],
    ]);
    expect(calls).toEqual([["hGetAll", "profile:1"], ["get", "user:1"]]);
  });

  it("filters keys without loading values outside the page", async () => {
    let valueReads = 0;
    const client = {
      isOpen: true,
      scanIterator: async function* () { yield ["user:1", "queue"]; },
      type: async (key) => key === "queue" ? "list" : "string",
      ttl: async () => -1,
      get: async () => { valueReads += 1; return "Ada"; },
      lRange: async () => { valueReads += 1; return []; },
    };
    const page = await readKeys(client, { filter: { col: "key", op: "starts", val: "user:" } });
    expect(page.total).toBe(1);
    expect(page.rows[0][0]).toBe("user:1");
    expect(valueReads).toBe(1);
  });
});
