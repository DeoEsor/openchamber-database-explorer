#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

docker compose exec -T valkey valkey-cli SET workspace:northwind:plan '"Scale"' >/dev/null
docker compose exec -T valkey valkey-cli SET workspace:northwind:members '42' >/dev/null
docker compose exec -T valkey valkey-cli SET session:demo:user '{"id":"usr_1024","name":"Alex Morgan","role":"admin"}' >/dev/null
docker compose exec -T valkey valkey-cli SET cache:feature-flags '{"auditLog":true,"analytics":true,"scim":false}' >/dev/null
docker compose exec -T valkey valkey-cli SET metrics:requests:2026-10-28 '1849203' >/dev/null
docker compose exec -T valkey valkey-cli SET metrics:active-users '12840' >/dev/null
docker compose exec -T valkey valkey-cli SET session:demo:expiring '{"role":"editor"}' EX 3600 >/dev/null

docker compose exec -T valkey valkey-cli DEL workspace:northwind:settings >/dev/null
docker compose exec -T valkey valkey-cli HSET workspace:northwind:settings region 'eu-west-1' theme 'dark' notifications 'enabled' >/dev/null

docker compose exec -T valkey valkey-cli DEL queue:provision >/dev/null
docker compose exec -T valkey valkey-cli RPUSH queue:provision 'workspace:create' 'database:migrate' 'search:reindex' >/dev/null

docker compose exec -T valkey valkey-cli DEL workspace:northwind:roles >/dev/null
docker compose exec -T valkey valkey-cli SADD workspace:northwind:roles owner admin developer viewer >/dev/null

docker compose exec -T valkey valkey-cli DEL metrics:response-times >/dev/null
docker compose exec -T valkey valkey-cli ZADD metrics:response-times 42 'api:list' 87 'api:update' 125 'search:query' >/dev/null

docker compose exec -T valkey valkey-cli DEL events:workspace >/dev/null
docker compose exec -T valkey valkey-cli XADD events:workspace 1767225600000-0 action 'workspace.created' actor 'admin@example.test' >/dev/null
docker compose exec -T valkey valkey-cli XADD events:workspace 1767225660000-0 action 'member.invited' actor 'owner@example.test' >/dev/null

printf '%s\n' 'Valkey demo keys for all supported types are ready.'
