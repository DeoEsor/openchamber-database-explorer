// PostgreSQL data layer for the DB Connect service.
// Read-only queries run inside `begin read only` with a statement timeout;
// identifiers are escaped manually and values always go through parameters.
import postgres from "postgres";

/** Quote an SQL identifier (schema, table, column) safely. */
export const qid = (name) => `"${String(name).replace(/"/g, '""')}"`;

export const serialize = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const tableRows = (list) =>
  list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, serialize(v)])));

export const open = (dsn) =>
  postgres(dsn, { max: 2, idle_timeout: 20, connect_timeout: 5, prepare: false });

export async function ping(sql) {
  await sql`select 1`;
}

/** Reject multi-statement input: comments and string bodies are stripped first. */
export function assertSingleStatement(query) {
  let s = String(query);
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ");
  s = s.replace(/--[^\n]*/g, " ");
  s = s.replace(/'(?:[^']|'')*'/g, "''");
  s = s.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, " ");
  const semicolon = s.indexOf(";");
  if (semicolon !== -1 && s.slice(semicolon + 1).trim() !== "") {
    throw new Error("Only one SQL statement can be executed at a time.");
  }
}

export async function introspect(sql) {
  const [tables, columns, pks] = await Promise.all([
    sql`
      select n.nspname as schema, c.relname as table, c.relkind as kind, c.reltuples::bigint as approx_rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm')
        and n.nspname not like 'pg\\_%'
        and n.nspname <> 'information_schema'
      order by n.nspname, c.relname
    `,
    sql`
      select n.nspname as schema, c.relname as table, a.attname as name,
             format_type(a.atttypid, a.atttypmod) as type,
             not a.attnotnull as nullable
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      where a.attnum > 0 and not a.attisdropped
        and c.relkind in ('r', 'p', 'v', 'm')
        and n.nspname not like 'pg\\_%'
        and n.nspname <> 'information_schema'
      order by n.nspname, c.relname, a.attnum
    `,
    sql`
      select n.nspname as schema, c.relname as table, a.attname as name
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
      where i.indisprimary
      order by n.nspname, c.relname, a.attnum
    `,
  ]);

  const kindMap = { r: "table", p: "partitioned", v: "view", m: "matview" };
  const bySchema = new Map();
  const tableOf = (schema, table) => {
    let s = bySchema.get(schema);
    if (!s) {
      s = { name: schema, tables: [] };
      bySchema.set(schema, s);
    }
    let t = s.tables.find((x) => x.name === table);
    if (!t) {
      t = {
        name: table,
        kind: "table",
        approxRows: null,
        primaryKey: null,
        columns: [],
      };
      s.tables.push(t);
    }
    return t;
  };

  for (const t of tables) {
    const row = tableOf(t.schema, t.table);
    row.kind = kindMap[t.kind] ?? "table";
    row.approxRows = t.approx_rows >= 0 ? Number(t.approx_rows) : null;
  }
  for (const c of columns) {
    tableOf(c.schema, c.table).columns.push({ name: c.name, type: c.type, nullable: c.nullable, pk: false });
  }
  const primaryKeys = new Map();
  for (const p of pks) {
    const t = bySchema.get(p.schema)?.tables.find((x) => x.name === p.table);
    if (!t) continue;
    const names = primaryKeys.get(t) ?? [];
    names.push(p.name);
    primaryKeys.set(t, names);
  }
  for (const s of bySchema.values()) {
    for (const t of s.tables) {
      const names = primaryKeys.get(t) ?? [];
      t.primaryKey = names.length === 1 ? names[0] : null;
      for (const c of t.columns) c.pk = c.name === t.primaryKey;
    }
    s.tables.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...bySchema.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** SELECT-only execution: read-only transaction, 15s timeout, rollback after. */
export async function readOnlyQuery(sql, query, limit = 100) {
  const conn = await sql.reserve();
  let rows = [];
  try {
    await conn.unsafe("begin read only");
    await conn.unsafe("set local statement_timeout = '15s'");
    const result = await conn.unsafe(query);
    rows = result.slice(0, limit);
  } finally {
    try {
      await conn.unsafe("rollback");
    } catch {
      // connection already aborted the transaction
    }
    conn.release();
  }
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return {
    columns,
    rows: tableRows(rows).map((r) => columns.map((c) => r[c])),
    rowCount: rows.length,
    ms: null,
    command: "SELECT",
  };
}

/** Arbitrary single statement (INSERT/UPDATE/DELETE/DDL). */
export async function execute(sql, query) {
  const result = await sql.unsafe(query);
  return {
    columns: [],
    rows: [],
    rowCount: typeof result.count === "number" ? result.count : 0,
    ms: null,
    command: String(result.command ?? ""),
  };
}

async function tableMeta(sql, schema, table) {
  const columns = await sql`
    select column_name as name, data_type as type, is_nullable as nullable
    from information_schema.columns
    where table_schema = ${schema} and table_name = ${table}
    order by ordinal_position
  `;
  if (!columns.length) throw new Error(`Table ${schema}.${table} was not found.`);
  const pk = await sql`
    select a.attname as name
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where i.indisprimary and n.nspname = ${schema} and c.relname = ${table}
    order by a.attnum
  `;
  return {
    columns: columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable === "YES" })),
    pk: pk.length === 1 ? pk[0].name : null,
  };
}

