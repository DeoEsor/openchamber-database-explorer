// MongoDB data layer: database/collection discovery, paginated documents, and guarded edits.
import { BSON, MongoClient, MongoServerError, ObjectId } from "mongodb";

const { EJSON } = BSON;
const CANONICAL_EJSON = { relaxed: false };
const FORBIDDEN_FIELDS = new Set(["__proto__", "prototype", "constructor"]);
const EJSON_FIELDS = new Set([
  "$oid",
  "$date",
  "$numberInt",
  "$numberLong",
  "$numberDouble",
  "$numberDecimal",
  "$binary",
  "$uuid",
  "$timestamp",
  "$regularExpression",
  "$regex",
  "$options",
  "$minKey",
  "$maxKey",
  "$undefined",
  "$symbol",
  "$code",
  "$scope",
  "$dbPointer",
  "$ref",
  "$id",
  "$db",
]);

function mongoError(message, code, status, cause) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (cause !== undefined) error.cause = cause;
  return error;
}

const invalid = (message, cause) => mongoError(message, "MONGO_INVALID_REQUEST", 400, cause);
const conflict = (operation, count) => mongoError(
  `MongoDB ${operation} conflict: expected exactly one matching document (matched: ${count}). Reload and retry.`,
  "MONGO_CONFLICT",
  409,
);

const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const open = (dsn) => new MongoClient(dsn, {
  maxPoolSize: 3,
  connectTimeoutMS: 5_000,
  serverSelectionTimeoutMS: 5_000,
  promoteLongs: false,
  promoteValues: false,
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

function assertEditableField(name, topLevel = false) {
  if (
    typeof name !== "string"
    || !name
    || name.startsWith("$")
    || name.includes("\0")
    || FORBIDDEN_FIELDS.has(name)
    || (topLevel && name.includes("."))
  ) {
    throw invalid("Invalid or unsafe MongoDB field name.");
  }
  return name;
}

// JSON.parse creates own __proto__ properties safely; reject them before BSON or update processing.
function validateJsonFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) validateJsonFields(item);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [name, nested] of Object.entries(value)) {
    if (!name || name.includes("\0") || FORBIDDEN_FIELDS.has(name)) {
      throw invalid("Invalid or unsafe MongoDB field name.");
    }
    if (name.startsWith("$") && !EJSON_FIELDS.has(name)) {
      throw invalid(`Unknown MongoDB Extended JSON operator: ${name}.`);
    }
    validateJsonFields(nested);
  }
}

// Known wrappers become BSON instances; any dollar field left in a plain object is not valid EJSON.
function validateParsedFields(value) {
  if (Array.isArray(value)) {
    for (const item of value) validateParsedFields(item);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [name, nested] of Object.entries(value)) {
    assertEditableField(name);
    validateParsedFields(nested);
  }
}

/** Serialize a BSON/JS value to canonical MongoDB Extended JSON. */
export function serialize(value) {
  if (value === undefined) throw invalid("Undefined is not an Extended JSON value; omit the field instead.");
  return EJSON.stringify(value, CANONICAL_EJSON);
}

/** Parse one canonical Extended JSON string without relaxing BSON values to JS primitives. */
export function parse(text) {
  if (typeof text !== "string") throw invalid("MongoDB Extended JSON must be a string.");
  let json;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    throw invalid("Invalid MongoDB Extended JSON.", cause);
  }
  validateJsonFields(json);
  let value;
  try {
    value = EJSON.parse(text, CANONICAL_EJSON);
  } catch (cause) {
    throw invalid("Invalid MongoDB Extended JSON.", cause);
  }
  validateParsedFields(value);
  return value;
}

function parseDocument(text, label = "MongoDB document") {
  const document = parse(text);
  if (!isPlainObject(document)) throw invalid(`${label} must be an Extended JSON object.`);
  for (const name of Object.keys(document)) assertEditableField(name, true);
  return document;
}

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
  if (typeof value?._bsontype === "string") return value._bsontype.toLowerCase();
  if (typeof value === "object") return "json";
  return typeof value;
}

