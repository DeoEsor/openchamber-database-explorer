// Redis data layer: logical DB discovery and paginated key/value browsing.
import { createClient } from "redis";

const MAX_SCAN_KEYS = 20_000;
const VALUE_LIMIT = 100_000;

export const open = (dsn) => createClient({
  url: dsn,
  socket: { connectTimeout: 5_000, reconnectStrategy: false },
});

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
    readOnly: true,
    filterColumns: ["key", "type", "ttl"],
    sortColumns: ["key"],
    truncated: scanned.length >= MAX_SCAN_KEYS,
  };
}
