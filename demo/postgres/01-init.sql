CREATE TABLE customers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  country text NOT NULL,
  monthly_revenue numeric(10, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  environment text NOT NULL DEFAULT 'production',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activity_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id),
  event_date date NOT NULL,
  active_users integer NOT NULL,
  requests bigint NOT NULL,
  error_rate numeric(5, 2) NOT NULL DEFAULT 0,
  UNIQUE (project_id, event_date)
);

CREATE INDEX activity_daily_event_date_idx ON activity_daily(event_date);

CREATE VIEW revenue_by_plan AS
SELECT plan, count(*) AS customers, sum(monthly_revenue) AS monthly_revenue
FROM customers
WHERE status = 'active'
GROUP BY plan;

INSERT INTO customers (name, email, plan, status, country, monthly_revenue, created_at) VALUES
  ('Northwind Labs', 'ops@northwind.test', 'Scale', 'active', 'United States', 2499.00, '2025-11-04T09:20:00Z'),
  ('Acme Robotics', 'engineering@acme.test', 'Business', 'active', 'Germany', 1299.00, '2025-12-12T11:45:00Z'),
  ('Luminary Systems', 'hello@luminary.test', 'Scale', 'active', 'United Kingdom', 2199.00, '2026-01-08T08:10:00Z'),
  ('Vertex Cloud', 'dev@vertex.test', 'Starter', 'active', 'Netherlands', 299.00, '2026-01-27T14:30:00Z'),
  ('Bluebird Data', 'team@bluebird.test', 'Business', 'trial', 'Canada', 0.00, '2026-02-03T16:05:00Z'),
  ('Kite Works', 'platform@kite.test', 'Starter', 'active', 'Australia', 349.00, '2026-02-19T10:15:00Z'),
  ('Mosaic AI', 'infra@mosaic.test', 'Scale', 'active', 'Singapore', 2799.00, '2026-03-06T07:40:00Z'),
  ('Orbit Health', 'security@orbit.test', 'Business', 'active', 'Sweden', 1499.00, '2026-03-22T13:25:00Z'),
  ('Paper Plane', 'founders@paperplane.test', 'Starter', 'paused', 'France', 0.00, '2026-04-11T12:00:00Z'),
  ('Quantica', 'data@quantica.test', 'Scale', 'active', 'Japan', 3199.00, '2026-05-02T06:50:00Z'),
  ('Relay Finance', 'engineering@relay.test', 'Business', 'active', 'Switzerland', 1899.00, '2026-06-18T15:35:00Z'),
  ('Solstice Energy', 'tech@solstice.test', 'Starter', 'trial', 'Spain', 0.00, '2026-07-09T09:05:00Z');

INSERT INTO projects (customer_id, name, slug, environment, is_active, created_at) VALUES
  (1, 'Customer Portal', 'customer-portal', 'production', true, '2025-11-05T10:00:00Z'),
  (1, 'Usage Pipeline', 'usage-pipeline', 'production', true, '2026-01-14T10:00:00Z'),
  (2, 'Fleet Controller', 'fleet-controller', 'production', true, '2025-12-16T10:00:00Z'),
  (3, 'Insights Dashboard', 'insights-dashboard', 'production', true, '2026-01-09T10:00:00Z'),
  (4, 'API Gateway', 'api-gateway', 'staging', true, '2026-01-28T10:00:00Z'),
  (5, 'Warehouse Sync', 'warehouse-sync', 'production', true, '2026-02-04T10:00:00Z'),
  (6, 'Design System', 'design-system', 'staging', true, '2026-02-20T10:00:00Z'),
  (7, 'Model Registry', 'model-registry', 'production', true, '2026-03-07T10:00:00Z'),
  (8, 'Patient API', 'patient-api', 'production', true, '2026-03-23T10:00:00Z'),
  (10, 'Experiment Tracker', 'experiment-tracker', 'production', true, '2026-05-03T10:00:00Z'),
  (11, 'Ledger Service', 'ledger-service', 'production', true, '2026-06-19T10:00:00Z'),
  (12, 'Forecast Engine', 'forecast-engine', 'development', false, '2026-07-10T10:00:00Z');

INSERT INTO activity_daily (project_id, event_date, active_users, requests, error_rate)
SELECT
  p.id,
  d.day::date,
  80 + p.id * 17 + (extract(day from d.day)::integer % 9) * 23,
  12000 + p.id * 3700 + (extract(day from d.day)::integer % 9) * 5100,
  round((0.08 + (p.id % 4) * 0.07 + (extract(day from d.day)::integer % 5) * 0.03)::numeric, 2)
FROM projects p
CROSS JOIN generate_series(date '2026-10-20', date '2026-10-28', interval '1 day') AS d(day);
