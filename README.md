<div align="center">
  <img src="icon.png" alt="Database Explorer icon" width="112" height="112">

  # Database Explorer for OpenChamber

  **A DataGrip-inspired database workspace inside your OpenChamber sidebar.**

  Browse schemas, inspect real data, edit PostgreSQL rows safely, and run SQL without switching away from your coding session.

  [![Version](https://img.shields.io/badge/version-1.2.0-4f8cff)](https://github.com/DeoEsor/openchamber-database-explorer)
  [![OpenChamber](https://img.shields.io/badge/OpenChamber-%E2%89%A52.5.0-5b5bd6)](https://github.com/openchamber/openchamber)
  [![License](https://img.shields.io/badge/license-MIT-3fb96f)](LICENSE)

  [Install](#install-in-openchamber) · [Try the demo](#try-the-demo-stack) · [Screenshots](#screenshots) · [Development](#development)
</div>

## Why Database Explorer?

Database Explorer brings the familiar parts of a database IDE into OpenChamber:

- **Stay in context.** Check the data behind a bug, verify a migration, or inspect a document while keeping your project and agent session open.
- **Keep your orientation.** A persistent connection and object tree stays on the left while tables and SQL consoles open as tabs on the right.
- **Work with more than rows.** Switch between Table, JSON, and Text views, inspect individual values, sort and filter data, and export results.
- **Edit with guardrails.** PostgreSQL changes are staged before they are applied as one transactional batch. Composite-primary-key tables remain read-only.
- **Use your existing databases.** Connect directly to PostgreSQL, MongoDB, Redis, or Valkey—no hosted account, sync service, or telemetry setup required.

![PostgreSQL table browsing in Database Explorer](docs/assets/postgres-data.png)

## Supported databases

| Engine | What you can do |
| --- | --- |
| **PostgreSQL** | Browse schemas, tables, and views; inspect column metadata; sort, filter, and paginate; edit rows; insert and delete records; export data; run SQL and `EXPLAIN`; keep SQL history. |
| **MongoDB** | Discover databases and collections and browse documents with filtering, pagination, field inspection, and Table/JSON/Text views. Read-only. |
| **Redis / Valkey** | Discover logical databases and browse keys, values, types, and TTLs with filtering and pagination. Read-only. |

> Redis-compatible Valkey servers use the same connection type. The interface labels these connections as Redis.

## Install in OpenChamber

### Requirements

- OpenChamber **2.5.0 or newer**, desktop or web.
- A database reachable from the machine running OpenChamber.

**You do not need Bun, Node.js, or `npm install` for a normal installation.** The repository includes the built panel and service bundles.

### Option A — install directly from GitHub (recommended)

1. Open **Settings → Extensions** in OpenChamber.
2. Paste the following URL into **Folder, ZIP, or URL** and choose **Add**:

   ```text
   https://github.com/DeoEsor/openchamber-database-explorer
   ```

3. Approve the **Run a local service** permission. The service is how the panel connects to your databases.
4. Click the **Database Explorer** icon on the right-hand rail.
5. Choose **Add connection** and enter a name and DSN.

Installing from the Git URL also enables update checks in **Settings → Extensions**.

You can also open this installation link on a machine with OpenChamber desktop:

```text
openchamber://extensions/install?url=https%3A%2F%2Fgithub.com%2FDeoEsor%2Fopenchamber-database-explorer
```

### Option B — install a local folder

Use this option if you want to modify the extension:

```bash
git clone https://github.com/DeoEsor/openchamber-database-explorer.git
cd openchamber-database-explorer
bun install --frozen-lockfile
bun run build
```

Then open **Settings → Extensions**, paste the **absolute path** of the cloned folder, choose **Add**, and approve the service permission. Reopen the panel after rebuilding.

A [ZIP archive](https://github.com/DeoEsor/openchamber-database-explorer/archive/refs/heads/main.zip) can also be added through the same installation field.

## Connect to your database

Open **Database Explorer → Add connection**, select the engine, and paste a DSN:

```text
PostgreSQL  postgres://user:password@localhost:5432/mydb
MongoDB     mongodb://user:password@localhost:27017/mydb?authSource=admin
Redis       redis://localhost:6379/0
Valkey      redis://localhost:6379/0
```

Use `postgresql://` or `rediss://` when appropriate. For a remote OpenChamber server, `localhost` means that server—not the computer where your browser is open.

See the [connection guide](docs/connections.md) for URL-encoded credentials, database permissions, TLS examples, credential storage, and troubleshooting.

![Adding a database connection](docs/assets/new-connection.png)

## Try the demo stack

The repository includes isolated PostgreSQL, MongoDB, and Valkey containers with deterministic sample data. They use non-default host ports so they can coexist with most local installations. The [demo guide](docs/demo.md) includes sample queries and suggested workflows.

### Start everything

Requirements: Docker with Docker Compose.

```bash
docker compose up -d --wait
./demo/seed-valkey.sh
```

PostgreSQL and MongoDB seed themselves on the first startup. The second command adds the Valkey demo keys.

### Add the demo connections

| Connection | DSN |
| --- | --- |
| Acme PostgreSQL | `postgres://explorer:explorer@127.0.0.1:55432/acme` |
| Acme MongoDB | `mongodb://explorer:explorer@127.0.0.1:57017/acme?authSource=admin` |
| Acme Valkey | `redis://127.0.0.1:56379/0` |

The demo credentials are intentionally public and must only be used for this local stack.

### Stop or reset

```bash
# Stop the containers but keep the demo data
docker compose down

# Recreate all demo data from scratch
docker compose down -v
docker compose up -d --wait
./demo/seed-valkey.sh
```

`down -v` permanently deletes the three **demo** volumes.

## Screenshots

### SQL console with results and history

Run a single SQL statement with **Ctrl/Cmd+Enter**, inspect the result grid, export it, or open `EXPLAIN` without leaving the workspace.

![PostgreSQL SQL console](docs/assets/sql-console.png)

### MongoDB documents

Browse collections and switch between tabular, JSON, and raw text representations.

![MongoDB document browsing](docs/assets/mongodb-documents.png)

### Redis and Valkey keys

Inspect keys, values, types, and TTLs in a read-only view.

![Valkey key browsing](docs/assets/valkey-keys.png)

## Everyday workflows

- **Find an object:** press **Ctrl/Cmd+K** and search tables, views, collections, keys, or connections.
- **Open several objects:** each table, collection, keyspace, and SQL console gets its own tab.
- **Inspect a value:** use the row inspector for long text, JSON, timestamps, and other values that do not fit a cell.
- **Edit PostgreSQL data:** edit cells or insert/delete rows, review the pending change count, then apply or discard the batch.
- **Customize the grid:** sort columns, apply filters, hide columns, and switch between Table, JSON, and Text views.
- **Export:** download table data as CSV or JSON; SQL result grids also support CSV export.

## Safety and data storage

- Editing is available only for PostgreSQL tables with a **single-column primary key**. Other PostgreSQL tables, MongoDB, Redis, and Valkey are read-only.
- Updates and deletes run in a transaction and must affect exactly one row per operation; otherwise the batch rolls back.
- Modifying SQL statements require confirmation. The SQL console executes one statement at a time.
- Connections and SQL history are stored on the OpenChamber host, outside this repository:

  ```text
  ~/.config/openchamber/db-connect/
  ```

- Set `OPENCHAMBER_DB_DATA_DIR` to override that directory for a standalone service run.
- DSNs can contain credentials. Protect the data directory and never commit it. Database traffic still goes to the database server you configure.

## Development

### Prerequisites

- [Bun](https://bun.sh/) 1.1 or newer
- Docker Compose for the optional demo databases

### Commands

```bash
bun install --frozen-lockfile
bun run build       # Build panel/main.js and service/main.js
bun test            # Run service and driver tests
docker compose up -d --wait
./demo/seed-valkey.sh
```

Source files live in `src/`. The build generates the loadable bundles in `panel/main.js` and `service/main.js`; both bundles are committed so OpenChamber can install directly from Git without building.

```text
src/panel/          DataGrip-style interface and workspace logic
src/service/        PostgreSQL, MongoDB, and Redis/Valkey service
panel/              Browser entry point and generated bundle
service/            Generated host-service bundle
demo/               Deterministic database seed data
docs/assets/        Screenshots used in this README
test/               Service and driver regression tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and safety invariants.

## Troubleshooting

### The panel cannot reach the service

Remove the extension, add it again, and make sure **Run a local service** is approved. Then reopen the panel.

### No icon appears after installation

Check that the repository contains `package.json`, `icon.png`, `panel/index.html`, `panel/main.js`, and `service/main.js`, and that OpenChamber is 2.5.0 or newer.

### A local database works in the terminal but not in OpenChamber

Use the demo ports above or check that the database listens on the same host running OpenChamber. In remote or container setups, `127.0.0.1` may refer to a different machine or container.

### The demo stack did not seed

Initialization scripts run only on fresh PostgreSQL and MongoDB volumes. Reset with `docker compose down -v`, start again, and rerun `./demo/seed-valkey.sh`.

## License

[MIT](LICENSE) © 2026 DeoEsor

The application icon was generated with Kling AI and prepared for small-size extension use.
