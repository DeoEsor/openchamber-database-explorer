import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import * as db from "../src/service/db.js";
import * as mongo from "../src/service/mongo.js";
import * as redis from "../src/service/redis.js";

const enabled = process.env.DEMO_INTEGRATION === "1";
const integration = enabled ? test : test.skip;
const pgDsn = process.env.DEMO_POSTGRES_DSN ?? "postgres://explorer:explorer@127.0.0.1:55432/acme";
const mongoDsn = process.env.DEMO_MONGODB_DSN ?? "mongodb://explorer:explorer@127.0.0.1:57017/acme?authSource=admin";
const redisDsn = process.env.DEMO_REDIS_DSN ?? "redis://127.0.0.1:56379/0";
integration("PostgreSQL demo preserves typed values, defaults, NULL, and empty strings", async () => {
  const sql = db.open(pgDsn);
  const email = `editor-${randomUUID()}@example.test`;
  const uuid = randomUUID();
  let id;
  try {
    await db.insertRow(sql, {
      schema: "public", table: "customers",
      values: {
        name: "Editor Integration", email, plan: "Scale", country: "Test", status: "",
        notes: null, external_id: uuid, joined_on: "2026-11-16",
        local_checkpoint: "2026-11-16 09:30:00.123456", opens_at: "09:15:30.123",
        created_at: "2026-11-16T09:30:00+05:30",
      },
    });
    const rows = await sql.unsafe("select * from customers where email = $1", [email]);
    id = String(rows[0].id);
    expect(rows[0].external_id).toBe(uuid);
    expect(rows[0].joined_on).toBe("2026-11-16");
    // The demo column is timestamp(3): PostgreSQL rounds excess fractional precision.
    expect(rows[0].local_checkpoint).toBe("2026-11-16 09:30:00.123");
    expect(rows[0].opens_at).toBe("09:15:30.123");
    expect(rows[0].notes).toBeNull();
    expect(rows[0].status).toBe("");
    await db.applyBatch(sql, { schema: "public", table: "customers", pk: "id", ops: [
      { op: "update", pkVal: id, col: "notes", now: "", valNull: false },
    ] });
    const updated = await sql.unsafe("select notes from customers where id = $1", [id]);
    expect(updated[0].notes).toBe("");
  } finally {
    if (id) await db.deleteRow(sql, { schema: "public", table: "customers", pkCol: "id", pkVal: id });
    else await sql.unsafe("delete from customers where email = $1", [email]);
    await sql.end();
  }
});

integration("MongoDB demo round-trips canonical BSON and detects stale writes", async () => {
  const client = mongo.open(mongoDsn);
  const collection = `editor_integration_${randomUUID().replaceAll("-", "")}`;
  const target = client.db("acme").collection(collection);
  try {
    // Build the fixture through canonical Extended JSON so no driver-specific serialization is hidden.
    const canonical = JSON.stringify({
      name: "Typed document", empty: "", missing: null,
      externalId: { $oid: randomUUID().replaceAll("-", "").slice(0, 24) },
      createdAt: { $date: { $numberLong: "1767225600000" } },
      budget: { $numberDecimal: "12500.50" },
      seats: { $numberLong: "42" },
      nested: { enabled: true },
    });
    const inserted = await mongo.insertDocument(client, { schema: "acme", table: collection, document: canonical });
    const id = inserted.insertedId;
    const original = mongo.serialize(await target.findOne({ _id: mongo.parse(id) }));
    expect(JSON.parse(original).missing).toBeNull();
    await mongo.updateDocument(client, {
      schema: "acme", table: collection, id, original,
      set: { empty: mongo.serialize(""), nested: mongo.serialize({ enabled: false }) }, unset: ["missing"],
    });
    await expect(mongo.updateDocument(client, {
      schema: "acme", table: collection, id, original,
      set: { nested: mongo.serialize({ enabled: "stale" }) }, unset: [],
    })).rejects.toMatchObject({ code: "MONGO_CONFLICT", status: 409 });
    const changed = mongo.serialize(await target.findOne({ _id: mongo.parse(id) }));
    expect(Object.hasOwn(JSON.parse(changed), "missing")).toBe(false);
    const replacement = JSON.parse(changed);
    replacement.name = "Replacement";
    await mongo.replaceDocument(client, { schema: "acme", table: collection, original: changed, document: JSON.stringify(replacement) });
    const latest = mongo.serialize(await target.findOne({ _id: mongo.parse(id) }));
    await mongo.deleteDocument(client, { schema: "acme", table: collection, id, original: latest });
    expect(await target.findOne({ _id: mongo.parse(id) })).toBeNull();
  } finally {
    await target.drop().catch(() => {});
    await mongo.close(client);
  }
});

