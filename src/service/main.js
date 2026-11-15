// DB Connect service: localhost HTTP bridge to PostgreSQL, MongoDB and Redis.
// Spawned by OpenChamber with OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN.
import http from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as db from "./db.js";
import * as mongo from "./mongo.js";
import * as redis from "./redis.js";

const PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT ?? 0);
const TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN ?? "";
const DATA_DIR = process.env.OPENCHAMBER_DB_DATA_DIR ?? join(homedir(), ".config", "openchamber", "db-connect");
const CONNECTIONS_FILE = join(DATA_DIR, "connections.json");
const HISTORY_FILE = join(DATA_DIR, "history.json");
const HISTORY_LIMIT = 50;

// ---------- persistence ----------

let connections = [];
let history = [];

function loadJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  try {
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
  } catch (error) {
    console.error("save failed:", error?.message ?? error);
  }
}

function persist() {
  saveJson(CONNECTIONS_FILE, { list: connections });
}

function persistHistory() {
  saveJson(HISTORY_FILE, { list: history });
}

function slug(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24) || "conn";
  let id = base;
  let n = 1;
  while (connections.some((c) => c.id === id)) id = `${base}-${++n}`;
  return id;
}

const PROTOCOLS = {
  postgres: ["postgres:", "postgresql:"],
  mongodb: ["mongodb:", "mongodb+srv:"],
  redis: ["redis:", "rediss:"],
};
const DEFAULT_PORTS = { postgres: "5432", mongodb: "27017", redis: "6379" };

function connectionKind(c) {
  if (PROTOCOLS[c?.kind]) return c.kind;
  try {
    const protocol = new URL(c?.dsn).protocol;
    return Object.keys(PROTOCOLS).find((kind) => PROTOCOLS[kind].includes(protocol)) ?? "postgres";
  } catch {
    return "postgres";
  }
}

function connectionFor(id) {
  const c = id ? connections.find((item) => item.id === id) : connections[0];
  if (!c) {
    if (id) throw new Error("Connection not found.");
    throw new Error("No connections configured. Add one in the panel.");
  }
  return c;
}

function connectionMeta(c) {
  const kind = connectionKind(c);
  let host = "";
  let port = DEFAULT_PORTS[kind];
  let database = "";
  try {
    const url = new URL(c.dsn);
    host = url.hostname;
    port = url.port || DEFAULT_PORTS[kind];
    database = url.pathname.replace(/^\//, "");
    if (kind === "redis") database ||= "0";
  } catch {
    // keep blanks
  }
  return { id: c.id, name: c.name, kind, host, port, database };
}

function assertDsn(kind, dsn) {
  if (!PROTOCOLS[kind]) throw new Error("Select PostgreSQL, MongoDB, or Redis.");
  let url;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error("Invalid DSN.");
  }
  if (!PROTOCOLS[kind].includes(url.protocol)) throw new Error(`DSN does not match the ${kind} connection type.`);
}

const pools = new Map();
const mongoClients = new Map();
const redisClients = new Map();

function poolFor(id) {
  const c = connectionFor(id);
  if (connectionKind(c) !== "postgres") throw new Error("This action is only available for PostgreSQL.");
  if (!pools.has(c.id)) pools.set(c.id, db.open(c.dsn));
  return pools.get(c.id);
}

function mongoFor(id) {
  const c = connectionFor(id);
  if (connectionKind(c) !== "mongodb") throw new Error("The selected connection is not a MongoDB connection.");
  if (!mongoClients.has(c.id)) mongoClients.set(c.id, mongo.open(c.dsn));
  return mongoClients.get(c.id);
}

function redisFor(id) {
  const c = connectionFor(id);
  if (connectionKind(c) !== "redis") throw new Error("The selected connection is not a Redis connection.");
  if (!redisClients.has(c.id)) redisClients.set(c.id, redis.open(c.dsn));
  return redisClients.get(c.id);
}

async function probeConnection(kind, dsn) {
  const handle = kind === "postgres" ? db.open(dsn) : kind === "mongodb" ? mongo.open(dsn) : redis.open(dsn);
  try {
    if (kind === "postgres") await db.ping(handle);
    else if (kind === "mongodb") await mongo.ping(handle);
    else await redis.ping(handle);
  } finally {
    if (kind === "postgres") await handle.end({ timeout: 2 }).catch(() => {});
    else if (kind === "mongodb") await mongo.close(handle).catch(() => {});
    else await redis.close(handle).catch(() => {});
  }
}

