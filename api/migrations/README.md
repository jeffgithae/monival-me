# Migrations

Mongoose will happily read documents written under an older shape, which is
exactly why schema changes need a versioned, replayable path: without one, a
field rename or a new required index is applied by hand against live tenant
data, differently on every environment, with no record of what ran.

Each migration is a single `.ts` file in this directory named
`<sequence>-<slug>.ts`, exporting `up`. The runner records every applied
migration in the `migrations` collection and only runs the ones that are
missing, so it is safe to re-run.

## Running

```bash
# Apply everything outstanding
npm run migrate

# See what would run, without touching the database
npm run migrate:status
```

The runner reads `MONGODB_URI` from `api/.env`, the same as the app.

## Writing one

```ts
// migrations/002-backfill-activity-status.ts
import { Db } from 'mongodb';

export const description = 'Default null activity.status to "draft"';

export async function up(db: Db): Promise<void> {
  await db.collection('activities').updateMany(
    { status: { $in: [null, undefined] } },
    { $set: { status: 'draft' } },
  );
}
```

Rules that keep this safe against live data:

- **Make it idempotent.** The runner will not re-run an applied migration, but a
  half-finished run must be safe to repeat — filter on the state you are
  changing (`{ status: null }`), not on everything.
- **Never delete a field in the same release that stops writing it.** Ship the
  code that stops writing, deploy, then remove the field in a later migration —
  otherwise a rollback lands on data the old code cannot read.
- **Prefer additive index builds.** On a large collection, create indexes in the
  background and expect the migration to take minutes, not milliseconds.
- **One concern per file.** A migration that both renames a field and backfills a
  different collection cannot be reasoned about when it fails halfway.

## Before running against production

Take a backup and verify it restores. `mongodump --uri "$MONGODB_URI"` produces
a restorable archive; a backup nobody has restored is not a backup.