// Keep friendly grid cells; canonical identity/original values live in `documents` instead.
function display(value) {
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
    rows: documents.map((document) => names.map((name) => display(document[name]))),
    documents: documents.map((document) => serialize(document)),
    present: documents.map((document) => names.map((name) => hasOwn(document, name))),
    rowCount: documents.length,
    total: Number(total),
    offset,
    limit,
    order: orderField,
    desc: !!desc,
    readOnly: false,
  };
}

function collectionFor(client, schema, table) {
  const database = String(schema ?? "");
  const collection = String(table ?? "");
  if (!database || !collection || database.includes("\0") || collection.includes("\0")) {
    throw invalid("Both a valid MongoDB schema and table are required.");
  }
  return client.db(database).collection(collection);
}

function originalId(original) {
  if (!hasOwn(original, "_id")) throw invalid("The original MongoDB document must contain _id.");
  return original._id;
}

function matchingId(original, id) {
  const parsedId = parse(id);
  if (serialize(parsedId) !== serialize(originalId(original))) {
    throw invalid("The supplied id does not match the original document _id.");
  }
  return parsedId;
}

function sameId(left, right) {
  return serialize(left) === serialize(right);
}

function fieldValue(field) {
  return { $getField: { field: { $literal: field }, input: "$$ROOT" } };
}

// DBRef is stored as a document even though the driver wraps it in a non-plain class.
function comparisonDocument(value) {
  if (isPlainObject(value)) return value;
  if (value?._bsontype !== "DBRef") return null;
  return Object.assign(
    { $ref: value.collection, $id: value.oid },
    value.db != null ? { $db: value.db } : null,
    value.fields,
  );
}

// $eq considers numeric BSON types equal, so every value needs an independent type guard.
function exactValueExpression(value, original) {
  let nextVariable = 0;
  const compare = (actual, expected) => {
    // Aggregation cannot expose code_w_scope's scope document for recursive comparison.
    if (expected?._bsontype === "Code" && expected.scope != null) {
      throw invalid("MongoDB Code values with scope cannot be used in guarded edits.");
    }
    const variable = `guard${nextVariable++}`;
    const reference = `$$${variable}`;
    const bind = (expression) => ({ $let: { vars: { [variable]: actual }, in: expression } });
    const document = comparisonDocument(expected);
    if (document) expected = document;
    const sameType = { $eq: [{ $type: reference }, { $type: { $literal: expected } }] };

    if (Array.isArray(expected)) {
      return bind({
        $cond: {
          if: sameType,
          then: {
            $and: [
              { $eq: [{ $size: reference }, expected.length] },
              ...expected.map((item, index) => compare({ $arrayElemAt: [reference, index] }, item)),
            ],
          },
          else: false,
        },
      });
    }

    if (document) {
      return bind({
        $cond: {
          if: sameType,
          then: {
            $and: [
              {
                $eq: [
                  { $map: { input: { $objectToArray: reference }, as: "entry", in: "$$entry.k" } },
                  { $literal: Object.keys(expected) },
                ],
              },
              ...Object.entries(expected).map(([field, item]) => compare(
                { $getField: { field: { $literal: field }, input: reference } },
                item,
              )),
            ],
          },
          else: false,
        },
      });
    }

    return bind({ $and: [sameType, { $eq: [reference, { $literal: expected }] }] });
  };
  return compare(value, original);
}

function originalFieldsFilter(original, id, fields) {
  const comparisons = [];
  for (const field of fields) {
    const value = fieldValue(field);
    comparisons.push(hasOwn(original, field)
      ? exactValueExpression(value, original[field])
      : { $eq: [{ $type: value }, "missing"] });
  }
  return { _id: id, $expr: { $and: comparisons } };
}

// $$ROOT also detects external additions/removals, not just changes to fields present originally.
function exactOriginalFilter(original) {
  return { _id: originalId(original), $expr: exactValueExpression("$$ROOT", original) };
}

function assertAcknowledged(result) {
  if (result?.acknowledged !== true) {
    throw mongoError("MongoDB write was not acknowledged.", "MONGO_WRITE_UNACKNOWLEDGED", 500);
  }
}

function numericResultCount(result, key) {
  const count = Number(result?.[key] ?? 0);
  return Number.isSafeInteger(count) ? count : 0;
}

