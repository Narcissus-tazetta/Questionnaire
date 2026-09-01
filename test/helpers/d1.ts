import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal D1Database-shaped adapter over bun:sqlite, enough for queries.ts. */
export function makeD1(): D1Database {
  const db = new Database(":memory:");
  for (const f of ["0001_init.sql", "0002_result_message_id.sql"]) {
    db.exec(readFileSync(join(process.cwd(), "migrations", f), "utf8"));
  }

  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        params = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        return (db.query(sql).get(...(params as never[])) as T) ?? null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: db.query(sql).all(...(params as never[])) as T[] };
      },
      async run() {
        const r = db.run(sql, params as never[]);
        return { meta: { changes: r.changes } };
      },
    };
    return stmt;
  };

  return { prepare } as unknown as D1Database;
}
