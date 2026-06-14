#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${DB_CONTAINER_NAME:-passport-postgres}"
VOLUME_NAME="${DB_VOLUME_NAME:-passport-postgres-data}"
HOST="${DB_HOST:-127.0.0.1}"
PORT="${DB_PORT:-55432}"
DB_NAME="${POSTGRES_DB:-passport}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
IMAGE="${POSTGRES_IMAGE:-postgres:17-alpine}"

die() {
	printf 'error: %s\n' "$1" >&2
	exit 1
}

command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
docker info >/dev/null 2>&1 || die "docker is not running"

existing_container_id="$(docker ps -aq --filter "name=^/${CONTAINER_NAME}$")"
running_container_id="$(docker ps -q --filter "name=^/${CONTAINER_NAME}$")"

if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
	if [ -z "${running_container_id}" ]; then
		lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >&2 || true
		die "port ${PORT} is already in use; set DB_PORT to a free port or stop the process above"
	fi
fi

if [ -n "${existing_container_id}" ]; then
	printf 'Starting existing container %s...\n' "${CONTAINER_NAME}"
	docker start "${CONTAINER_NAME}" >/dev/null
else
	printf 'Creating Postgres container %s on %s:%s...\n' "${CONTAINER_NAME}" "${HOST}" "${PORT}"
	docker volume create "${VOLUME_NAME}" >/dev/null
	docker run -d \
		--name "${CONTAINER_NAME}" \
		-e POSTGRES_DB="${DB_NAME}" \
		-e POSTGRES_USER="${DB_USER}" \
		-e POSTGRES_PASSWORD="${DB_PASSWORD}" \
		-p "${HOST}:${PORT}:5432" \
		-v "${VOLUME_NAME}:/var/lib/postgresql/data" \
		--health-cmd="pg_isready -U ${DB_USER} -d ${DB_NAME}" \
		--health-interval=2s \
		--health-timeout=5s \
		--health-retries=30 \
		"${IMAGE}" >/dev/null
fi

printf 'Waiting for Postgres to accept connections'
for _ in $(seq 1 60); do
	if docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
		printf '\n'
		break
	fi
	printf '.'
	sleep 1
done

docker exec "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1 ||
	die "Postgres did not become ready in time"

if command -v nc >/dev/null 2>&1; then
	nc -z "${HOST}" "${PORT}" || die "container is healthy but ${HOST}:${PORT} is not reachable"
fi

cat <<EOF
Postgres is ready.

DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}

Next:
  DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME} pnpm drizzle-kit migrate
EOF
