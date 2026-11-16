import { describe, expect, it } from "bun:test";
import { applyOperation, readKey, readKeys, RedisOperationError } from "../src/service/redis.js";

function mutationClient(reply = 1) {
  const calls = [];
  const client = {
    isOpen: true,
    eval: async (script, options) => {
      const call = { script, keys: options.keys, args: options.arguments };
      calls.push(call);
      return typeof reply === "function" ? reply(call) : reply;
    },
  };
  return { client, calls };
}

async function expectCode(promise, code) {
  let error;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(RedisOperationError);
  expect(error?.code).toBe(code);
}

const readClient = (type, methods = {}) => ({
  isOpen: true,
  type: async () => type,
  ttl: async () => -1,
  ...methods,
});

describe("RedisOperationError", () => {
  it("maps expected codes to HTTP statuses without changing messages", () => {
    const cases = [
      ["INVALID_INPUT", 400],
      ["NO_OP", 400],
      ["INDEX_OUT_OF_RANGE", 400],
      ["TOO_LARGE", 400],
      ["UNSUPPORTED_TYPE", 400],
      ["KEY_NOT_FOUND", 404],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["KEY_EXISTS", 409],
      ["TYPE_MISMATCH", 409],
    ];
    for (const [code, status] of cases) {
      const error = new RedisOperationError(code, "Sanitized Redis error.");
      expect(error).toMatchObject({ name: "RedisOperationError", code, status });
      expect(error.message).toBe("Sanitized Redis error.");
    }
  });

  it("uses HTTP 500 for unexpected codes", () => {
    const error = new RedisOperationError("INTERNAL_ERROR", "Sanitized Redis error.");
    expect(error).toMatchObject({ code: "INTERNAL_ERROR", status: 500 });
    expect(error.message).toBe("Sanitized Redis error.");
  });
});

