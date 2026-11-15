import { useCallback, useEffect, useState } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

type EngineState = 'starting' | 'ready' | 'error';
type Engine = { db: duckdb.AsyncDuckDB; conn: duckdb.AsyncDuckDBConnection };

export function useDuckDB() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [state, setState] = useState<EngineState>('starting');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let worker: Worker | undefined;
    let db: duckdb.AsyncDuckDB | undefined;
    (async () => {
      try {
        const bundles = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(bundles);
        worker = new Worker(bundle.mainWorker!);
        db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        const conn = await db.connect();
        if (active) { setEngine({ db, conn }); setState('ready'); }
        else { await conn.close(); await db.terminate(); }
      } catch (cause) {
        if (active) { setError(cause instanceof Error ? cause.message : String(cause)); setState('error'); }
      }
    })();
    return () => {
      active = false;
      void engine?.conn.close();
      void db?.terminate();
      worker?.terminate();
    };
  // Engine is deliberately not a dependency: initialization is one-shot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importFile = useCallback(async (file: File) => {
    if (!engine) throw new Error('The SQL engine is not ready.');
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const table = safeName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_') || 'dataset';
    const buffer = new Uint8Array(await file.arrayBuffer());
    await engine.db.registerFileBuffer(safeName, buffer);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const quoted = '"' + table.replace(/"/g, '""') + '"';
    if (ext === 'csv' || ext === 'tsv') {
      await engine.conn.query(`CREATE OR REPLACE VIEW ${quoted} AS SELECT * FROM read_csv_auto('${safeName.replace(/'/g, "''")}', header=true)`);
    } else if (ext === 'parquet') {
      await engine.conn.query(`CREATE OR REPLACE VIEW ${quoted} AS SELECT * FROM read_parquet('${safeName.replace(/'/g, "''")}')`);
    } else if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') {
      await engine.conn.query(`CREATE OR REPLACE VIEW ${quoted} AS SELECT * FROM read_json_auto('${safeName.replace(/'/g, "''")}')`);
    } else if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
      try {
        await engine.conn.query('INSTALL sqlite; LOAD sqlite;');
        await engine.conn.query(`ATTACH '${safeName.replace(/'/g, "''")}' AS sqlite_source (TYPE SQLITE)`);
        await engine.conn.query(`CREATE OR REPLACE VIEW ${quoted} AS SELECT * FROM sqlite_source.sqlite_master WHERE type = 'table'`);
      } catch {
        throw new Error('SQLite import needs DuckDB’s SQLite extension. The extension could not be loaded in this browser session. CSV, Parquet and JSON imports do not need this extension.');
      }
    } else {
      throw new Error('Unsupported file type. Choose CSV, TSV, Parquet, JSON, JSONL or SQLite.');
    }
    const schema = await engine.conn.query(`DESCRIBE SELECT * FROM ${quoted}`);
    const columns = schema.toArray().map((row) => String(row.column_name));
    const count = await engine.conn.query(`SELECT COUNT(*) AS n FROM ${quoted}`);
    const rows = Number(count.toArray()[0]?.n ?? 0);
    return { table, fileName: file.name, bytes: file.size, columns, rows };
  }, [engine]);

  const query = useCallback(async (sql: string) => {
    if (!engine) throw new Error('The SQL engine is not ready.');
    const start = performance.now();
    const result = await engine.conn.query(sql);
    return {
      columns: result.schema.fields.map((field) => field.name),
      rows: result.toArray().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])) as Record<string, unknown>),
      durationMs: Math.round(performance.now() - start),
    };
  }, [engine]);

  return { state, error, importFile, query };
}
