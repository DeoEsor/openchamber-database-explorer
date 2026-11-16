// Redis data layer: logical DB discovery, bounded browsing, and atomic typed edits.
import { createClient } from "redis";

const MAX_SCAN_KEYS = 20_000;
const VALUE_LIMIT = 100_000;
const MAX_READ_ENTRIES = 500;
const MAX_NAME_BYTES = 64 * 1024;
const MAX_VALUE_BYTES = 1_000_000;
const MAX_CREATE_ENTRIES = 1_000;
const MAX_CREATE_BYTES = 4_000_000;
const MAX_LIST_STRUCTURE_ENTRIES = 10_000;
const MAX_LIST_INDEX = 0xffffffff;
const MAX_TTL_SECONDS = 2_147_483_647;
const MAX_STREAM_ID_COMPONENT = 18_446_744_073_709_551_615n;

export const REDIS_TYPES = Object.freeze(["string", "hash", "list", "set", "zset", "stream"]);
const SUPPORTED_TYPES = new Set(REDIS_TYPES);

const ERROR_STATUS_BY_CODE = new Map([
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
]);

export class RedisOperationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RedisOperationError";
    this.code = code;
    this.status = ERROR_STATUS_BY_CODE.get(code) ?? 500;
  }
}

export const open = (dsn) => {
  const client = createClient({
    url: dsn,
    socket: { connectTimeout: 5_000, reconnectStrategy: false },
  });
  // Command promises still reject; this listener prevents an unhandled EventEmitter error.
  client.on("error", () => {});
  return client;
};

async function ensureOpen(client) {
  if (!client.isOpen) await client.connect();
}

export async function ping(client) {
  await ensureOpen(client);
  await client.ping();
}

export async function close(client) {
  if (client.isOpen) await client.close();
}

const COLUMNS = [
  { name: "key", type: "text", nullable: false, pk: true },
  { name: "type", type: "text", nullable: false, pk: false },
  { name: "ttl", type: "bigint", nullable: true, pk: false },
  { name: "value", type: "json", nullable: true, pk: false },
];

export async function introspect(client, database = "0") {
  await ensureOpen(client);
  const size = await client.dbSize();
  return [{
    name: `db${database || "0"}`,
    tables: [{
      name: "keys",
      kind: "keys",
      approxRows: size,
      primaryKey: "key",
      columns: COLUMNS,
    }],
  }];
}

