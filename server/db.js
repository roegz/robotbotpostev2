import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, SERVER_DIR } from './config.js';

const { Pool } = pg;

const connectionString = (process.env.DATABASE_URL || '').trim();
export const DB_KIND = connectionString ? 'postgres' : 'sqlite';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const isoNow = () => new Date().toISOString();
export const isoInHours = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

function normalizeRows(rows) {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (row[key] instanceof Date) row[key] = row[key].toISOString();
    }
  }
  return rows;
}

function cleanSqliteParams(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

const isReadStatement = (sql) =>
  /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql);

/* ------------------------------------------------------------------ */
/* Pilotes                                                             */
/* ------------------------------------------------------------------ */

let impl;

if (DB_KIND === 'postgres') {
  const wantsSsl = /sslmode=(require|verify-ca|verify-full)/i.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
    application_name: 'robotbotposte',
  });

  pool.on('error', (err) => {
    console.error('[db] erreur du pool PostgreSQL :', err.message);
  });

  impl = {
    async all(sql, params = []) {
      let index = 0;
      const text = sql.replace(/\?/g, () => `$${++index}`);
      const result = await pool.query(text, params);
      return normalizeRows(result.rows);
    },
    async run(sql, params = []) {
      let index = 0;
      const text = sql.replace(/\?/g, () => `$${++index}`);
      const result = await pool.query(text, params);
      return { changes: result.rowCount ?? 0 };
    },
    async init() {
      const schema = fs.readFileSync(path.join(SERVER_DIR, 'schema.pg.sql'), 'utf8');
      await pool.query(schema);
    },
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
} else {
  const file = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(DATA_DIR, 'robotbotposte.db');

  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 5000;');

  impl = {
    async all(sql, params = []) {
      const statement = sqlite.prepare(sql);
      return statement.all(...cleanSqliteParams(params));
    },
    async run(sql, params = []) {
      const statement = sqlite.prepare(sql);
      const info = statement.run(...cleanSqliteParams(params));
      return { changes: Number(info.changes ?? 0) };
    },
    async init() {
      const schema = fs.readFileSync(path.join(SERVER_DIR, 'schema.sqlite.sql'), 'utf8');
      sqlite.exec(schema);
    },
    async ping() {
      sqlite.prepare('SELECT 1').get();
    },
    async close() {
      sqlite.close();
    },
  };
}

/* ------------------------------------------------------------------ */
/* API publique                                                        */
/* ------------------------------------------------------------------ */

export const db = {
  kind: DB_KIND,
  all: (sql, params) => impl.all(sql, params),
  run: (sql, params) => impl.run(sql, params),
  async get(sql, params) {
    const rows = await impl.all(sql, params);
    return rows[0] ?? null;
  },
  init: () => impl.init(),
  ping: () => impl.ping(),
  close: () => impl.close(),
};

/** Exécute plusieurs requêtes dans une transaction. */
export async function transaction(fn) {
  // Volontairement simple : nos écritures critiques sont atomiques en une requête.
  // Cette fonction existe pour de futures évolutions.
  return fn();
}

// `isReadStatement` est exporté pour les tests / usages avancés.
export { isReadStatement };