describe("readKey", () => {
  it("returns an exact string with byte counts and TTL", async () => {
    const calls = [];
    const client = readClient("string", {
      ttl: async () => 60,
      strLen: async () => 3,
      getRange: async (key, start, end) => {
        calls.push([key, start, end]);
        return "Ada";
      },
    });
    const result = await readKey(client, { key: "user:1", type: "string" });
    expect(result).toEqual({
      key: "user:1",
      type: "string",
      ttl: 60,
      value: "Ada",
      total: 1,
      returned: 1,
      entriesTruncated: false,
      valuesTruncated: 0,
      valueLength: 3,
      valueReturnedLength: 3,
      truncated: false,
      writable: true,
    });
    expect(calls).toEqual([["user:1", 0, 2]]);
  });

  it("marks a clipped string as non-writable and reads only its prefix", async () => {
    const client = readClient("string", {
      strLen: async () => 6,
      eval: async (script, options) => {
        expect(script).toContain("redis.string.prefix");
        expect(options).toEqual({ keys: ["large"], arguments: ["3"] });
        return ["abc", 3];
      },
    });
    const result = await readKey(client, { key: "large", valueLimit: 3 });
    expect(result.value).toBe("abc");
    expect(result.valueLength).toBe(6);
    expect(result.valueReturnedLength).toBe(3);
    expect(result.truncated).toBe(true);
    expect(result.valuesTruncated).toBe(1);
    expect(result.writable).toBe(false);
  });

  it("clips UTF-8 strings only at code-point boundaries with original-byte counts", async () => {
    const text = "a€🙂";
    const source = Buffer.from(text, "utf8");
    const ranges = [];
    const evalCalls = [];
    const client = readClient("string", {
      strLen: async () => source.length,
      getRange: async (key, start, end) => {
        ranges.push([start, end]);
        return source.subarray(start, end + 1).toString("utf8");
      },
      eval: async (script, options) => {
        evalCalls.push({ script, options });
        const limit = Number(options.arguments[0]);
        let index = 0;
        let last = 0;
        while (index < limit && index < source.length) {
          const first = source[index];
          const size = first >= 240 ? 4 : first >= 224 ? 3 : first >= 192 ? 2 : 1;
          if (index + size > limit || index + size > source.length) break;
          last = index + size;
          index += size;
        }
        return [source.subarray(0, last).toString("utf8"), last];
      },
    });
    const result = await readKey(client, { key: "utf8", valueLimit: 2 });
    expect(evalCalls).toHaveLength(1);
    expect(evalCalls[0].script).toContain("string.byte");
    expect(evalCalls[0].options).toEqual({ keys: ["utf8"], arguments: ["2"] });
    expect(ranges).toEqual([]);
    expect(result.value).toBe("a");
    expect(result.valueLength).toBe(8);
    expect(result.valueReturnedLength).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.writable).toBe(false);

    const exact = await readKey(client, { key: "utf8", valueLimit: 8 });
    expect(exact.value).toBe(text);
    expect(exact.valueReturnedLength).toBe(8);
    expect(exact.truncated).toBe(false);
    expect(exact.writable).toBe(true);
    expect(ranges).toEqual([[0, 7]]);
  });

  it("returns typed hash entries and explicit count truncation", async () => {
    const client = readClient("hash", {
      hLen: async () => 3,
      hScanIterator: async function* () {
        yield [{ field: "a", value: "1" }, { field: "b", value: "2" }];
      },
    });
    const result = await readKey(client, { key: "h", limit: 2 });
    expect(result.entries).toEqual([
      { field: "a", value: "1", truncated: false },
      { field: "b", value: "2", truncated: false },
    ]);
    expect(result.total).toBe(3);
    expect(result.returned).toBe(2);
    expect(result.entriesTruncated).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.writable).toBe(false);
  });

  it("returns indexed list entries and marks clipped values", async () => {
    const client = readClient("list", {
      lLen: async () => 2,
      lRange: async () => ["short", "abcdef"],
    });
    const result = await readKey(client, { key: "l", valueLimit: 5 });
    expect(result.entries[0]).toEqual({ index: 0, value: "short", truncated: false });
    expect(result.entries[1]).toEqual({
      index: 1,
      value: "abcde",
      truncated: true,
      valueLength: 6,
      valueReturnedLength: 5,
    });
    expect(result.entriesTruncated).toBe(false);
    expect(result.valuesTruncated).toBe(1);
    expect(result.writable).toBe(false);
  });

  it("returns typed set entries through bounded scanning", async () => {
    let scans = 0;
    const client = readClient("set", {
      sCard: async () => 2,
      sScanIterator: async function* () {
        scans += 1;
        yield ["a", "b"];
      },
    });
    const result = await readKey(client, { key: "s" });
    expect(result.entries).toEqual([
      { member: "a", truncated: false },
      { member: "b", truncated: false },
    ]);
    expect(result.total).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.writable).toBe(true);
    expect(scans).toBe(1);
  });

  it("returns zset members with JSON-safe exact scores", async () => {
    const client = readClient("zset", {
      zCard: async () => 2,
      zRangeWithScores: async () => [{ value: "a", score: Infinity }, { value: "b", score: 1.25 }],
    });
    const result = await readKey(client, { key: "z" });
    expect(result.entries).toEqual([
      { member: "a", score: "+inf", truncated: false },
      { member: "b", score: "1.25", truncated: false },
    ]);
    expect(result.writable).toBe(true);
  });

  it("returns stream IDs and typed fields without offering in-place writes", async () => {
    const client = readClient("stream", {
      xLen: async () => 2,
      xRange: async () => [{ id: "1-1", message: { event: "created" } }],
    });
    const result = await readKey(client, { key: "events", limit: 1 });
    expect(result.entries).toEqual([{
      id: "1-1",
      fields: [{ field: "event", value: "created", truncated: false }],
      truncated: false,
    }]);
    expect(result.total).toBe(2);
    expect(result.entriesTruncated).toBe(true);
    expect(result.writable).toBe(false);
  });

  it("rejects requested-type mismatches, missing keys, and invalid read bounds", async () => {
    await expectCode(readKey(readClient("list", {
      lLen: async () => 1,
      lRange: async () => ["a"],
    }), { key: "k", type: "string" }), "TYPE_MISMATCH");
    await expectCode(readKey(readClient("none"), { key: "missing" }), "KEY_NOT_FOUND");
    await expectCode(readKey(readClient("module"), { key: "k" }), "UNSUPPORTED_TYPE");
    await expectCode(readKey(readClient("string"), { key: "k", limit: 0 }), "INVALID_INPUT");
    await expectCode(readKey(readClient("string"), { key: "k", valueLimit: 0 }), "INVALID_INPUT");
  });
});

describe("readKeys compatibility", () => {
  it("keeps the existing grid rows and enables the dedicated editor", async () => {
    const client = {
      isOpen: true,
      scanIterator: async function* () { yield ["user:1"]; },
      type: async () => "string",
      ttl: async () => -1,
      get: async () => "Ada",
    };
    const page = await readKeys(client);
    expect(page.rows).toEqual([["user:1", "string", "-1", "Ada"]]);
    expect(page.readOnly).toBe(false);
  });
});