const clipped = (value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return null;
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT)}…` : text;
};

// Legacy grid preview. Dedicated editing uses readKey(), which exposes clipping metadata.
export async function readValue(client, key, type) {
  switch (type) {
    case "string": return clipped(await client.get(key));
    case "hash": return clipped(await client.hGetAll(key));
    case "list": return clipped(await client.lRange(key, 0, 99));
    case "set": return clipped(await client.sMembers(key));
    case "zset": return clipped(await client.zRangeWithScores(key, 0, 99));
    case "stream": return clipped(await client.xRange(key, "-", "+", { COUNT: 100 }));
    default: return `<${type}>`;
  }
}

function matches(key, type, ttl, filter) {
  if (!filter?.col || !filter.op) return true;
  const source = filter.col === "key" ? key : filter.col === "type" ? type : filter.col === "ttl" ? String(ttl) : "";
  const value = String(filter.val ?? "");
  switch (filter.op) {
    case "eq": return source === value;
    case "neq": return source !== value;
    case "gt": return Number(source) > Number(value);
    case "gte": return Number(source) >= Number(value);
    case "lt": return Number(source) < Number(value);
    case "lte": return Number(source) <= Number(value);
    case "contains": return source.toLowerCase().includes(value.toLowerCase());
    case "starts": return source.toLowerCase().startsWith(value.toLowerCase());
    case "isnull": return source === "";
    case "notnull": return source !== "";
    default: return true;
  }
}

async function scanKeys(client) {
  const keys = [];
  for await (const batch of client.scanIterator({ COUNT: 500 })) {
    for (const key of Array.isArray(batch) ? batch : [batch]) {
      keys.push(String(key));
      if (keys.length >= MAX_SCAN_KEYS) return keys;
    }
  }
  return keys;
}

export async function readKeys(client, { offset = 0, limit = 100, desc = false, filter } = {}) {
  await ensureOpen(client);
  limit = Math.max(1, Math.min(500, Number(limit) || 100));
  offset = Math.max(0, Number(offset) || 0);
  const scanned = await scanKeys(client);
  scanned.sort((a, b) => a.localeCompare(b));
  if (desc) scanned.reverse();

  const selected = [];
  for (const key of scanned) {
    if (!filter?.col || filter.col === "value") {
      if (filter?.col === "value") throw new Error("Filtering by Redis value is not supported.");
      selected.push({ key, type: null, ttl: null });
      continue;
    }
    const [type, ttl] = await Promise.all([client.type(key), client.ttl(key)]);
    if (matches(key, type, ttl, filter)) selected.push({ key, type, ttl });
  }
  const page = selected.slice(offset, offset + limit);
  const rows = await Promise.all(page.map(async ({ key, type, ttl }) => {
    type ??= await client.type(key);
    ttl ??= await client.ttl(key);
    return [key, type, String(ttl), await readValue(client, key, type)];
  }));
  return {
    columns: COLUMNS.map((column) => column.name),
    columnMeta: COLUMNS,
    pk: "key",
    rows,
    rowCount: rows.length,
    total: selected.length,
    offset,
    limit,
    order: "key",
    desc: !!desc,
    readOnly: false,
    filterColumns: ["key", "type", "ttl"],
    sortColumns: ["key"],
    truncated: scanned.length >= MAX_SCAN_KEYS,
  };
}

const fail = (code, message) => {
  throw new RedisOperationError(code, message);
};
const invalid = (message) => fail("INVALID_INPUT", message);
const byteLength = (value) => Buffer.byteLength(value, "utf8");

function text(value, label, { empty = true, max = MAX_VALUE_BYTES } = {}) {
  if (typeof value !== "string") invalid(`${label} must be a string.`);
  if (!empty && !value.length) invalid(`${label} is required.`);
  if (byteLength(value) > max) invalid(`${label} exceeds the ${max}-byte limit.`);
  return value;
}

const keyText = (key) => text(key, "Redis key", { empty: false, max: MAX_NAME_BYTES });
const nameText = (value, label = "Member") => text(value, label, { max: MAX_NAME_BYTES });
const valueText = (value, label = "Value") => text(value, label);

function redisType(value) {
  if (typeof value !== "string" || !SUPPORTED_TYPES.has(value)) {
    invalid(`Redis type must be one of: ${REDIS_TYPES.join(", ")}.`);
  }
  return value;
}

function boundedInteger(value, label, { min = 0, max = MAX_LIST_INDEX } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function readOptions(options) {
  const limit = options?.limit ?? 100;
  const valueLimit = options?.valueLimit ?? VALUE_LIMIT;
  boundedInteger(limit, "Read limit", { min: 1, max: MAX_READ_ENTRIES });
  boundedInteger(valueLimit, "Value byte limit", { min: 1, max: MAX_VALUE_BYTES });
  return { limit, valueLimit };
}

function ttlValue(value, optional = true) {
  if (value === null || (optional && value === undefined)) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TTL_SECONDS) {
    invalid(`TTL must be null or an integer between 1 and ${MAX_TTL_SECONDS} seconds.`);
  }
  return value;
}

function scoreText(value, label = "Score") {
  if (typeof value === "number") {
    if (Number.isNaN(value)) invalid(`${label} cannot be NaN.`);
    if (value === Infinity) return "+inf";
    if (value === -Infinity) return "-inf";
    return String(value);
  }
  if (typeof value !== "string" || !value.trim()) invalid(`${label} must be a number or numeric string.`);
  const score = value.trim();
  if (score.length > 64) invalid(`${label} is too long.`);
  const lower = score.toLowerCase();
  if (["inf", "+inf", "infinity", "+infinity"].includes(lower)) return "+inf";
  if (["-inf", "-infinity"].includes(lower)) return "-inf";
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(score) || !Number.isFinite(Number(score))) {
    invalid(`${label} must be a finite number, +inf, or -inf.`);
  }
  return score;
}

const numericScore = (score) => score === "+inf" ? Infinity : score === "-inf" ? -Infinity : Number(score);
const sameScore = (left, right) => numericScore(left) === numericScore(right);

function streamId(value, { allowAuto = true, allowZero = false } = {}) {
  if (value === "*" && allowAuto) return { text: "*", auto: true };
  if (typeof value !== "string" || !/^(\d+)-(\d+)$/.test(value)) {
    invalid(`Stream ID must be ${allowAuto ? '"*" or ' : ""}a milliseconds-sequence ID such as 1710000000000-0.`);
  }
  if (value.length > 64) invalid("Stream ID is too long.");
  const [milliseconds, sequence] = value.split("-").map((part) => BigInt(part));
  if (milliseconds > MAX_STREAM_ID_COMPONENT || sequence > MAX_STREAM_ID_COMPONENT) {
    invalid("Stream ID components exceed the unsigned 64-bit range.");
  }
  if (!allowZero && milliseconds === 0n && sequence === 0n) invalid("Stream ID 0-0 is not valid for XADD.");
  return { text: value, auto: false, milliseconds, sequence };
}

function entriesArray(value, label = "Entries") {
  if (!Array.isArray(value) || !value.length || value.length > MAX_CREATE_ENTRIES) {
    invalid(`${label} must contain between 1 and ${MAX_CREATE_ENTRIES} items.`);
  }
  return value;
}

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} must be an object.`);
  return value;
}

