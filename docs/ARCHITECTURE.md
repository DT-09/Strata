# Architecture and execution model

## Runtime

STRATA is a static client application. The UI and graph renderer run on the main thread. DuckDB-Wasm runs through its asynchronous worker interface, so SQL work does not execute on the UI thread. The selected DuckDB-Wasm bundle is currently obtained from the jsDelivr bundle registry.

## File lifecycle

1. A user selects or drops a local file.
2. STRATA reads the file into a `Uint8Array` and registers it with DuckDB's virtual filesystem.
3. A SQL view is created over the registered CSV, TSV, Parquet or JSON file.
4. SQLite files use DuckDB's SQLite extension to attach the database and expose each user table as a view.
5. The browser session retains the registered file data. Reloading the page resets the DuckDB session; the user must re-import source files.

## Graph execution

The canvas is a directed graph. `executionOrder` uses Kahn's topological sort to reject cycles and produce a dependency-safe order. Each SQL node is materialized as a temporary DuckDB view. Its `$input` token resolves to the first connected upstream relation. This allows sequential SQL transforms without copying intermediate data into JavaScript.

A diff node requires two connected inputs. It uses `EXCEPT ALL` in both directions and labels each row `left_only` or `right_only`. This is a row-level multiset comparison; it does not infer business keys or align columns by semantic meaning.

Result and chart nodes pass through their upstream result. The chart renderer uses the first output column as its category and the first numeric output column as its measure.

## Persistence and export

The graph definition is stored in localStorage. Source bytes are not stored there. Exported project JSON contains graph state and SQL, not source datasets or credentials. On restore, source nodes are retained as placeholders and source files must be re-imported.

CSV export currently exports the bounded result preview. It is not a streaming export path for arbitrarily large query results.

## Privacy boundary

STRATA does not send imported dataset bytes to an application backend. DuckDB-Wasm runtime assets and optional SQLite extensions are downloaded from their configured CDN. Browser storage is not encrypted, and browser extensions or a compromised device remain outside STRATA's privacy boundary.

## Known engineering gaps

- Durable source storage using OPFS or an equivalent browser-backed filesystem.
- Streaming export from DuckDB's virtual filesystem.
- Query cancellation, progress reporting and memory-aware scheduling.
- Per-node cache invalidation and incremental recomputation.
- Column-level lineage and schema drift diagnostics.
- More extensive tests for file ingestion, SQL execution, SQLite extension loading, and diff semantics.
- Browser compatibility and large-file benchmarks on representative devices.