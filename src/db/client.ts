// Database client. A single SQLite file under ./data (configurable with STUDIO_DB).
// Migrations in ./drizzle are applied automatically on first use, and the demo
// project is seeded if the database is empty.

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

let cached: DB | undefined;

export function openDb(file?: string): DB {
  const target = file ?? process.env.STUDIO_DB ?? path.join(process.cwd(), "data", "studio.db");
  if (target !== ":memory:") fs.mkdirSync(path.dirname(target), { recursive: true });
  const sqlite = new Database(target);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export function getDb(): DB {
  if (!cached) {
    cached = openDb();
    // Lazy import avoids a cycle: seed uses the schema, not the client.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seedIfEmpty } = require("./seed") as typeof import("./seed");
    seedIfEmpty(cached);
  }
  return cached;
}
