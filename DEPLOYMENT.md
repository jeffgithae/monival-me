# Deployment & Operations

How to run Evidara as a service rather than as an application: what to build,
what to set, how to back it up, and how to tell when it is broken.

## What ships

| Component | Image | Port | Notes |
|---|---|---|---|
| API | built from `api/Dockerfile` | 3000 | NestJS, serves under `/api` |
| Web | built from `web/Dockerfile` | 80 | Angular bundle behind nginx |
| Database | `mongo:7` | 27017 | The only stateful component |

`docker compose up --build` brings the whole stack up locally in the same shape
it runs in production. The API waits on Mongo's healthcheck, so it will not
start against a database that is still initialising.

## Required configuration

Copy `api/.env.example` to `api/.env` and fill it in. The API **refuses to boot
in production** if `JWT_SECRET` or `ENCRYPTION_KEY` is missing, a placeholder,
or shorter than 16 characters — see `assertProductionSecrets` in `api/src/main.ts`.
Generate real ones:

```bash
openssl rand -hex 32   # once for JWT_SECRET, once for ENCRYPTION_KEY
```

`ENCRYPTION_KEY` decrypts stored OAuth client secrets and cloud credentials.
**Rotating it without re-encrypting those records makes them unreadable** — treat
it as permanent unless you have written the re-encryption step.

## Deploy sequence

1. CI builds and tests on push (`.github/workflows/ci.yml`).
2. Build and push the two images, tagged with the commit SHA.
3. **Back up the database** (below) — before migrations, not after.
4. Run outstanding migrations: `npm run migrate` (see `api/migrations/README.md`).
5. Roll the API, then the web bundle.
6. Confirm `GET /api/health` returns 200 and watch the error rate for a few minutes.

Migrations run as a separate step, not on boot: a migration that runs on every
container start races itself the moment you run more than one replica.

## Backup and restore

The Mongo volume is the only thing that cannot be rebuilt from the repository.

**Back up** (nightly, retained off-host):

```bash
docker compose exec -T mongo mongodump \
  --uri "mongodb://localhost:27017/evidara" \
  --archive --gzip > "evidara-$(date +%F).archive.gz"
```

**Restore** into a scratch database first, always:

```bash
gunzip -c evidara-2026-01-01.archive.gz | docker compose exec -T mongo mongorestore \
  --archive --gzip \
  --nsFrom 'evidara.*' --nsTo 'evidara_restore_test.*'
```

Then point a throwaway API instance at `evidara_restore_test` and log in. **A
backup nobody has restored is not a backup** — schedule this test quarterly and
after any change to the schema or the backup command. Restoring over the live
database is the last resort, done with the API stopped.

## Health and failure visibility

- **Liveness/readiness:** `GET /api/health`. Both Dockerfiles declare a
  `HEALTHCHECK` so an orchestrator can distinguish started from serving.
- **Errors:** every unhandled 5xx passes through `AllExceptionsFilter`, which
  stamps a `requestId`, returns it to the client, and reports the failure. Set
  `SENTRY_DSN` and install `@sentry/node` to forward those to Sentry; without
  it they are emitted as single-line JSON for a log-shipping stack to index.
  4xx are deliberately not reported — they are expected outcomes and would bury
  real defects.
- **Correlating a report:** a user quoting a `requestId` from an error response
  can be matched directly against the log line and the Sentry event.

## Data protection notes

Beneficiary records include national IDs, refugee/IDP status, and disability
status. Before onboarding an organisation with a data-protection officer,
confirm: the backup destination's jurisdiction and retention, who holds
`ENCRYPTION_KEY`, and the deletion path for a data-subject erasure request.
