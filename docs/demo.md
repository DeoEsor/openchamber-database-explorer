# Local demo stack

The demo starts PostgreSQL, MongoDB, and Valkey with sample application data. It is optional and separate from the extension runtime.

## Start

Requirements: Docker with the Compose plugin.

```bash
git clone https://github.com/DeoEsor/openchamber-database-explorer.git
cd openchamber-database-explorer
docker compose up -d --wait
sh ./demo/seed-valkey.sh
```

PostgreSQL and MongoDB seed scripts run automatically when their data volumes are initialized. Valkey keys are loaded by `demo/seed-valkey.sh`.

## Connections

Add these DSNs in Database Explorer:

| Type | Name suggestion | DSN |
| --- | --- | --- |
| PostgreSQL | Acme PostgreSQL | `postgresql://explorer:explorer@127.0.0.1:55432/acme` |
| MongoDB | Acme MongoDB | `mongodb://explorer:explorer@127.0.0.1:57017/acme?authSource=admin` |
| Redis | Acme Valkey | `redis://127.0.0.1:56379/0` |

The demo deliberately uses host ports `55432`, `57017`, and `56379` to reduce conflicts with existing local databases.

## What to try

### PostgreSQL

- Open `public.customers` and `public.projects` in separate tabs.
- Filter customers by `status = active`.
- Sort by `monthly_revenue`.
- Inspect the `revenue_by_plan` view.
- Open the SQL console and run:

```sql
SELECT
  c.plan,
  count(DISTINCT c.id) AS customers,
  count(p.id) AS projects,
  sum(c.monthly_revenue) AS monthly_revenue
FROM customers AS c
LEFT JOIN projects AS p ON p.customer_id = c.id
WHERE c.status = 'active'
GROUP BY c.plan
ORDER BY monthly_revenue DESC;
```

### MongoDB

- Open `acme.workspaces` and `acme.audit_events`.
- Filter workspaces by plan or region.
- Switch between Table, JSON, and Text views to inspect arrays and BSON values.

### Redis / Valkey

- Open `db0.keys`.
- Compare key types, TTLs, and values.
- Filter keys containing `workspace` or `session`.

## Stop or reset

Stop containers while keeping demo data:

```bash
docker compose down
```

Stop containers and permanently remove the demo volumes:

```bash
docker compose down -v
```

After a volume reset, the next `docker compose up -d --wait` initializes PostgreSQL and MongoDB again. Run `sh ./demo/seed-valkey.sh` to recreate Valkey keys.

## Demo credentials

All credentials and records in this stack are fictional and intended only for local demonstrations. Do not reuse `explorer / explorer` for real deployments.