function payloadBudget() {
  let used = 0;
  return (value) => {
    used += byteLength(value);
    if (used > MAX_CREATE_BYTES) invalid(`Mutation payload exceeds the ${MAX_CREATE_BYTES}-byte limit.`);
  };
}

function streamFields(value, budget = () => {}) {
  const fields = entriesArray(value, "Stream fields");
  return fields.map((item) => {
    objectValue(item, "Stream field");
    const field = nameText(item.field, "Stream field");
    const fieldValue = valueText(item.value, "Stream field value");
    budget(field);
    budget(fieldValue);
    return [field, fieldValue];
  });
}

function streamEntries(value, budget) {
  let fieldCount = 0;
  const entries = entriesArray(value, "Stream entries").map((item) => {
    objectValue(item, "Stream entry");
    const id = streamId(item.id ?? "*");
    budget(id.text);
    const fields = streamFields(item.fields, budget);
    fieldCount += fields.length;
    if (fieldCount > MAX_CREATE_ENTRIES) invalid(`Stream creation is limited to ${MAX_CREATE_ENTRIES} total fields.`);
    return { id, fields };
  });
  const automatic = entries.filter((entry) => entry.id.auto).length;
  if (automatic && automatic !== entries.length) {
    invalid("Stream creation cannot mix automatic and explicit IDs.");
  }
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1].id;
    const current = entries[index].id;
    if (!current.auto && (current.milliseconds < previous.milliseconds ||
      (current.milliseconds === previous.milliseconds && current.sequence <= previous.sequence))) {
      invalid("Explicit stream IDs must be strictly increasing.");
    }
  }
  return entries;
}

function clipText(value, limit) {
  const source = String(value);
  const totalLength = byteLength(source);
  if (totalLength <= limit) {
    return { text: source, truncated: false, totalLength, returnedLength: totalLength };
  }
  let end = 0;
  let returnedLength = 0;
  for (const character of source) {
    const size = byteLength(character);
    if (returnedLength + size > limit) break;
    returnedLength += size;
    end += character.length;
  }
  return { text: source.slice(0, end), truncated: true, totalLength, returnedLength };
}

function fieldValueEntry(field, value, limit) {
  const clippedField = clipText(field, limit);
  const clippedValue = clipText(value, limit);
  return {
    field: clippedField.text,
    value: clippedValue.text,
    truncated: clippedField.truncated || clippedValue.truncated,
    ...(clippedField.truncated ? {
      fieldLength: clippedField.totalLength,
      fieldReturnedLength: clippedField.returnedLength,
    } : {}),
    ...(clippedValue.truncated ? {
      valueLength: clippedValue.totalLength,
      valueReturnedLength: clippedValue.returnedLength,
    } : {}),
  };
}

function valueEntry(value, limit, index) {
  const clippedValue = clipText(value, limit);
  return {
    ...(index === undefined ? {} : { index }),
    value: clippedValue.text,
    truncated: clippedValue.truncated,
    ...(clippedValue.truncated ? {
      valueLength: clippedValue.totalLength,
      valueReturnedLength: clippedValue.returnedLength,
    } : {}),
  };
}

function memberEntry(member, limit, score) {
  const clippedMember = clipText(member, limit);
  return {
    member: clippedMember.text,
    ...(score === undefined ? {} : { score }),
    truncated: clippedMember.truncated,
    ...(clippedMember.truncated ? {
      memberLength: clippedMember.totalLength,
      memberReturnedLength: clippedMember.returnedLength,
    } : {}),
  };
}

function collectionRead(type, entries, total, entriesTruncated) {
  const valuesTruncated = entries.filter((entry) => entry.truncated).length;
  const truncated = entriesTruncated || valuesTruncated > 0;
  return {
    entries,
    total,
    returned: entries.length,
    entriesTruncated,
    valuesTruncated,
    truncated,
    // Streams are append/delete only; all other partial values are deliberately not writable.
    writable: type !== "stream" && !truncated,
  };
}

const STRING_PREFIX_SCRIPT = `-- redis.string.prefix
local limit = tonumber(ARGV[1])
local value = redis.call('GETRANGE', KEYS[1], 0, limit + 2)
local index = 1
local last = 0
while index <= limit and index <= #value do
  local first = string.byte(value, index)
  local size = 1
  if first >= 240 then size = 4 elseif first >= 224 then size = 3 elseif first >= 192 then size = 2 end
  if index + size - 1 > limit or index + size - 1 > #value then break end
  last = index + size - 1
  index = index + size
end
return {string.sub(value, 1, last), last}`;