async function closeConnection(id) {
  const pool = pools.get(id);
  pools.delete(id);
  if (pool) await pool.end({ timeout: 2 }).catch(() => {});
  const mongoClient = mongoClients.get(id);
  mongoClients.delete(id);
  if (mongoClient) await mongo.close(mongoClient).catch(() => {});
  const redisClient = redisClients.get(id);
  redisClients.delete(id);
  if (redisClient) await redis.close(redisClient).catch(() => {});
}

async function closePools() {
  await Promise.allSettled([...pools.values()].map((sql) => sql.end({ timeout: 3 })));
  await Promise.allSettled([...mongoClients.values()].map((client) => mongo.close(client)));
  await Promise.allSettled([...redisClients.values()].map((client) => redis.close(client)));
  pools.clear();
  mongoClients.clear();
  redisClients.clear();
}

function remember(sql, kind) {
  const item = { sql: String(sql).slice(0, 4000), kind, at: new Date().toISOString() };
  history = [item, ...history.filter((h) => h.sql !== item.sql)].slice(0, HISTORY_LIMIT);
  persistHistory();
}

// ---------- init ----------

mkdirSync(DATA_DIR, { recursive: true });
const storedConns = loadJson(CONNECTIONS_FILE, null);
connections = Array.isArray(storedConns?.list)
  ? storedConns.list.filter((c) => c && c.id && c.dsn)
  : [];
for (const c of connections) {
  c.kind = connectionKind(c);
}
persist();
history = Array.isArray(loadJson(HISTORY_FILE, null)?.list) ? loadJson(HISTORY_FILE, { list: [] }).list : [];

// ---------- routing ----------

const SELECTISH = /^(select|with|explain|table|show|values)\b/i;

function send(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

const fail = (res, status, message) => send(res, status, { error: String(message).slice(0, 500) });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request body exceeds 1 MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON in request body."));
      }
    });
    req.on("error", reject);
  });
}