integration("Valkey demo safely edits every supported type", async () => {
  const client = redis.open(redisDsn);
  const prefix = `editor:integration:${randomUUID()}`;
  const keys = new Set();
  const key = (type) => {
    const value = `${prefix}:${type}`;
    keys.add(value);
    return value;
  };
  const apply = (operation) => redis.applyOperation(client, operation);
  try {
    const stringKey = key("string");
    await apply({ op: "create", key: stringKey, type: "string", value: "before", ttl: 120 });
    await apply({ op: "string.set", key: stringKey, expectedValue: "before", value: "after" });
    const string = await redis.readKey(client, { key: stringKey });
    expect(string.value).toBe("after");
    expect(string.ttl).toBeGreaterThan(0);
    await expect(apply({ op: "string.set", key: stringKey, expectedValue: "wrong", value: "lost" })).rejects.toMatchObject({ code: "CONFLICT" });
    await apply({ op: "ttl", key: stringKey, ttl: null });

    const hashKey = key("hash");
    await apply({ op: "create", key: hashKey, type: "hash", entries: [{ field: "one", value: "1" }] });
    await apply({ op: "hash.add", key: hashKey, field: "two", value: "2" });
    await apply({ op: "hash.update", key: hashKey, field: "two", expectedValue: "2", value: "second" });
    await apply({ op: "hash.delete", key: hashKey, field: "one", expectedValue: "1" });
    expect((await redis.readKey(client, { key: hashKey })).entries).toEqual([expect.objectContaining({ field: "two", value: "second" })]);

    const listKey = key("list");
    await apply({ op: "create", key: listKey, type: "list", entries: [{ value: "a" }, { value: "c" }] });
    await apply({ op: "list.insert", key: listKey, index: 1, value: "b", expectedLength: 2, expectedValue: "c" });
    await apply({ op: "list.update", key: listKey, index: 1, expectedValue: "b", value: "B" });
    await apply({ op: "list.delete", key: listKey, index: 0, expectedValue: "a" });
    expect((await redis.readKey(client, { key: listKey })).entries.map((entry) => entry.value)).toEqual(["B", "c"]);

    const setKey = key("set");
    await apply({ op: "create", key: setKey, type: "set", entries: [{ member: "a" }] });
    await apply({ op: "set.add", key: setKey, member: "b" });
    await apply({ op: "set.replace", key: setKey, member: "a", newMember: "c" });
    await apply({ op: "set.remove", key: setKey, member: "b" });
    expect((await redis.readKey(client, { key: setKey })).entries.map((entry) => entry.member)).toEqual(["c"]);

    const zsetKey = key("zset");
    await apply({ op: "create", key: zsetKey, type: "zset", entries: [{ member: "a", score: "1" }] });
    await apply({ op: "zset.add", key: zsetKey, member: "b", score: "2" });
    await apply({ op: "zset.score", key: zsetKey, member: "a", expectedScore: "1", score: "1.5" });
    await apply({ op: "zset.replace", key: zsetKey, member: "a", newMember: "c", expectedScore: "1.5" });
    await apply({ op: "zset.remove", key: zsetKey, member: "b", expectedScore: "2" });
    expect((await redis.readKey(client, { key: zsetKey })).entries[0]).toMatchObject({ member: "c", score: "1.5" });

    const streamKey = key("stream");
    await apply({ op: "create", key: streamKey, type: "stream", entries: [{ id: "1-0", fields: [{ field: "event", value: "created" }] }] });
    const added = await apply({ op: "stream.add", key: streamKey, fields: [{ field: "event", value: "updated" }] });
    await apply({ op: "stream.delete", key: streamKey, id: "1-0" });
    const stream = await redis.readKey(client, { key: streamKey });
    expect(stream.entries).toHaveLength(1);
    expect(stream.entries[0].id).toBe(added.id);

    for (const value of keys) await apply({ op: "delete", key: value });
    keys.clear();
  } finally {
    for (const value of keys) await client.del(value).catch(() => {});
    await redis.close(client);
  }
});