describe("applyOperation creation and key lifecycle", () => {
  const createCases = [
    {
      type: "string",
      input: { value: "Ada" },
      payload: "Ada",
      affected: 1,
    },
    {
      type: "hash",
      input: { entries: [{ field: "role", value: "admin" }] },
      payload: [["role", "admin"]],
      affected: 1,
    },
    {
      type: "list",
      input: { entries: [{ value: "a" }, { value: "b" }] },
      payload: ["a", "b"],
      affected: 2,
    },
    {
      type: "set",
      input: { entries: [{ member: "a" }] },
      payload: ["a"],
      affected: 1,
    },
    {
      type: "zset",
      input: { entries: [{ member: "a", score: "1.5" }] },
      payload: [["a", "1.5"]],
      affected: 1,
    },
    {
      type: "stream",
      input: { entries: [{ id: "1-1", fields: [{ field: "event", value: "created" }] }] },
      payload: [["1-1", [["event", "created"]]]],
      affected: 1,
    },
  ];

  it("atomically creates every supported type with an optional TTL", async () => {
    for (const testCase of createCases) {
      const { client, calls } = mutationClient();
      const result = await applyOperation(client, {
        op: "create", key: "k", type: testCase.type, ttl: 60, ...testCase.input,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0].script).toContain("-- redis.create");
      expect(calls[0].script).toContain("if ttl and ttl > 0");
      expect(calls[0].keys).toEqual(["k"]);
      expect(calls[0].args[0]).toBe(testCase.type);
      expect(calls[0].args[1]).toBe("60");
      expect(JSON.parse(calls[0].args[2])).toEqual(testCase.payload);
      expect(result).toEqual({
        ok: true,
        op: "create",
        key: "k",
        type: testCase.type,
        ttl: 60,
        affected: testCase.affected,
      });
    }
  });

  it("creates a persistent string when TTL is omitted and rejects an existing key", async () => {
    const persistent = mutationClient();
    const result = await applyOperation(persistent.client, { op: "create", key: "k", type: "string", value: "v" });
    expect(persistent.calls[0].args[1]).toBe("0");
    expect(result.ttl).toBeNull();
    await expectCode(applyOperation(mutationClient(-5).client, {
      op: "create", key: "k", type: "string", value: "v",
    }), "KEY_EXISTS");
  });

  it("deletes exactly one existing key and rejects missing deletes", async () => {
    const client = { isOpen: true, del: async () => 1 };
    expect(await applyOperation(client, { op: "delete", key: "k" })).toEqual({
      ok: true, op: "delete", key: "k", affected: 1,
    });
    await expectCode(applyOperation({ isOpen: true, del: async () => 0 }, {
      op: "delete", key: "missing",
    }), "KEY_NOT_FOUND");
  });

  it("sets and removes TTL atomically, rejecting a persist no-op", async () => {
    const expiring = mutationClient();
    expect(await applyOperation(expiring.client, { op: "ttl", key: "k", ttl: 120 })).toEqual({
      ok: true, op: "ttl", key: "k", ttl: 120, affected: 1,
    });
    expect(expiring.calls[0].args).toEqual(["120"]);

    const persistent = mutationClient();
    expect((await applyOperation(persistent.client, { op: "ttl", key: "k", ttl: null })).ttl).toBeNull();
    expect(persistent.calls[0].args).toEqual(["0"]);
    await expectCode(applyOperation(mutationClient(-8).client, { op: "ttl", key: "k", ttl: null }), "NO_OP");
  });
});