const int = (v, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

const noQuery = (v) => !v || !String(v).trim();

async function handle(req, res, url, body) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;
  const t0 = Date.now();
  const timed = (value) => send(res, 200, { ...value, ms: Date.now() - t0 });

  if (path === "/health") return timed({ ok: true });

  if (path === "/connections" && req.method === "GET") {
    return timed({ connections: connections.map(connectionMeta) });
  }

  if (path === "/connections" && req.method === "POST") {
    const { name, dsn } = body ?? {};
    const kind = String(body?.kind ?? "postgres");
    if (noQuery(name) || noQuery(dsn)) return fail(res, 400, "Name and DSN are required.");
    try {
      assertDsn(kind, String(dsn));
      await probeConnection(kind, String(dsn));
    } catch (error) {
      return fail(res, 400, `Connection failed: ${error.message}`);
    }
    const c = { id: slug(name), name: String(name).slice(0, 60), kind, dsn: String(dsn) };
    connections.push(c);
    persist();
    return timed({ ok: true, connection: connectionMeta(c) });
  }

  if (path === "/connections" && req.method === "DELETE") {
    const id = q.get("id") ?? body?.id;
    const c = connections.find((x) => x.id === id);
    if (!c) return fail(res, 404, "Connection not found.");
    connections = connections.filter((x) => x.id !== id);
    persist();
    await closeConnection(c.id);
    return timed({ ok: true });
  }

  if (path === "/introspect" && req.method === "GET") {
    const id = q.get("connection") ?? undefined;
    const c = connectionFor(id);
    const kind = connectionKind(c);
    if (kind === "mongodb") return timed({ schemas: await mongo.introspect(mongoFor(id), connectionMeta(c).database) });
    if (kind === "redis") return timed({ schemas: await redis.introspect(redisFor(id), connectionMeta(c).database) });
    return timed({ schemas: await db.introspect(poolFor(id)) });
  }

  if (path === "/table" && req.method === "GET") {
    const { schema, table } = Object.fromEntries(q);
    if (noQuery(schema) || noQuery(table)) return fail(res, 400, "Both schema and table are required.");
    const id = q.get("connection") ?? undefined;
    const c = connectionFor(id);
    const kind = connectionKind(c);
    const filterCol = q.get("filterCol");
    const options = {
      schema,
      table,
      offset: int(q.get("offset"), 0),
      limit: int(q.get("limit"), 100),
      order: q.get("order") || undefined,
      desc: q.get("desc") === "1" || q.get("desc") === "true",
      filter: filterCol ? { col: filterCol, op: q.get("filterOp") || "eq", val: q.get("filterVal") ?? "" } : undefined,
    };
    if (kind === "mongodb") return timed(await mongo.readCollection(mongoFor(id), options));
    if (kind === "redis") return timed(await redis.readKeys(redisFor(id), options));
    return timed(await db.readTable(poolFor(id), options));
  }

  if (path === "/query" && req.method === "POST") {
    const { connection, sql: query, limit } = body ?? {};
    if (noQuery(query)) return fail(res, 400, "SQL query cannot be empty.");
    const pool = poolFor(connection);
    const result = await db.readOnlyQuery(pool, String(query), Math.max(1, Math.min(500, int(limit, 100))));
    remember(query, "query");
    return timed(result);
  }

  if (path === "/execute" && req.method === "POST") {
    const { connection, sql: query } = body ?? {};
    if (noQuery(query)) return fail(res, 400, "SQL query cannot be empty.");
    db.assertSingleStatement(query);
    if (SELECTISH.test(String(query).trim())) {
      return fail(res, 400, "This is a SELECT-like query—it will run in safe mode. Simply click “Run” without making any changes.");
    }
    const pool = poolFor(connection);
    const result = await db.execute(pool, String(query));
    remember(query, "execute");
    return timed(result);
  }

  if (path === "/cell" && req.method === "POST") {
    const b = body ?? {};
    if ([b.schema, b.table, b.pkCol, b.col].some(noQuery) || b.pkVal === undefined) {
      return fail(res, 400, "schema, table, pkCol, pkVal, and col are required.");
    }
    const pool = poolFor(b.connection);
    const { count } = await db.applyBatch(pool, {
      schema: b.schema,
      table: b.table,
      pk: b.pkCol,
      ops: [{ op: "update", pkVal: b.pkVal, col: b.col, now: b.val, valNull: b.valNull }],
    });
    return timed({ ok: true, affected: count });
  }

  if (path === "/batch" && req.method === "POST") {
    const b = body ?? {};
    if (noQuery(b.schema) || noQuery(b.table) || noQuery(b.pk) || !Array.isArray(b.ops) || !b.ops.length) {
      return fail(res, 400, "schema, table, pk, and a non-empty list of operations are required.");
    }
    try {
      db.assertBatchOps(b.ops);
    } catch (error) {
      return fail(res, 400, error.message);
    }
    const pool = poolFor(b.connection);
    const { count } = await db.applyBatch(pool, {
      schema: b.schema,
      table: b.table,
      pk: b.pk,
      ops: b.ops,
    });
    return timed({ ok: true, affected: count });
  }

  if (path === "/row" && req.method === "POST") {
    const b = body ?? {};
    if (noQuery(b.schema) || noQuery(b.table) || !b.values || typeof b.values !== "object") {
      return fail(res, 400, "schema, table, and values are required.");
    }
    const pool = poolFor(b.connection);
    const { count } = await db.insertRow(pool, b);
    return timed({ ok: true, affected: count });
  }

  if (path === "/row" && req.method === "DELETE") {
    const b = body ?? {};
    if ([b.schema, b.table, b.pkCol].some(noQuery) || b.pkVal === undefined) {
      return fail(res, 400, "schema, table, pkCol, and pkVal are required.");
    }
    const pool = poolFor(b.connection);
    const { count } = await db.applyBatch(pool, {
      schema: b.schema,
      table: b.table,
      pk: b.pkCol,
      ops: [{ op: "delete", pkVal: b.pkVal }],
    });
    return timed({ ok: true, affected: count });
  }

  if (path === "/history" && req.method === "GET") {
    return timed({ items: history.slice(0, 30) });
  }

  return fail(res, 404, `Unknown route ${req.method} ${path}.`);
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers.authorization ?? "";
  if (!TOKEN || auth !== `Bearer ${TOKEN}`) {
    return fail(res, 401, "Access denied.");
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  let body = {};
  if (req.method === "POST" || req.method === "DELETE") {
    try {
      body = await readBody(req);
    } catch (error) {
      return fail(res, 400, error.message);
    }
  }
  try {
    await handle(req, res, url, body);
  } catch (error) {
    const message = error?.message ?? String(error);
    console.error(`${req.method} ${url.pathname}:`, message);
    if (!res.headersSent) fail(res, 500, message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`db-connect service on 127.0.0.1:${server.address().port}`);
});

const shutdown = async () => {
  await closePools();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