async function readString(client, key, valueLimit) {
  const totalBytes = await client.strLen(key);
  const truncated = totalBytes > valueLimit;
  let value = "";
  let returnedBytes = 0;
  if (!truncated && totalBytes) {
    value = await client.getRange(key, 0, totalBytes - 1);
    returnedBytes = totalBytes;
  } else if (truncated) {
    // Inspect raw bytes server-side: client UTF-8 decoders differ on incomplete trailing sequences.
    const reply = await client.eval(STRING_PREFIX_SCRIPT, { keys: [key], arguments: [String(valueLimit)] });
    value = reply[0];
    returnedBytes = Number(reply[1]);
  }
  return {
    value: value ?? "",
    total: 1,
    returned: 1,
    entriesTruncated: false,
    valuesTruncated: truncated ? 1 : 0,
    valueLength: totalBytes,
    valueReturnedLength: returnedBytes,
    truncated,
    writable: !truncated,
  };
}

async function readHash(client, key, limit, valueLimit) {
  const total = await client.hLen(key);
  const entries = [];
  let stoppedEarly = false;
  if (total) {
    for await (const batch of client.hScanIterator(key, { COUNT: Math.max(100, limit) })) {
      for (const entry of batch) {
        if (entries.length < limit) entries.push(fieldValueEntry(String(entry.field), String(entry.value), valueLimit));
      }
      if (entries.length >= limit && entries.length < total) {
        stoppedEarly = true;
        break;
      }
    }
  }
  return collectionRead("hash", entries, total, stoppedEarly || entries.length < total);
}

async function readList(client, key, limit, valueLimit) {
  const [total, values] = await Promise.all([
    client.lLen(key),
    client.lRange(key, 0, limit - 1),
  ]);
  const entries = values.map((value, index) => valueEntry(String(value), valueLimit, index));
  return collectionRead("list", entries, total, entries.length < total);
}

async function readSet(client, key, limit, valueLimit) {
  const total = await client.sCard(key);
  const entries = [];
  let stoppedEarly = false;
  if (total) {
    for await (const batch of client.sScanIterator(key, { COUNT: Math.max(100, limit) })) {
      for (const member of batch) {
        if (entries.length < limit) entries.push(memberEntry(String(member), valueLimit));
      }
      if (entries.length >= limit && entries.length < total) {
        stoppedEarly = true;
        break;
      }
    }
  }
  return collectionRead("set", entries, total, stoppedEarly || entries.length < total);
}

async function readZset(client, key, limit, valueLimit) {
  const [total, values] = await Promise.all([
    client.zCard(key),
    client.zRangeWithScores(key, 0, limit - 1),
  ]);
  const entries = values.map((entry) => memberEntry(String(entry.value), valueLimit, scoreText(entry.score)));
  return collectionRead("zset", entries, total, entries.length < total);
}

async function readStream(client, key, limit, valueLimit) {
  const [total, messages] = await Promise.all([
    client.xLen(key),
    client.xRange(key, "-", "+", { COUNT: limit }),
  ]);
  const entries = (messages ?? []).map((message) => {
    const source = message.message instanceof Map
      ? [...message.message.entries()]
      : Object.entries(message.message ?? {});
    const fields = source.map(([field, value]) => fieldValueEntry(String(field), String(value), valueLimit));
    return { id: String(message.id), fields, truncated: fields.some((field) => field.truncated) };
  });
  return collectionRead("stream", entries, total, entries.length < total);
}

/**
 * Read an editor-safe snapshot. `truncated` includes both missing entries and clipped text;
 * `writable` is never true for partial content. String lengths are UTF-8 byte counts.
 */
export async function readKey(client, options = {}) {
  const key = keyText(options?.key);
  const requestedType = options?.type === undefined ? null : redisType(options.type);
  const { limit, valueLimit } = readOptions(options);
  await ensureOpen(client);
  const actualType = await client.type(key);
  if (actualType === "none") fail("KEY_NOT_FOUND", "Redis key not found.");
  if (requestedType && actualType !== requestedType) {
    fail("TYPE_MISMATCH", `Expected ${requestedType}, but Redis reports ${actualType}.`);
  }
  if (!SUPPORTED_TYPES.has(actualType)) fail("UNSUPPORTED_TYPE", `Redis type ${actualType} is not supported.`);

  const [ttl, data] = await Promise.all([
    client.ttl(key),
    actualType === "string" ? readString(client, key, valueLimit)
      : actualType === "hash" ? readHash(client, key, limit, valueLimit)
        : actualType === "list" ? readList(client, key, limit, valueLimit)
          : actualType === "set" ? readSet(client, key, limit, valueLimit)
            : actualType === "zset" ? readZset(client, key, limit, valueLimit)
              : readStream(client, key, limit, valueLimit),
  ]);
  if (ttl === -2) fail("KEY_NOT_FOUND", "Redis key expired or was deleted while reading.");
  return { key, type: actualType, ttl, ...data };
}

