// Usage: npm run migrate [-- up | down [N] | status]
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { loadMigrations, migrateUp, migrateDown, status } from "../migrations/runner.js";

const [cmd = "up", arg] = process.argv.slice(2);
if (!["up", "down", "status"].includes(cmd)) {
  console.error("Usage: migrate [up | down [steps] | status]");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const migrations = await loadMigrations();
  if (cmd === "status") {
    for (const s of await status(db, migrations)) console.log(`${s.applied ? "✔ applied " : "… pending "} ${s.name}`);
  } else if (cmd === "up") {
    const ran = await migrateUp(db, migrations, console.log);
    console.log(ran.length ? `Applied ${ran.length} migration(s).` : "Already up to date.");
  } else {
    const ran = await migrateDown(db, migrations, Number(arg) || 1, console.log);
    console.log(ran.length ? `Reverted ${ran.length} migration(s).` : "Nothing to revert.");
  }
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