/** WHERE fragment for the table filter bar. Values always go through parameters. */
function filterClause(meta, filter) {
  if (!filter || !filter.col || !filter.op) return { where: "", params: [] };
  const col = meta.columns.find((c) => c.name === filter.col);
  if (!col) throw new Error(`Column ${filter.col} was not found in the table.`);
  const c = qid(col.name);
  const v = filter.val == null ? "" : String(filter.val);
  switch (filter.op) {
    case "eq": return { where: ` where ${c} = $1`, params: [v] };
    case "neq": return { where: ` where ${c} <> $1 or ${c} is null`, params: [v] };
    case "gt": return { where: ` where ${c} > $1`, params: [v] };
    case "gte": return { where: ` where ${c} >= $1`, params: [v] };
    case "lt": return { where: ` where ${c} < $1`, params: [v] };
    case "lte": return { where: ` where ${c} <= $1`, params: [v] };
    case "contains": return { where: ` where ${c}::text ilike $1`, params: [`%${v}%`] };
    case "starts": return { where: ` where ${c}::text ilike $1`, params: [`${v}%`] };
    case "isnull": return { where: ` where ${c} is null`, params: [] };
    case "notnull": return { where: ` where ${c} is not null`, params: [] };
    default: return { where: "", params: [] };
  }
}

export async function readTable(sql, { schema, table, offset = 0, limit = 100, order, desc = false, filter } = {}) {
  const meta = await tableMeta(sql, schema, table);
  limit = Math.max(1, Math.min(500, Number(limit) || 100));
  offset = Math.max(0, Number(offset) || 0);
  const orderCol = meta.columns.some((c) => c.name === order) ? order : meta.pk ?? meta.columns[0].name;
  const full = qid(schema) + "." + qid(table);
  const { where, params } = filterClause(meta, filter);

  const rows = await sql.unsafe(
    `select * from ${full}${where} order by ${qid(orderCol)} ${desc ? "desc" : "asc"} limit ${limit} offset ${offset}`,
    params,
  );
  const counted = await sql.unsafe(`select count(*)::bigint as n from ${full}${where}`, params);
  const columns = meta.columns.map((c) => c.name);
  return {
    columns,
    columnMeta: meta.columns,
    pk: meta.pk,
    rows: tableRows(rows).map((r) => columns.map((c) => r[c])),
    rowCount: rows.length,
    total: Number(counted[0].n),
    offset,
    limit,
    order: orderCol,
    desc: !!desc,
  };
}

export async function updateCell(sql, { schema, table, pkCol, pkVal, col, val, valNull = false }) {
  return applyBatch(sql, {
    schema,
    table,
    pk: pkCol,
    ops: [{ op: "update", pkVal, col, now: val, valNull }],
  });
}

export async function insertRow(sql, { schema, table, values }) {
  const entries = Object.entries(values ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) throw new Error("No values to insert.");
  const cols = entries.map(([c]) => qid(c)).join(", ");
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
  const params = entries.map(([, v]) => (v === "\\null" ? null : v));
  const full = qid(schema) + "." + qid(table);
  const result = await sql.unsafe(
    `insert into ${full} (${cols}) values (${placeholders})`,
    params,
  );
  return { count: typeof result.count === "number" ? result.count : 0 };
}

export async function deleteRow(sql, { schema, table, pkCol, pkVal }) {
  return applyBatch(sql, {
    schema,
    table,
    pk: pkCol,
    ops: [{ op: "delete", pkVal }],
  });
}

export function assertBatchOps(ops) {
  if (!Array.isArray(ops) || !ops.length) throw new Error("A non-empty list of operations is required.");
  if (ops.length > 500) throw new Error("The batch can contain at most 500 operations.");
  for (const op of ops) {
    if (!op || typeof op !== "object" || (op.op !== "update" && op.op !== "delete")) {
      throw new Error("Unknown operation type.");
    }
    if (op.pkVal === undefined) throw new Error("Each operation requires pkVal.");
    if (op.op === "update" && (typeof op.col !== "string" || !op.col.trim() || (!op.valNull && op.now === undefined))) {
      throw new Error("Updates require col and now.");
    }
  }
}

/** Apply staged cell updates/deletes in a single transaction (TablePlus-style batch). */
export async function applyBatch(sql, { schema, table, pk, ops }) {
  assertBatchOps(ops);
  const full = qid(schema) + "." + qid(table);
  const pkQ = qid(pk);
  const conn = await sql.reserve();
  let affected = 0;
  try {
    await conn.unsafe("begin");
    for (const op of ops) {
      if (op.op === "update") {
        const result = await conn.unsafe(
          `update ${full} set ${qid(op.col)} = $1 where ${pkQ} = $2`,
          [op.valNull ? null : op.now, String(op.pkVal)],
        );
        const count = typeof result.count === "number" ? result.count : 0;
        if (count !== 1) throw new Error(`The operation must affect exactly one row (affected: ${count}).`);
        affected += count;
      } else if (op.op === "delete") {
        const result = await conn.unsafe(`delete from ${full} where ${pkQ} = $1`, [String(op.pkVal)]);
        const count = typeof result.count === "number" ? result.count : 0;
        if (count !== 1) throw new Error(`The operation must affect exactly one row (affected: ${count}).`);
        affected += count;
      }
    }
    await conn.unsafe("commit");
  } catch (error) {
    try {
      await conn.unsafe("rollback");
    } catch {
      // connection already aborted the transaction
    }
    throw error;
  } finally {
    conn.release();
  }
  return { count: affected };
}