const CREATE_SCRIPT = `-- redis.create
if redis.call('EXISTS', KEYS[1]) ~= 0 then return -5 end
local kind = ARGV[1]
local ttl = tonumber(ARGV[2])
local payload = cjson.decode(ARGV[3])
if kind == 'string' then
  redis.call('SET', KEYS[1], payload)
elseif kind == 'hash' then
  for _, pair in ipairs(payload) do redis.call('HSET', KEYS[1], pair[1], pair[2]) end
elseif kind == 'list' then
  for _, value in ipairs(payload) do redis.call('RPUSH', KEYS[1], value) end
elseif kind == 'set' then
  for _, member in ipairs(payload) do redis.call('SADD', KEYS[1], member) end
elseif kind == 'zset' then
  for _, pair in ipairs(payload) do redis.call('ZADD', KEYS[1], pair[2], pair[1]) end
elseif kind == 'stream' then
  for _, entry in ipairs(payload) do
    local command = {'XADD', KEYS[1], entry[1]}
    for _, pair in ipairs(entry[2]) do
      table.insert(command, pair[1])
      table.insert(command, pair[2])
    end
    redis.call(unpack(command))
  end
else
  return -9
end
if ttl and ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
return 1`;

const TTL_SCRIPT = `-- redis.ttl
if redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local ttl = tonumber(ARGV[1])
if ttl == 0 then
  if redis.call('TTL', KEYS[1]) == -1 then return -8 end
  redis.call('PERSIST', KEYS[1])
else
  redis.call('EXPIRE', KEYS[1], ttl)
end
return 1`;

const TYPE_HELPER = `local kind = redis.call('TYPE', KEYS[1])
if type(kind) == 'table' then kind = kind['ok'] end
if kind == 'none' then return -1 end
if kind ~= EXPECTED then return -2 end`;
const typedScript = (marker, expected, body) => `-- ${marker}\n${TYPE_HELPER.replace("EXPECTED", `'${expected}'`)}\n${body}`;

const STRING_SET_SCRIPT = typedScript("redis.string.set", "string", `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then return -3 end
redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
return 1`);

const HASH_ADD_SCRIPT = typedScript("redis.hash.add", "hash", `
if redis.call('HSETNX', KEYS[1], ARGV[1], ARGV[2]) == 0 then return -5 end
return 1`);
const HASH_UPDATE_SCRIPT = typedScript("redis.hash.update", "hash", `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then return -4 end
if current ~= ARGV[2] then return -3 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1`);
const HASH_DELETE_SCRIPT = typedScript("redis.hash.delete", "hash", `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then return -4 end
if current ~= ARGV[2] then return -3 end
redis.call('HDEL', KEYS[1], ARGV[1])
return 1`);

const LIST_UPDATE_SCRIPT = typedScript("redis.list.update", "list", `
local current = redis.call('LINDEX', KEYS[1], ARGV[1])
if not current then return -6 end
if current ~= ARGV[2] then return -3 end
redis.call('LSET', KEYS[1], ARGV[1], ARGV[3])
return 1`);
const LIST_INSERT_SCRIPT = typedScript("redis.list.insert", "list", `
local length = redis.call('LLEN', KEYS[1])
local index = tonumber(ARGV[1])
if length ~= tonumber(ARGV[3]) then return -3 end
if index > length then return -6 end
if length > ${MAX_LIST_STRUCTURE_ENTRIES} then return -7 end
if index < length then
  if ARGV[4] ~= '1' then return -3 end
  local current = redis.call('LINDEX', KEYS[1], index)
  if current ~= ARGV[5] then return -3 end
end
if index == length then redis.call('RPUSH', KEYS[1], ARGV[2]) return 1 end
if index == 0 then redis.call('LPUSH', KEYS[1], ARGV[2]) return 1 end
if index * 2 <= (length - index) * 2 + 1 then
  for _ = 1, index do redis.call('LMOVE', KEYS[1], KEYS[1], 'LEFT', 'RIGHT') end
  redis.call('LPUSH', KEYS[1], ARGV[2])
  for _ = 1, index do redis.call('LMOVE', KEYS[1], KEYS[1], 'RIGHT', 'LEFT') end
else
  local rotations = length - index
  for _ = 1, rotations do redis.call('LMOVE', KEYS[1], KEYS[1], 'RIGHT', 'LEFT') end
  redis.call('LPUSH', KEYS[1], ARGV[2])
  for _ = 1, rotations + 1 do redis.call('LMOVE', KEYS[1], KEYS[1], 'LEFT', 'RIGHT') end
end
return 1`);
const LIST_DELETE_SCRIPT = typedScript("redis.list.delete", "list", `
local length = redis.call('LLEN', KEYS[1])
local index = tonumber(ARGV[1])
if index >= length then return -6 end
local current = redis.call('LINDEX', KEYS[1], index)
if current ~= ARGV[2] then return -3 end
if length > ${MAX_LIST_STRUCTURE_ENTRIES} then return -7 end
if index == 0 then redis.call('LPOP', KEYS[1]) return 1 end
if index == length - 1 then redis.call('RPOP', KEYS[1]) return 1 end
if index <= length - 1 - index then
  for _ = 1, index do redis.call('LMOVE', KEYS[1], KEYS[1], 'LEFT', 'RIGHT') end
  redis.call('LPOP', KEYS[1])
  for _ = 1, index do redis.call('LMOVE', KEYS[1], KEYS[1], 'RIGHT', 'LEFT') end
else
  local rotations = length - 1 - index
  for _ = 1, rotations do redis.call('LMOVE', KEYS[1], KEYS[1], 'RIGHT', 'LEFT') end
  redis.call('RPOP', KEYS[1])
  for _ = 1, rotations do redis.call('LMOVE', KEYS[1], KEYS[1], 'LEFT', 'RIGHT') end
end
return 1`);

