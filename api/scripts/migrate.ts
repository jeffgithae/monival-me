/**
 * Migration runner.
 *
 * Applies every migration in `api/migrations` that is not already recorded in
 * the `migrations` collection, in filename order. Idempotent: re-running after
 * a successful pass is a no-op.
 *
 *   npm run migrate           apply outstanding migrations
 *   npm run migrate:status    list applied/pending without changing anything
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { Db, MongoClient } from 'mongodb';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../migrations');
const COLLECTION = 'migrations';

interface Migration {
  name: string;
  description?: string;
  up: (db: Db) => Promise<void>;
}

function loadEnv(): void {
  const envPath = join(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function discover(): Migration[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /\.(ts|js)$/.test(f) && !f.endsWith('.d.ts'))
    .sort()
    .map((file) => {
      const name = file.replace(/\.(ts|js)$/, '');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(join(MIGRATIONS_DIR, file));
      if (typeof mod.up !== 'function') {
        throw new Error(`Migration ${file} does not export an \`up\` function.`);
      }
      return { name, description: mod.description, up: mod.up };
    });
}

async function main(): Promise<void> {
  loadEnv();

  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    console.error('MONGODB_URI is not set — add it to api/.env or the environment.');
    process.exit(1);
  }

  const statusOnly = process.argv.includes('--status');
  const migrations = discover();

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db();
    const applied = new Set(
      (await db.collection(COLLECTION).find({}, { projection: { name: 1 } }).toArray())
        .map((d) => d['name'] as string),
    );

    const pending = migrations.filter((m) => !applied.has(m.name));

    if (statusOnly) {
      console.log(`\n${migrations.length} migration(s) found in ${MIGRATIONS_DIR}\n`);
      for (const m of migrations) {
        const mark = applied.has(m.name) ? 'applied' : 'PENDING';
        console.log(`  [${mark}] ${m.name}${m.description ? ` — ${m.description}` : ''}`);
      }
      console.log(`\n${pending.length} pending.\n`);
      return;
    }

    if (pending.length === 0) {
      console.log('No pending migrations — database is up to date.');
      return;
    }

    for (const migration of pending) {
      const startedAt = new Date();
      console.log(`→ ${migration.name}${migration.description ? ` — ${migration.description}` : ''}`);
      try {
        await migration.up(db);
      } catch (err) {
        // Stop on the first failure: applying later migrations on top of a
        // half-applied one is how databases end up in states nobody can reason
        // about. The failed migration is not recorded, so a fixed version
        // re-runs from the same point.
        console.error(`✗ ${migration.name} failed:`, err);
        process.exitCode = 1;
        return;
      }
      await db.collection(COLLECTION).insertOne({
        name: migration.name,
        description: migration.description ?? null,
        appliedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      });
      console.log(`✓ ${migration.name}`);
    }

    console.log(`\nApplied ${pending.length} migration(s).`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
