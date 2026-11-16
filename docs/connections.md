# Connection guide

Database Explorer uses one DSN per connection. Choose the matching database type in **Add connection**, enter a display name, paste the DSN, and click **Test and add**. A connection is saved only after the database responds successfully.

## PostgreSQL

Accepted schemes: `postgres://` and `postgresql://`.

```text
postgresql://user:password@127.0.0.1:5432/postgres
postgresql://user:password@db.example.com:5432/app?sslmode=require
```

The final path segment selects the database. Standard PostgreSQL connection parameters, including TLS options supported by the underlying `postgres` driver, can be passed in the query string.

For browsing, the account needs access to the relevant catalogs and `SELECT` on the objects you want to inspect. Inserts, updates, and deletes additionally require the corresponding table privileges. Direct editing is available only for tables with a single-column primary key.

The typed editor exposes column defaults and identity/generated metadata. Date, time, timestamp, and timestamptz controls preserve PostgreSQL text semantics without silently converting timestamp-without-time-zone values through the host timezone. UUID controls generate UUID v4 values on request. NULL, an empty string, and an omitted/default value are distinct operations.

## MongoDB

Accepted schemes: `mongodb://` and `mongodb+srv://`.

```text
mongodb://user:password@127.0.0.1:27017/app?authSource=admin
mongodb+srv://user:password@cluster.example.mongodb.net/app
```

The path selects the default database. Use `authSource` when the user is authenticated against a different database; MongoDB Atlas users commonly need `authSource=admin` only when it matches their deployment configuration.

The extension first tries to list non-system databases. If the account cannot list databases, it falls back to the database from the DSN. Browsing collections requires the corresponding `listCollections` and `find` privileges. Inserting, updating, replacing, and deleting documents additionally require the corresponding write privileges.

Editors use canonical Extended JSON so ObjectId, Date, Decimal128, Int64, nested documents, null, and missing fields retain their meaning. `_id` cannot be changed. Writes compare against the values originally viewed and return a conflict when those values changed elsewhere. Full-document replacement checks the complete original document; field updates check the affected original fields. On a standalone server, each document operation is atomic, but a group of document edits is not a multi-document transaction.

MongoDB cannot atomically inspect the scope of a JavaScript `Code` value with aggregation expressions. Guarded updates of that field, and replacement/deletion of documents containing scoped Code anywhere in the original snapshot, therefore return HTTP 400 instead of risking an unsafe write. Unscoped Code and updates to unrelated fields remain supported.

## Redis and Valkey

Accepted schemes: `redis://` and `rediss://` for TLS.

```text
redis://127.0.0.1:6379/0
redis://:password@127.0.0.1:6379/0
redis://user:password@127.0.0.1:6379/0
rediss://user:password@redis.example.com:6380/0
```

The final path segment selects the logical database index. Redis-compatible servers such as Valkey use the same connection format.

Values can be inspected and edited for strings, hashes, lists, sets, sorted sets, and streams. A TTL of `-1` means the key has no expiration. Key enumeration uses `SCAN` and stops at 20,000 keys per refresh; large values and collections are bounded for display.

The key editor can create/delete keys and manage TTL, string values, hash fields, list indexes, set members, sorted-set members/scores, and stream entries. Stream entries support add/delete rather than a destructive pseudo-update. Mutations use atomic server-side scripts with operation-specific key-type and expected-value checks and preserve TTL where applicable. Value replacements and removals that depend on an old value reject conflicts; additions, unrelated-field changes, TTL management, key deletion, and stream operations act on the current key state rather than the whole loaded snapshot. Truncated values or collection windows are never written back as if they were complete.

## URL-encode credentials

Usernames and passwords are URI components. Encode reserved characters such as `@`, `:`, `/`, `#`, `%`, and `?` when they appear literally in credentials. For example, a password of `p@ss/word` becomes `p%40ss%2Fword`.

## Local storage and network access

Connection strings and SQL history are stored in:

```text
~/.config/openchamber/db-connect/
```

- `connections.json` contains saved connection definitions, including DSNs.
- `history.json` contains PostgreSQL SQL history.
- `OPENCHAMBER_DB_DATA_DIR` overrides this directory.

DSNs are not encrypted by the extension. Restrict access to this directory, use least-privilege database accounts, and do not paste production credentials into screenshots, issues, or pull requests.

The companion service listens on `127.0.0.1` and requires bearer authentication from the panel. Database connections are made directly from that service to the configured host; remote database servers still receive traffic from your machine's network identity.

## Troubleshooting

### Connection refused or timed out

Confirm the host and port, verify that the database is running, and check VPN, firewall, and bind-address settings. When a database runs in Docker, publish its port to the host and connect to that published port.

### Authentication failed

Check the username, password, database, and `authSource` where applicable. Verify that reserved characters in credentials are URL-encoded.

### TLS or certificate errors

Confirm whether the server expects TLS and that the selected scheme/options match its configuration. Do not disable certificate verification for production systems merely to bypass a configuration problem.

### A MongoDB database is missing

An account without `listDatabases` permission only gets the configured-database fallback. Put the desired database in the DSN path or grant the appropriate permissions.

### Redis results look incomplete

The current SCAN cap is 20,000 keys per refresh. Narrow the logical database or use key filters. Keys can also expire or change between enumeration and value reads.