const SET_ADD_SCRIPT = typedScript("redis.set.add", "set", `
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return -5 end
return 1`);
const SET_REMOVE_SCRIPT = typedScript("redis.set.remove", "set", `
if redis.call('SREM', KEYS[1], ARGV[1]) == 0 then return -4 end
return 1`);
const SET_REPLACE_SCRIPT = typedScript("redis.set.replace", "set", `
if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 0 then return -4 end
if redis.call('SISMEMBER', KEYS[1], ARGV[2]) == 1 then return -5 end
redis.call('SADD', KEYS[1], ARGV[2])
redis.call('SREM', KEYS[1], ARGV[1])
return 1`);

const SCORE_HELPER = `local function as_score(value)
  local lower = string.lower(value)
  if lower == 'inf' or lower == '+inf' then return math.huge end
  if lower == '-inf' then return -math.huge end
  return tonumber(value)
end`;
const ZSET_ADD_SCRIPT = typedScript("redis.zset.add", "zset", `
if redis.call('ZADD', KEYS[1], 'NX', ARGV[2], ARGV[1]) == 0 then return -5 end
return 1`);
const ZSET_SCORE_SCRIPT = typedScript("redis.zset.score", "zset", `${SCORE_HELPER}
local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not current then return -4 end
if as_score(current) ~= as_score(ARGV[3]) then return -3 end
redis.call('ZADD', KEYS[1], 'XX', ARGV[2], ARGV[1])
return 1`);
const ZSET_REPLACE_SCRIPT = typedScript("redis.zset.replace", "zset", `${SCORE_HELPER}
local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not current then return -4 end
if as_score(current) ~= as_score(ARGV[3]) then return -3 end
if ARGV[1] == ARGV[2] then return -8 end
if redis.call('ZSCORE', KEYS[1], ARGV[2]) then return -5 end
local next_score = ARGV[4]
if next_score == '' then next_score = current end
redis.call('ZADD', KEYS[1], next_score, ARGV[2])
redis.call('ZREM', KEYS[1], ARGV[1])
return 1`);
const ZSET_REMOVE_SCRIPT = typedScript("redis.zset.remove", "zset", `${SCORE_HELPER}
local current = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not current then return -4 end
if as_score(current) ~= as_score(ARGV[2]) then return -3 end
redis.call('ZREM', KEYS[1], ARGV[1])
return 1`);

const STREAM_ADD_SCRIPT = typedScript("redis.stream.add", "stream", `
local command = {'XADD', KEYS[1], ARGV[1]}
for index = 2, #ARGV, 2 do
  table.insert(command, ARGV[index])
  table.insert(command, ARGV[index + 1])
end
return redis.call(unpack(command))`);
const STREAM_DELETE_SCRIPT = typedScript("redis.stream.delete", "stream", `
if redis.call('XDEL', KEYS[1], ARGV[1]) == 0 then return -4 end
return 1`);

async function runLua(client, script, key, args, { type, subject = "Key", errors = {} } = {}) {
  const reply = await client.eval(script, { keys: [key], arguments: args });
  const numeric = typeof reply === "number" ? reply : typeof reply === "bigint" ? Number(reply) : null;
  if (numeric !== null && numeric < 0) {
    const defaults = {
      [-1]: ["KEY_NOT_FOUND", "Redis key not found. Refresh and retry."],
      [-2]: ["TYPE_MISMATCH", `Expected a ${type} key. Refresh and retry.`],
      [-3]: ["CONFLICT", `${subject} changed or does not match the expected original value. Refresh and retry.`],
      [-4]: ["NOT_FOUND", `${subject} not found. Refresh and retry.`],
      [-5]: ["CONFLICT", `${subject} already exists.`],
      [-6]: ["INDEX_OUT_OF_RANGE", "List index is out of range."],
      [-7]: ["TOO_LARGE", `List structural edits are limited to ${MAX_LIST_STRUCTURE_ENTRIES} entries.`],
      [-8]: ["NO_OP", "The requested operation would not change Redis data."],
      [-9]: ["INVALID_INPUT", "Redis rejected the validated operation shape."],
    };
    const [code, message] = errors[numeric] ?? defaults[numeric] ?? ["INVALID_INPUT", "Redis mutation failed."];
    fail(code, message);
  }
  if (reply === null || numeric === 0) fail("NO_OP", "Redis returned no mutation result.");
  return reply;
}

