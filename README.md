# STRATA

**A local-first visual SQL and data engineering environment.**

STRATA turns local analytical files into reproducible, executable data pipelines. It runs DuckDB-Wasm in a browser worker, connects transformations through a directed acyclic graph, and keeps project state in the browser.

> Status: initial implementation in progress. See the architecture and capability notes below; performance and browser limits are measured, not assumed.

## Core workflow

1. Import CSV, Parquet, JSON, or SQLite data locally.
2. Inspect source schemas and preview records.
3. Connect source, SQL, preview, chart, and comparison nodes.
4. Execute the dependency graph in topological order.
5. Inspect query results and export data or the project definition.

## Principles

- No application backend and no account required.
- SQL and file data stay in the browser session; STRATA does not upload datasets.
- DuckDB-Wasm runs in a Web Worker so query execution does not block canvas interaction.
- Graph execution is deterministic for a fixed project and source set, subject to DuckDB and browser behavior.
- Browser memory, file-system APIs, and worker support impose practical limits. STRATA reports errors instead of claiming unlimited file sizes.

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

## Deployment

Deploy as a static Vite application. Vercel configuration is included. No server functions, database, API keys, or environment secrets are required.

## Security and privacy

Imported files are processed client-side. Project persistence is opt-in through browser storage. Do not treat browser storage as encrypted storage; avoid using shared browser profiles for sensitive data. The app does not provide authentication, team collaboration, or remote project sync.

## License

MIT. See [LICENSE](LICENSE).
