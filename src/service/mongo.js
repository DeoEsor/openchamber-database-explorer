// MongoDB data layer: database/collection discovery and paginated documents.
import { BSON, MongoClient, ObjectId } from "mongodb";

const { EJSON } = BSON;

export const open = (dsn) => new MongoClient(dsn, {
  maxPoolSize: 3,
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
});

export async function ping(client) {
  await client.connect();
  await client.db().command({ ping: 1 });
}

export const close = (client) => client.close();

const SYSTEM_DATABASES = new Set(["admin", "config", "local"]);

export async function introspect(client, configuredDatabase) {
  let names;
  try {
    const result = await client.db("admin").listDatabases({ nameOnly: true });
    names = result.databases.map((item) => item.name).filter((name) => !SYSTEM_DATABASES.has(name));
  } catch {
    names = [];
  }
  const fallback = configuredDatabase || client.db().databaseName || "test";
  if (!names.length) names = [fallback];
  else if (configuredDatabase && !names.includes(configuredDatabase)) names.unshift(configuredDatabase);
  names = names.slice(0, 100);

  return Promise.all(names.map(async (name) => {
    const collections = await client.db(name).listCollections({}, { nameOnly: true }).toArray();
    return {
      name,
      tables: collections
        .map((collection) => collection.name)
        .filter((collection) => !collection.startsWith("system."))
        .sort((a, b) => a.localeCompare(b))
        .map((collection) => ({
          name: collection,
          kind: "collection",
          approxRows: null,
          primaryKey: "_id",
          columns: [],
        })),
    };
  }));
}

const safeField = (name) => {
  const field = String(name ?? "");
  if (!field || field.startsWith("$") || field.includes("\0")) throw new Error("Invalid MongoDB field name.");
  return field;
};

const scalar = (value, field) => {
  const text = String(value ?? "");
  if (field === "_id" && ObjectId.isValid(text)) return new ObjectId(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
};

const regex = (value, starts = false) => {
  const escaped = String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(starts ? `^${escaped}` : escaped, "i");
};

export function documentFilter(filter) {
  if (!filter?.col || !filter.op) return {};
  const field = safeField(filter.col);
  const value = scalar(filter.val, field);
  switch (filter.op) {
    case "eq": return { [field]: value };
    case "neq": return { [field]: { $ne: value } };
    case "gt": return { [field]: { $gt: value } };
    case "gte": return { [field]: { $gte: value } };
    case "lt": return { [field]: { $lt: value } };
    case "lte": return { [field]: { $lte: value } };
    case "contains": return { [field]: regex(filter.val) };
    case "starts": return { [field]: regex(filter.val, true) };
    case "isnull": return { [field]: null };
    case "notnull": return { [field]: { $ne: null } };
    default: return {};
  }
}

function valueType(value) {
  if (value instanceof ObjectId) return "objectid";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (typeof value === "object") return "json";
  return typeof value;
}

export function serialize(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return EJSON.stringify(value, { relaxed: true });
  return String(value);
}

export async function readCollection(client, { schema, table, offset = 0, limit = 100, order = "_id", desc = false, filter } = {}) {
  limit = Math.max(1, Math.min(500, Number(limit) || 100));
  offset = Math.max(0, Number(offset) || 0);
  const orderField = safeField(order || "_id");
  const where = documentFilter(filter);
  const collection = client.db(String(schema)).collection(String(table));
  const [documents, total] = await Promise.all([
    collection.find(where).sort({ [orderField]: desc ? -1 : 1 }).skip(offset).limit(limit).toArray(),
    collection.countDocuments(where),
  ]);

  const names = [];
  const seen = new Set();
  for (const name of ["_id", ...documents.flatMap((document) => Object.keys(document))]) {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  const columnMeta = names.map((name) => {
    const sample = documents.map((document) => document[name]).find((value) => value !== null && value !== undefined);
    return { name, type: valueType(sample), nullable: true, pk: name === "_id" };
  });
  return {
    columns: names,
    columnMeta,
    pk: "_id",
    rows: documents.map((document) => names.map((name) => serialize(document[name]))),
    rowCount: documents.length,
    total,
    offset,
    limit,
    order: orderField,
    desc: !!desc,
    readOnly: true,
  };
}
