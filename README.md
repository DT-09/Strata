# STRATA

**A local-first visual SQL and data engineering environment.**

STRATA turns local analytical files into executable visual pipelines. DuckDB-Wasm runs in a browser worker; XYFlow provides the graph canvas; project definitions are saved locally in the browser.

## What works

- **Local ingestion:** CSV, TSV, Parquet and JSON/JSONL. SQLite files are supported through DuckDB's SQLite extension; loading that extension may require network access. Dataset bytes are not uploaded to a STRATA backend.
- **SQL execution:** DuckDB-Wasm runs in a dedicated worker. SQL nodes create temporary views, so downstream SQL nodes can use the previous node's output through `$input`.
- **Visual pipeline:** connect source, SQL, result, chart and diff nodes. The execution planner validates the graph and rejects cycles.
- **Data comparison:** a diff node accepts two inputs and reports rows found only on the left or right using multiset `EXCEPT ALL`.
- **Results:** inspect a bounded preview, inspect source columns, view execution logs and render a basic bar chart.
- **Export/import:** export the graph as JSON, restore a graph from JSON, and export the current result preview as CSV.
- **Local recovery:** the graph is saved to browser localStorage. Source file bytes remain in the in-memory DuckDB session and must be re-imported after a page reload.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL, choose **Load sample data**, then run the pipeline. The starter SQL groups the bundled orders dataset by region.

## Development checks

```bash
npm run typecheck
npm run test
npm run build
```

GitHub Actions runs these checks on pushes and pull requests to `main`.

## Architecture

- `src/lib/useDuckDB.ts` — worker-backed DuckDB initialization, file registration and query execution.
- `src/lib/graph.ts` — DAG validation and topological ordering.
- `src/App.tsx` — canvas, pipeline execution, local project recovery and exports.
- `src/lib/graph.test.ts` — dependency ordering, cycle rejection and dangling-edge tests.

See [Architecture](docs/ARCHITECTURE.md) for execution semantics and known limits.

## Deployment

STRATA is a static Vite application. The included `vercel.json` configures the build and static output. No application API, database, account system or environment secrets are required.

## Important limits

STRATA is a browser application, not a claim of unlimited compute. Available memory, browser storage quotas, WebAssembly constraints and device performance limit practical dataset size. Query previews are capped at 100,000 rows to avoid rendering unbounded result sets. CSV export currently exports that preview, not an unlimited query stream. SQLite extension installation may require network access. Browser localStorage is not encrypted; do not use shared browser profiles for sensitive projects.

The current release is an early functional foundation. It does not yet provide full query-result streaming exports, OPFS-backed durable source storage, project-level version history, column-level lineage, collaboration, or measured multi-gigabyte performance guarantees.

## License

MIT. See [LICENSE](LICENSE).