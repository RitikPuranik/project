// Backfills fields added after the first release so older documents behave like new ones.
export const up = async (db) => {
  await db.collection("users").updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } });
  await db.collection("users").updateMany({ isVerified: { $exists: false } }, { $set: { isVerified: true } });
  await db.collection("projects").updateMany({ isArchived: { $exists: false } }, { $set: { isArchived: false } });
  await db.collection("projects").updateMany({ isDeleted: { $exists: false } }, { $set: { isDeleted: false } });
  await db.collection("tasks").updateMany({ version: { $exists: false } }, { $set: { version: 0 } });
};

// Irreversible by design: the defaults are valid data, so there is nothing to undo.
export const down = async () => {};
