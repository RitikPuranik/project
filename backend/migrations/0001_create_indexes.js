// Creates the indexes the app relies on (idempotent; safe if Mongoose already built them).
const INDEXES = [
  ["users", { email: 1 }, { unique: true, name: "email_1" }],
  ["users", { googleId: 1 }, { unique: true, sparse: true, name: "googleId_1" }],
  ["projects", { owner: 1, isDeleted: 1 }, { name: "owner_1_isDeleted_1" }],
  ["projects", { "members.user": 1 }, { name: "members.user_1" }],
  ["tasks", { project: 1, columnId: 1, order: 1 }, { name: "project_1_columnId_1_order_1" }],
];

export const up = async (db) => {
  for (const [col, keys, opts] of INDEXES) await db.collection(col).createIndex(keys, opts);
};

export const down = async (db) => {
  for (const [col, , opts] of INDEXES) {
    // email_1 / googleId_1 may also be managed by Mongoose; dropping only removes our copy.
    await db.collection(col).dropIndex(opts.name).catch(() => {});
  }
};