describe("applyOperation typed mutations", () => {
  const cases = [
    {
      op: "string.set", marker: "redis.string.set", type: "string",
      input: { expectedValue: "old", value: "new" }, args: ["old", "new"],
    },
    {
      op: "hash.add", marker: "redis.hash.add", type: "hash",
      input: { field: "role", value: "admin" }, args: ["role", "admin"],
    },
    {
      op: "hash.update", marker: "redis.hash.update", type: "hash",
      input: { field: "role", expectedValue: "user", value: "admin" }, args: ["role", "user", "admin"],
    },
    {
      op: "hash.delete", marker: "redis.hash.delete", type: "hash",
      input: { field: "role", expectedValue: "admin" }, args: ["role", "admin"],
    },
    {
      op: "list.update", marker: "redis.list.update", type: "list",
      input: { index: 1, expectedValue: "b", value: "B" }, args: ["1", "b", "B"],
    },
    {
      op: "list.insert", marker: "redis.list.insert", type: "list",
      input: { index: 1, expectedLength: 3, expectedValue: "b", value: "x" }, args: ["1", "x", "3", "1", "b"],
    },
    {
      op: "list.delete", marker: "redis.list.delete", type: "list",
      input: { index: 1, expectedValue: "b" }, args: ["1", "b"],
    },
    {
      op: "set.add", marker: "redis.set.add", type: "set",
      input: { member: "a" }, args: ["a"],
    },
    {
      op: "set.remove", marker: "redis.set.remove", type: "set",
      input: { member: "a" }, args: ["a"],
    },
    {
      op: "set.replace", marker: "redis.set.replace", type: "set",
      input: { member: "a", newMember: "b" }, args: ["a", "b"],
    },
    {
      op: "zset.add", marker: "redis.zset.add", type: "zset",
      input: { member: "a", score: Infinity }, args: ["a", "+inf"],
    },
    {
      op: "zset.score", marker: "redis.zset.score", type: "zset",
      input: { member: "a", expectedScore: 1, score: 2 }, args: ["a", "2", "1"],
    },
    {
      op: "zset.replace", marker: "redis.zset.replace", type: "zset",
      input: { member: "a", newMember: "b", expectedScore: 1, score: 2 }, args: ["a", "b", "1", "2"],
    },
    {
      op: "zset.remove", marker: "redis.zset.remove", type: "zset",
      input: { member: "a", expectedScore: 1 }, args: ["a", "1"],
    },
    {
      op: "stream.add", marker: "redis.stream.add", type: "stream",
      input: { id: "2-1", fields: [{ field: "event", value: "created" }] }, args: ["2-1", "event", "created"],
      reply: "2-1", id: "2-1",
    },
    {
      op: "stream.delete", marker: "redis.stream.delete", type: "stream",
      input: { id: "2-1" }, args: ["2-1"],
    },
  ];

  it("validates and executes every typed operation without resetting TTL", async () => {
    for (const testCase of cases) {
      const { client, calls } = mutationClient(testCase.reply ?? 1);
      const result = await applyOperation(client, { op: testCase.op, key: "k", ...testCase.input });
      expect(calls).toHaveLength(1);
      expect(calls[0].script).toContain(`-- ${testCase.marker}`);
      expect(calls[0].keys).toEqual(["k"]);
      expect(calls[0].args).toEqual(testCase.args);
      expect(calls[0].script).not.toContain("EXPIRE");
      expect(calls[0].script).not.toContain("RENAME");
      expect(calls[0].script).not.toContain("RESTORE");
      if (testCase.op === "string.set") expect(calls[0].script).toContain("KEEPTTL");
      expect(result).toEqual({
        ok: true,
        op: testCase.op,
        key: "k",
        type: testCase.type,
        affected: 1,
        ...(testCase.id ? { id: testCase.id } : {}),
      });
    }
  });

  it("preserves the exact insertion pivot and supports appending with an expected length", async () => {
    const { client, calls } = mutationClient();
    await applyOperation(client, { op: "list.insert", key: "l", index: 3, expectedLength: 3, value: "last" });
    expect(calls[0].args).toEqual(["3", "last", "3", "0", ""]);
    expect(calls[0].script).toContain("LLEN");
    expect(calls[0].script).toContain("LINDEX");
  });

  it("maps stale original values and wrong Redis types to conflict errors", async () => {
    const optimistic = cases.filter((testCase) => [
      "string.set", "hash.update", "hash.delete", "list.update", "list.insert", "list.delete",
      "zset.score", "zset.replace", "zset.remove",
    ].includes(testCase.op));
    for (const testCase of optimistic) {
      const operation = { op: testCase.op, key: "k", ...testCase.input };
      await expectCode(applyOperation(mutationClient(-3).client, operation), "CONFLICT");
      await expectCode(applyOperation(mutationClient(-2).client, operation), "TYPE_MISMATCH");
    }
  });

  it("rejects missing entries, duplicate targets, missing keys, ranges, and empty mutation replies", async () => {
    await expectCode(applyOperation(mutationClient(-4).client, {
      op: "hash.delete", key: "k", field: "f", expectedValue: "v",
    }), "NOT_FOUND");
    await expectCode(applyOperation(mutationClient(-5).client, {
      op: "set.replace", key: "k", member: "a", newMember: "b",
    }), "CONFLICT");
    await expectCode(applyOperation(mutationClient(-1).client, {
      op: "set.add", key: "k", member: "a",
    }), "KEY_NOT_FOUND");
    await expectCode(applyOperation(mutationClient(-6).client, {
      op: "list.delete", key: "k", index: 9, expectedValue: "v",
    }), "INDEX_OUT_OF_RANGE");
    await expectCode(applyOperation(mutationClient(-7).client, {
      op: "list.insert", key: "k", index: 0, expectedLength: 10001, expectedValue: "first", value: "v",
    }), "TOO_LARGE");
    await expectCode(applyOperation(mutationClient(0).client, {
      op: "set.add", key: "k", member: "a",
    }), "NO_OP");
  });

  it("allows stream append/delete only and never emulates edits by recreating entries", async () => {
    await expectCode(applyOperation(mutationClient().client, {
      op: "stream.update", key: "events", id: "1-1", fields: [{ field: "event", value: "changed" }],
    }), "INVALID_INPUT");

    const append = mutationClient("2-1");
    await applyOperation(append.client, {
      op: "stream.add", key: "events", fields: [{ field: "event", value: "created" }],
    });
    expect(append.calls[0].script).toContain("XADD");
    expect(append.calls[0].script).not.toContain("XDEL");
    expect(append.calls[0].script).not.toContain("redis.call('SET'");

    const deletion = mutationClient();
    await applyOperation(deletion.client, { op: "stream.delete", key: "events", id: "1-1" });
    expect(deletion.calls[0].script).toContain("XDEL");
    expect(deletion.calls[0].script).not.toContain("XADD");
    expect(deletion.calls[0].script).not.toContain("redis.call('SET'");
  });
});