function assertMatched(result, operation) {
  assertAcknowledged(result);
  const matchedCount = numericResultCount(result, "matchedCount");
  if (matchedCount !== 1) throw conflict(operation, matchedCount);
}

async function writeWithDuplicateKeyTranslation(operation, write) {
  try {
    return await write();
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw mongoError(
        `MongoDB ${operation} failed: a document with the same unique key already exists.`,
        "MONGO_DUPLICATE_KEY",
        409,
        error,
      );
    }
    throw error;
  }
}

export async function insertDocument(client, { schema, table, document } = {}) {
  const value = parseDocument(document);
  const result = await writeWithDuplicateKeyTranslation(
    "insert",
    () => collectionFor(client, schema, table).insertOne(value),
  );
  assertAcknowledged(result);
  const insertedId = result?.insertedId !== undefined ? result.insertedId : value._id;
  return {
    count: 1,
    ...(insertedId === undefined ? {} : { insertedId: serialize(insertedId) }),
  };
}

export async function updateDocument(client, { schema, table, id, original, set = {}, unset = [] } = {}) {
  const originalDocument = parseDocument(original, "The original MongoDB document");
  const parsedId = matchingId(originalDocument, id);
  if (!isPlainObject(set)) throw invalid("MongoDB update set must be an object of canonical Extended JSON values.");
  if (!Array.isArray(unset)) throw invalid("MongoDB update unset must be an array of top-level field names.");

  const setEntries = Object.entries(set);
  if (!setEntries.length && !unset.length) throw invalid("MongoDB update requires at least one set or unset field.");
  const setFields = new Set(setEntries.map(([name]) => name));
  for (const name of unset) {
    assertEditableField(name, true);
    if (setFields.has(name)) throw invalid(`MongoDB field ${name} cannot be both set and unset.`);
  }

  const fields = new Set();
  const setValues = {};
  for (const [name, text] of setEntries) {
    assertEditableField(name, true);
    if (name === "_id") throw invalid("MongoDB _id is immutable.");
    fields.add(name);
    setValues[name] = parse(text);
  }
  const unsetValues = {};
  for (const name of unset) {
    if (name === "_id") throw invalid("MongoDB _id is immutable.");
    fields.add(name);
    unsetValues[name] = "";
  }

  const update = {};
  if (setEntries.length) update.$set = setValues;
  if (unset.length) update.$unset = unsetValues;
  const filter = originalFieldsFilter(originalDocument, parsedId, fields);
  const result = await writeWithDuplicateKeyTranslation(
    "update",
    () => collectionFor(client, schema, table).updateOne(filter, update),
  );
  assertMatched(result, "update");
  const matchedCount = numericResultCount(result, "matchedCount");
  const modifiedCount = numericResultCount(result, "modifiedCount");
  return { count: matchedCount, matchedCount, modifiedCount };
}

export async function replaceDocument(client, { schema, table, original, document } = {}) {
  const originalDocument = parseDocument(original, "The original MongoDB document");
  const replacement = parseDocument(document, "The replacement MongoDB document");
  const id = originalId(originalDocument);
  if (!hasOwn(replacement, "_id") || !sameId(id, replacement._id)) {
    throw invalid("The replacement MongoDB document must preserve the original _id.");
  }
  const result = await writeWithDuplicateKeyTranslation(
    "replace",
    () => collectionFor(client, schema, table).replaceOne(exactOriginalFilter(originalDocument), replacement),
  );
  assertMatched(result, "replace");
  const matchedCount = numericResultCount(result, "matchedCount");
  const modifiedCount = numericResultCount(result, "modifiedCount");
  return { count: matchedCount, matchedCount, modifiedCount };
}

export async function deleteDocument(client, { schema, table, id, original } = {}) {
  const originalDocument = parseDocument(original, "The original MongoDB document");
  matchingId(originalDocument, id);
  const result = await collectionFor(client, schema, table).deleteOne(exactOriginalFilter(originalDocument));
  assertAcknowledged(result);
  const deletedCount = numericResultCount(result, "deletedCount");
  if (deletedCount !== 1) throw conflict("delete", deletedCount);
  return { count: deletedCount, deletedCount };
}