function luaPrepared(operation, type, script, args, options = {}) {
  return async (client) => {
    const reply = await runLua(client, script, operation.key, args, { type, ...options });
    const result = { ok: true, op: operation.op, key: operation.key, type, affected: 1 };
    if (operation.op === "stream.add") result.id = String(reply);
    return result;
  };
}

function prepareCreate(operation) {
  const key = keyText(operation.key);
  const type = redisType(operation.type);
  const ttl = ttlValue(operation.ttl);
  const budget = payloadBudget();
  let payload;
  let affected = 1;

  if (type === "string") {
    payload = valueText(operation.value);
    budget(payload);
  } else if (type === "hash") {
    const fields = new Set();
    payload = entriesArray(operation.entries).map((item) => {
      objectValue(item, "Hash entry");
      const field = nameText(item.field, "Hash field");
      const value = valueText(item.value, "Hash field value");
      if (fields.has(field)) invalid("Hash creation contains a duplicate field.");
      fields.add(field);
      budget(field);
      budget(value);
      return [field, value];
    });
  } else if (type === "list") {
    payload = entriesArray(operation.entries).map((item) => {
      objectValue(item, "List entry");
      const value = valueText(item.value, "List value");
      budget(value);
      return value;
    });
  } else if (type === "set") {
    const members = new Set();
    payload = entriesArray(operation.entries).map((item) => {
      objectValue(item, "Set entry");
      const member = nameText(item.member);
      if (members.has(member)) invalid("Set creation contains a duplicate member.");
      members.add(member);
      budget(member);
      return member;
    });
  } else if (type === "zset") {
    const members = new Set();
    payload = entriesArray(operation.entries).map((item) => {
      objectValue(item, "Sorted-set entry");
      const member = nameText(item.member);
      const score = scoreText(item.score);
      if (members.has(member)) invalid("Sorted-set creation contains a duplicate member.");
      members.add(member);
      budget(member);
      budget(score);
      return [member, score];
    });
  } else {
    payload = streamEntries(operation.entries, budget).map((entry) => [entry.id.text, entry.fields]);
  }
  if (type !== "string") affected = payload.length;

  return async (client) => {
    await runLua(client, CREATE_SCRIPT, key, [type, String(ttl ?? 0), JSON.stringify(payload)], {
      subject: "Redis key",
      errors: { [-5]: ["KEY_EXISTS", "Redis key already exists."] },
    });
    return { ok: true, op: "create", key, type, ttl, affected };
  };
}

