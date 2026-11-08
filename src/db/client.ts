// Database client (decision D12, revised D13): SQLite via sql.js — pure JavaScript/WebAssembly,
// so it installs on any machine and any Node version with no native compiling.
// The database lives in memory and is written to ./data/studio.db after every change
// (atomic write: temp file, then rename). Single-user, local app for Phase 1–2;
// PostgreSQL is the route for multi-user hosting.

import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import { migrate } from "drizzle-orm/sql-js/migrator";
import * as schema from "./schema";

export type DB = SQLJsDatabase<typeof schema>;

interface Handle {
  db: DB;
  sqlite: Database;
  file: string | null;
}

// Next.js can load this module more than once (pages, server actions, API routes are bundled
// separately). Keep one shared database per process on globalThis so every part of the app
// reads and writes the same data.
const g = globalThis as unknown as { __studioHandles?: WeakMap<DB, Handle>; __studioDb?: Promise<DB> };
const handles: WeakMap<DB, Handle> = (g.__studioHandles ??= new WeakMap<DB, Handle>());

async function loadSqlJs() {
  const wasmDir = path.join(process.cwd(), "node_modules", "sql.js", "dist");
  return initSqlJs({ locateFile: (f: string) => path.join(wasmDir, f) });
}

/** Open a database. Pass ":memory:" for tests. */
export async function openDb(file?: string): Promise<DB> {
  const target = file ?? process.env.STUDIO_DB ?? path.join(process.cwd(), "data", "studio.db");
  const SQL = await loadSqlJs();
  const onDisk = target !== ":memory:";
  const sqlite = onDisk && fs.existsSync(target) ? new SQL.Database(fs.readFileSync(target)) : new SQL.Database();
  sqlite.run("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  handles.set(db, { db, sqlite, file: onDisk ? target : null });
  persist(db);
  return db;
}

/** Write the in-memory database to disk. Call after every change. */
export function persist(db: DB): void {
  const h = handles.get(db);
  if (!h?.file) return;
  fs.mkdirSync(path.dirname(h.file), { recursive: true });
  const tmp = `${h.file}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(h.sqlite.export()));
  fs.renameSync(tmp, h.file);
  // export() can reset connection pragmas, so re-apply.
  h.sqlite.run("PRAGMA foreign_keys = ON;");
}

/** Shared database for the running app; seeds the demo project on first run. */
export function getDb(): Promise<DB> {
  if (!g.__studioDb) {
    g.__studioDb = (async () => {
      const db = await openDb();
      const { seedIfEmpty } = await import("./seed");
      if (seedIfEmpty(db)) persist(db);
      return db;
    })();
  }
  return g.__studioDb;
}
