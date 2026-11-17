import { useCallback, useEffect, useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

type EngineState = 'starting' | 'ready' | 'error';
type Engine = { db: duckdb.AsyncDuckDB; conn: duckdb.AsyncDuckDBConnection };

function quoteIdentifier(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}
function quoteLiteral(value: string) {
  return "'" + value.replace(/'/g, "''") + "'";
}

export function useDuckDB() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [state, setState] = useState<EngineState>('starting');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let worker: Worker | undefined;
    let db: duckdb.AsyncDuckDB | undefined;
    let conn: duckdb.AsyncDuckDBConnection | undefined;
    let workerUrl: string | undefined;
    (async () => {
      try {
        const bundles = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(bundles);
        workerUrl = URL.createObjectURL(new Blob(
          [`importScripts("${bundle.mainWorker}");`],
          { type: 'text/javascript' },
        ));
        worker = new Worker(workerUrl);
        db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        const connection = await db.connect();
        conn = connection;
        if (active) { setEngine({ db, conn: connection }); setState('ready'); }
        else { await connection.close(); await db.terminate(); }
      } catch (cause) {
        if (active) { setError(cause instanceof Error ? cause.message : String(cause)); setState('error'); }
        try { await conn?.close(); } catch { /* ignore teardown failures */ }
        try { await db?.terminate(); } catch { /* ignore teardown failures */ }
        worker?.terminate();
      } finally {
        if (workerUrl) URL.revokeObjectURL(workerUrl);
      }
    })();
    return () => {
      active = false;
      void conn?.close();
      void db?.terminate();
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    };
  // Engine is deliberately not a dependency: initialization is one-shot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importFile = useCallback(async (file: File) => {
    if (!engine) throw new Error('The SQL engine is not ready.');
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || 'dataset';
    const buffer = new Uint8Array(await file.arrayBuffer());
    await engine.db.registerFileBuffer(safeName, buffer);
    const ext = file.name.split('.').pop()?.toLowerCase();
    let table = base;
    if (ext === 'csv' || ext === 'tsv') {
      await engine.conn.query(`CREATE OR REPLACE VIEW ${quoteIdentifier(table)} AS SELECT * FROM read_csv_auto(${quoteLiteral(safeName)}, header=true)`);
    } else if (ext === 'parquet') {
      await engine.conn.query(`CREATE OR REPLACE VIEW ${quoteIdentifier(table)} AS SELECT * FROM read_parquet(${quoteLiteral(safeName)})`);
    } else if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') {
      await engine.conn.query(`CREATE OR REPLACE VIEW ${quoteIdentifier(table)} AS SELECT * FROM read_json_auto(${quoteLiteral(safeName)})`);
    } else if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
      try {
        await engine.conn.query('INSTALL sqlite; LOAD sqlite;');
        const alias = `strata_sqlite_${crypto.randomUUID().replace(/-/g, '')}`;
        await engine.conn.query(`ATTACH ${quoteLiteral(safeName)} AS ${quoteIdentifier(alias)} (TYPE SQLITE)`);
        const catalog = await engine.conn.query(`SELECT name FROM ${quoteIdentifier(alias)}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
        const names = catalog.toArray().map((row) => String(row.name));
        if (!names.length) throw new Error('The SQLite file contains no user tables.');
        for (const name of names) {
          const viewName = `${base}_${name}`;
          await engine.conn.query(`CREATE OR REPLACE VIEW ${quoteIdentifier(viewName)} AS SELECT * FROM ${quoteIdentifier(alias)}.${quoteIdentifier(name)}`);
        }
        table = `${base}_${names[0]}`;
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`SQLite import failed. DuckDB's SQLite extension must be available in this browser session. ${detail}`);
      }
    } else {
      throw new Error('Unsupported file type. Choose CSV, TSV, Parquet, JSON, JSONL or SQLite.');
    }
    const schema = await engine.conn.query(`DESCRIBE SELECT * FROM ${quoteIdentifier(table)}`);
    const columns = schema.toArray().map((row) => String(row.column_name));
    const count = await engine.conn.query(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(table)}`);
    const rows = Number(count.toArray()[0]?.n ?? 0);
    return { table, fileName: file.name, bytes: file.size, columns, rows };
  }, [engine]);

  const query = useCallback(async (sql: string) => {
    if (!engine) throw new Error('The SQL engine is not ready.');
    const start = performance.now();
    const result = await engine.conn.query(sql);
    return {
      columns: result.schema.fields.map((field) => field.name),
      rows: result.toArray().map((row) => {
        const record = row.toJSON() as Record<string, unknown>;
        return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]));
      }),
      durationMs: Math.round(performance.now() - start),
    };
  }, [engine]);

  return { state, error, importFile, query };
}
