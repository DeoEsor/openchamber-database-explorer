#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

docker compose exec -T valkey valkey-cli SET workspace:northwind:plan '"Scale"' >/dev/null
docker compose exec -T valkey valkey-cli SET workspace:northwind:members '42' >/dev/null
docker compose exec -T valkey valkey-cli SET session:demo:user '{"id":"usr_1024","name":"Alex Morgan","role":"admin"}' >/dev/null
docker compose exec -T valkey valkey-cli SET cache:feature-flags '{"auditLog":true,"analytics":true,"scim":false}' >/dev/null
docker compose exec -T valkey valkey-cli SET metrics:requests:2026-10-28 '1849203' >/dev/null
docker compose exec -T valkey valkey-cli SET metrics:active-users '12840' >/dev/null

printf '%s\n' 'Valkey demo keys are ready.'
