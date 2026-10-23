import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const COLLECTION = "schema_migrations";

// Migration files are named NNNN_description.js and export `up(db)` and `down(db)`,
// where `db` is the native MongoDB driver Db (mongoose.connection.db). Applied
// migrations are recorded in the `schema_migrations` collection and run in filename order.
export const loadMigrations = async (dir = here) => {
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.js$/.test(f)).sort();
  return Promise.all(
    files.map(async (f) => ({ name: f.replace(/\.js$/, ""), ...(await import(pathToFileURL(path.join(dir, f)).href)) }))
  );
};

const appliedNames = async (db) =>
  (await db.collection(COLLECTION).find({}).toArray()).map((r) => r.name);

export const status = async (db, migrations) => {
  const done = new Set(await appliedNames(db));
  return migrations.map((m) => ({ name: m.name, applied: done.has(m.name) }));
};

/** Apply every pending migration in order. Returns the names applied. */
export const migrateUp = async (db, migrations, log = () => {}) => {
  const done = new Set(await appliedNames(db));
  const ran = [];
  for (const m of migrations) {
    if (done.has(m.name)) continue;
    log(`↑ ${m.name}`);
    await m.up(db);
    await db.collection(COLLECTION).insertOne({ name: m.name, appliedAt: new Date() });
    ran.push(m.name);
  }
  return ran;
};

/** Roll back the last `steps` applied migrations (newest first). Returns the names reverted. */
export const migrateDown = async (db, migrations, steps = 1, log = () => {}) => {
  const done = new Set(await appliedNames(db));
  const applied = migrations.filter((m) => done.has(m.name)).reverse().slice(0, steps);
  const ran = [];
  for (const m of applied) {
    log(`↓ ${m.name}`);
    await m.down(db);
    await db.collection(COLLECTION).deleteOne({ name: m.name });
    ran.push(m.name);
  }
  return ran;
};