function prepareOperation(operation) {
  objectValue(operation, "Operation");
  if (typeof operation.op !== "string") invalid("Operation op is required.");
  if (operation.op === "create") return prepareCreate(operation);

  const key = keyText(operation.key);
  if (operation.op === "delete") {
    return async (client) => {
      const affected = await client.del(key);
      if (affected !== 1) fail("KEY_NOT_FOUND", "Redis key not found. Refresh and retry.");
      return { ok: true, op: "delete", key, affected: 1 };
    };
  }
  if (operation.op === "ttl") {
    if (!Object.prototype.hasOwnProperty.call(operation, "ttl")) invalid("TTL operation requires ttl (null removes expiry).");
    const ttl = ttlValue(operation.ttl, false);
    return async (client) => {
      await runLua(client, TTL_SCRIPT, key, [String(ttl ?? 0)], {
        errors: { [-8]: ["NO_OP", "Redis key already has no expiration."] },
      });
      return { ok: true, op: "ttl", key, ttl, affected: 1 };
    };
  }

  const prepared = { op: operation.op, key };
  switch (operation.op) {
    case "string.set": {
      const expectedValue = valueText(operation.expectedValue, "Expected string value");
      const value = valueText(operation.value);
      if (value === expectedValue) fail("NO_OP", "String value is unchanged.");
      return luaPrepared(prepared, "string", STRING_SET_SCRIPT, [expectedValue, value], { subject: "String value" });
    }
    case "hash.add": {
      const field = nameText(operation.field, "Hash field");
      const value = valueText(operation.value, "Hash field value");
      return luaPrepared(prepared, "hash", HASH_ADD_SCRIPT, [field, value], { subject: "Hash field" });
    }
    case "hash.update": {
      const field = nameText(operation.field, "Hash field");
      const expectedValue = valueText(operation.expectedValue, "Expected hash value");
      const value = valueText(operation.value, "Hash field value");
      if (value === expectedValue) fail("NO_OP", "Hash field value is unchanged.");
      return luaPrepared(prepared, "hash", HASH_UPDATE_SCRIPT, [field, expectedValue, value], { subject: "Hash field" });
    }
    case "hash.delete": {
      const field = nameText(operation.field, "Hash field");
      const expectedValue = valueText(operation.expectedValue, "Expected hash value");
      return luaPrepared(prepared, "hash", HASH_DELETE_SCRIPT, [field, expectedValue], { subject: "Hash field" });
    }
    case "list.update": {
      const index = boundedInteger(operation.index, "List index");
      const expectedValue = valueText(operation.expectedValue, "Expected list value");
      const value = valueText(operation.value, "List value");
      if (value === expectedValue) fail("NO_OP", "List value is unchanged.");
      return luaPrepared(prepared, "list", LIST_UPDATE_SCRIPT, [String(index), expectedValue, value], { subject: "List value" });
    }
    case "list.insert": {
      const index = boundedInteger(operation.index, "List index");
      const expectedLength = boundedInteger(operation.expectedLength, "Expected list length");
      const value = valueText(operation.value, "List value");
      if (index > expectedLength) fail("INDEX_OUT_OF_RANGE", "List insertion index exceeds the expected length.");
      const expectedValue = index < expectedLength
        ? valueText(operation.expectedValue, "Expected list pivot value")
        : "";
      return luaPrepared(prepared, "list", LIST_INSERT_SCRIPT, [
        String(index), value, String(expectedLength), index < expectedLength ? "1" : "0", expectedValue,
      ], { subject: "List" });
    }
    case "list.delete": {
      const index = boundedInteger(operation.index, "List index");
      const expectedValue = valueText(operation.expectedValue, "Expected list value");
      return luaPrepared(prepared, "list", LIST_DELETE_SCRIPT, [String(index), expectedValue], { subject: "List value" });
    }
    case "set.add":
      return luaPrepared(prepared, "set", SET_ADD_SCRIPT, [nameText(operation.member)], { subject: "Set member" });
    case "set.remove":
      return luaPrepared(prepared, "set", SET_REMOVE_SCRIPT, [nameText(operation.member)], { subject: "Set member" });
    case "set.replace": {
      const member = nameText(operation.member);
      const newMember = nameText(operation.newMember, "New set member");
      if (member === newMember) fail("NO_OP", "Set member is unchanged.");
      return luaPrepared(prepared, "set", SET_REPLACE_SCRIPT, [member, newMember], { subject: "Set member" });
    }
    case "zset.add": {
      const member = nameText(operation.member);
      const score = scoreText(operation.score);
      return luaPrepared(prepared, "zset", ZSET_ADD_SCRIPT, [member, score], { subject: "Sorted-set member" });
    }
    case "zset.score": {
      const member = nameText(operation.member);
      const score = scoreText(operation.score);
      const expectedScore = scoreText(operation.expectedScore, "Expected score");
      if (sameScore(score, expectedScore)) fail("NO_OP", "Sorted-set score is unchanged.");
      return luaPrepared(prepared, "zset", ZSET_SCORE_SCRIPT, [member, score, expectedScore], { subject: "Sorted-set member" });
    }
    case "zset.replace": {
      const member = nameText(operation.member);
      const newMember = nameText(operation.newMember, "New sorted-set member");
      const expectedScore = scoreText(operation.expectedScore, "Expected score");
      const score = operation.score === undefined ? "" : scoreText(operation.score);
      if (member === newMember) fail("NO_OP", "Use zset.score to change a score without renaming the member.");
      return luaPrepared(prepared, "zset", ZSET_REPLACE_SCRIPT, [member, newMember, expectedScore, score], { subject: "Sorted-set member" });
    }
    case "zset.remove": {
      const member = nameText(operation.member);
      const expectedScore = scoreText(operation.expectedScore, "Expected score");
      return luaPrepared(prepared, "zset", ZSET_REMOVE_SCRIPT, [member, expectedScore], { subject: "Sorted-set member" });
    }
    case "stream.add": {
      const id = streamId(operation.id ?? "*");
      const budget = payloadBudget();
      const fields = streamFields(operation.fields, budget);
      budget(id.text);
      return luaPrepared(prepared, "stream", STREAM_ADD_SCRIPT, [id.text, ...fields.flat()], { subject: "Stream entry" });
    }
    case "stream.delete": {
      const id = streamId(operation.id, { allowAuto: false, allowZero: true });
      return luaPrepared(prepared, "stream", STREAM_DELETE_SCRIPT, [id.text], { subject: "Stream entry" });
    }
    default:
      invalid(`Unsupported Redis operation: ${operation.op}.`);
  }
}

/** Apply one validated operation. Multi-command checks and writes execute in one Lua script. */
export async function applyOperation(client, operation) {
  const prepared = prepareOperation(operation);
  await ensureOpen(client);
  return prepared(client);
}
