import type { D1Database } from "@cloudflare/workers-types";

// A minimal D1Database-compatible shim backed by Node's built-in `node:sqlite`,
// used only for tests. Real deployments use Cloudflare D1 (also SQLite) —
// this shim implements the same surface (prepare/bind/first/all/run/batch)
// our app code calls, so route handlers run unmodified against it.
import { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;

class BoundStatement {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[]) {}
  first<T = Row>(): T | null {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.args as never[]));
    return (row as T) ?? null;
  }
  all<T = Row>(): { results: T[] } {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.args as never[]));
    return { results: rows as T[] };
  }
  run(): { meta: { changes: number; last_row_id: number } } {
    const stmt = this.db.prepare(this.sql);
    const result = stmt.run(...(this.args as never[]));
    return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

class PreparedStatement {
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...args: unknown[]) {
    return new BoundStatement(this.db, this.sql, args);
  }
  // Some call sites run a prepared statement with no params directly.
  first<T = Row>() { return this.bind().first<T>(); }
  all<T = Row>() { return this.bind().all<T>(); }
  run() { return this.bind().run(); }
}

export class D1Shim {
  private db: DatabaseSync;
  constructor() {
    this.db = new DatabaseSync(":memory:");
  }
  prepare(sql: string) {
    return new PreparedStatement(this.db, sql);
  }
  async batch<T = unknown>(statements: BoundStatement[]): Promise<T[]> {
    this.db.exec("BEGIN");
    try {
      const results = statements.map((s) => s.run());
      this.db.exec("COMMIT");
      return results as T[];
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  exec(sql: string) {
    this.db.exec(sql);
  }
  close() {
    this.db.close();
  }
}

/** Applies every drizzle/*.sql migration, in order, to a fresh in-memory database. */
/** Casts the shim to D1Database's TypeScript shape — the shim implements only the subset of the interface (prepare/batch/exec) our app code actually calls. */
export function asD1(shim: D1Shim): D1Database {
  return shim as unknown as D1Database;
}

export async function createMigratedD1(): Promise<D1Shim> {
  const shim = new D1Shim();
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.resolve(import.meta.dirname, "../../drizzle");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(dir, file), "utf8");
    const statements = sql.split("--> statement-breakpoint");
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) shim.exec(trimmed);
    }
  }
  return shim;
}