describe("operation input validation", () => {
  const invalidCases = [
    [{ op: "unknown", key: "k" }, "INVALID_INPUT"],
    [{ op: "create", key: "", type: "string", value: "v" }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "module", entries: [] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "hash", entries: [] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "hash", entries: [
      { field: "f", value: "1" }, { field: "f", value: "2" },
    ] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "set", entries: [{ member: "m" }, { member: "m" }] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "zset", entries: [{ member: "m", score: 1 }, { member: "m", score: 2 }] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "string", value: "v", ttl: 0 }, "INVALID_INPUT"],
    [{ op: "ttl", key: "k" }, "INVALID_INPUT"],
    [{ op: "string.set", key: "k", expectedValue: "same", value: "same" }, "NO_OP"],
    [{ op: "hash.update", key: "k", field: "f", expectedValue: "same", value: "same" }, "NO_OP"],
    [{ op: "list.update", key: "k", index: -1, expectedValue: "a", value: "b" }, "INVALID_INPUT"],
    [{ op: "list.insert", key: "k", index: 1, expectedLength: 2, value: "x" }, "INVALID_INPUT"],
    [{ op: "list.insert", key: "k", index: 3, expectedLength: 2, value: "x" }, "INDEX_OUT_OF_RANGE"],
    [{ op: "set.replace", key: "k", member: "m", newMember: "m" }, "NO_OP"],
    [{ op: "zset.score", key: "k", member: "m", expectedScore: 1, score: "nan" }, "INVALID_INPUT"],
    [{ op: "zset.score", key: "k", member: "m", expectedScore: "1.0", score: 1 }, "NO_OP"],
    [{ op: "zset.replace", key: "k", member: "m", newMember: "m", expectedScore: 1 }, "NO_OP"],
    [{ op: "stream.add", key: "k", fields: [] }, "INVALID_INPUT"],
    [{ op: "stream.add", key: "k", id: "0-0", fields: [{ field: "f", value: "v" }] }, "INVALID_INPUT"],
    [{ op: "stream.delete", key: "k", id: "*" }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "stream", entries: [
      { id: "2-0", fields: [{ field: "f", value: "v" }] },
      { id: "1-0", fields: [{ field: "f", value: "v" }] },
    ] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "stream", entries: [
      { fields: [{ field: "f", value: "v" }] },
      { id: "1-0", fields: [{ field: "f", value: "v" }] },
    ] }, "INVALID_INPUT"],
    [{ op: "create", key: "k", type: "stream", entries: Array.from({ length: 2 }, () => ({
      fields: Array.from({ length: 600 }, () => ({ field: "f", value: "v" })),
    })) }, "INVALID_INPUT"],
    [{ op: "string.set", key: "k", expectedValue: "v", value: "x".repeat(1_000_001) }, "INVALID_INPUT"],
  ];

  it("rejects invalid and no-op requests before connecting or evaluating Lua", async () => {
    for (const [operation, code] of invalidCases) {
      let connected = false;
      const client = {
        isOpen: false,
        connect: async () => { connected = true; },
        eval: async () => { throw new Error("eval must not run"); },
      };
      await expectCode(applyOperation(client, operation), code);
      expect(connected).toBe(false);
    }
  });

  it("rejects a missing operation object", async () => {
    await expectCode(applyOperation({ isOpen: true }, null), "INVALID_INPUT");
  });
});
