# Database Explorer for OpenChamber

A DataGrip-inspired database workspace for [OpenChamber](https://github.com/openchamber/openchamber). Browse connections, schemas, and objects in a persistent explorer while working with multiple table tabs and a SQL console.

## Features

- **PostgreSQL:** schemas, tables, views, column metadata, sorting, filtering, pagination, CSV/JSON export, and a SQL console with history and `EXPLAIN`.
- **Safe data editing:** transactional batch updates, inserts, and deletes for PostgreSQL tables with a single-column primary key. Tables with composite keys remain read-only.
- **MongoDB:** database and collection discovery with paginated, read-only document browsing.
- **Redis:** logical database discovery with paginated, read-only key and value browsing.
- Multiple object tabs, Table/JSON/Text views, a row inspector, connection switching, and a command palette (`Ctrl/Cmd+K`).
- Responsive layout designed for the OpenChamber side panel.

## Requirements

- OpenChamber 2.5 or newer
- [Bun](https://bun.sh/) for installation and development

## Installation

```bash
git clone https://github.com/DeoEsor/openchamber-database-explorer.git
cd openchamber-database-explorer
bun install
bun run build
```

Add the cloned directory as an extension in OpenChamber and grant its service capability. Reopen the panel after rebuilding.

## Development

```bash
bun install
bun run build
bun test
```

Source files live in `src/`. The build generates the loadable bundles in `panel/main.js` and `service/main.js`.

## Local data

Connections and SQL history are stored outside the repository in:

```text
~/.config/openchamber/db-connect/
```

Set `OPENCHAMBER_DB_DATA_DIR` to use a different directory. Connection strings can contain credentials; protect this directory and never commit it.
