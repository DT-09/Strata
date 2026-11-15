import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addEdge, Background, BackgroundVariant, Controls, MiniMap, ReactFlow,
  useEdgesState, useNodesState, type Connection, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Activity, ArrowDownToLine, Braces, ChartNoAxesCombined, Check, ChevronDown, CircleHelp, Clock3, Code2, Database, FileJson, FilePlus2, GitCompareArrows, HardDrive, Layers3, Play, Plus, Save, Search, Settings2, Table2, Upload, X, Zap } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'sql-formatter';
import { useDuckDB } from './lib/useDuckDB';
import { executionOrder } from './lib/graph';
import type { ProjectFile, SourceData, StrataNode, StrataNodeData } from './lib/types';

const initialSql = `SELECT
  region,
  COUNT(*) AS orders,
  ROUND(SUM(amount), 2) AS revenue
FROM orders
GROUP BY region
ORDER BY revenue DESC;`;

function NodeCard({ data, selected }: NodeProps<StrataNode>) {
  const d = data as StrataNodeData;
  return <div className={`node-card ${d.kind} ${selected ? 'selected' : ''}`}>
    <div className="node-topline"><span className="node-icon">{d.kind === 'source' ? <Database size={14}/> : d.kind === 'query' ? <Code2 size={14}/> : d.kind === 'chart' ? <ChartNoAxesCombined size={14}/> : d.kind === 'diff' ? <GitCompareArrows size={14}/> : <Table2 size={14}/>}</span><span className="node-kind">{d.kind}</span><span className={`node-status ${d.status ?? 'idle'}`}>{d.status === 'success' ? 'ready' : d.status ?? 'idle'}</span></div>
    <div className="node-title">{d.label}</div>
    {d.kind === 'source' && <div className="node-meta">{d.source ? `${d.source.rows.toLocaleString()} rows · ${d.source.columns.length} columns` : 'Waiting for a local file'}</div>}
    {d.kind === 'query' && <div className="node-meta">SQL transformation · edit in inspector</div>}
    {(d.kind === 'result' || d.kind === 'chart' || d.kind === 'diff') && <div className="node-meta">{d.rows ? `${d.rows.length.toLocaleString()} preview rows` : 'Waiting for upstream output'}</div>}
    {d.error && <div className="node-error">{d.error}</div>}
    <div className="node-port-label">INPUT / OUTPUT</div>
  </div>;
}

const nodeTypes = { strata: NodeCard };
const starterNodes: StrataNode[] = [
  { id: 'source-demo', type: 'strata', position: { x: 90, y: 170 }, data: { kind: 'source', label: 'orders.csv', source: undefined } },
  { id: 'query-demo', type: 'strata', position: { x: 430, y: 170 }, data: { kind: 'query', label: 'Revenue by region', sql: initialSql } },
  { id: 'result-demo', type: 'strata', position: { x: 790, y: 170 }, data: { kind: 'result', label: 'Result table' } },
];

function App() {
  const { state: engineState, error: engineError, importFile, query } = useDuckDB();
  const [nodes, setNodes, onNodesChange] = useNodesState<StrataNode>(starterNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([{ id: 'e1', source: 'source-demo', target: 'query-demo', animated: true }, { id: 'e2', source: 'query-demo', target: 'result-demo', animated: true }]);
  const [selectedId, setSelectedId] = useState('query-demo');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Ready when the engine is online.');
  const [activeTab, setActiveTab] = useState<'results' | 'schema' | 'logs'>('results');
  const [resultRows, setResultRows] = useState<Record<string, unknown>[]>([]);
  const [resultColumns, setResultColumns] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>(['Workspace initialized.', 'Local execution runtime starting…']);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = nodes.find((node) => node.id === selectedId);
  const selectedData = selected?.data as StrataNodeData | undefined;
  const sources = nodes.filter((node) => node.data.kind === 'source');
  const chartRows = useMemo(() => resultRows.slice(0, 30).filter((row) => typeof Object.values(row)[1] === 'number'), [resultRows]);

  const log = (line: string) => setLogs((old) => [`[${new Date().toLocaleTimeString()}] ${line}`, ...old].slice(0, 100));
  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#b88c5b', strokeWidth: 1.5 } }, eds));
  }, [setEdges]);

  const importFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const id = `source-${crypto.randomUUID()}`;
      try {
        const source: SourceData = await importFile(file);
        setNodes((old) => [...old, { id, type: 'strata', position: { x: 100 + old.length * 35, y: 360 + old.length * 20 }, data: { kind: 'source', label: source.table, source, status: 'success' } }]);
        setSelectedId(id);
        log(`Imported ${file.name}: ${source.rows.toLocaleString()} rows, ${source.columns.length} columns.`);
        setMessage(`${file.name} imported`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setMessage(reason); log(`Import failed: ${reason}`);
      }
    }
  };

  const runPipeline = async () => {
    if (engineState !== 'ready') { setMessage('The SQL engine is not ready yet.'); return; }
    setBusy(true); setMessage('Executing pipeline…');
    try {
      const order = executionOrder(nodes, edges);
      const outputs = new Map<string, { rows: Record<string, unknown>[]; columns: string[]; durationMs: number }>();
      for (const node of order) {
        const d = node.data as StrataNodeData;
        if (d.kind === 'source') continue;
        const parents = edges.filter((edge) => edge.target === node.id).map((edge) => outputs.get(edge.source));
        if (d.kind === 'query') {
          const sql = d.sql?.trim() || '';
          if (!sql) throw new Error(`SQL node “${d.label}” is empty.`);
          const upstream = edges.filter((edge) => edge.target === node.id).map((edge) => nodes.find((n) => n.id === edge.source)?.data as StrataNodeData).filter(Boolean);
          const sourceTables = upstream.flatMap((parent) => parent.kind === 'source' && parent.source ? [parent.source.table] : []);
          const rewritten = sql.replace(/\$input\b/g, sourceTables[0] ?? 'orders');
          const output = await query(rewritten);
          outputs.set(node.id, output);
          setNodes((old) => old.map((item) => item.id === node.id ? { ...item, data: { ...item.data, status: 'success', rows: output.rows, columns: output.columns, durationMs: output.durationMs, error: undefined } } : item));
          log(`${d.label}: ${output.rows.length} rows in ${output.durationMs} ms.`);
        } else if (parents.length && parents[0]) {
          outputs.set(node.id, parents[0]);
        }
      }
      const last = [...outputs.values()].at(-1);
      if (last) { setResultRows(last.rows); setResultColumns(last.columns); }
      setNodes((old) => old.map((item) => ({ ...item, data: { ...item.data, status: item.data.kind === 'source' ? 'success' : item.data.status === 'success' ? 'success' : 'idle' } })));
      setMessage(`Pipeline completed · ${last?.rows.length ?? 0} rows`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      setMessage(reason); log(`Execution failed: ${reason}`);
      setNodes((old) => old.map((item) => item.id === selectedId ? { ...item, data: { ...item.data, status: 'error', error: reason } } : item));
    } finally { setBusy(false); }
  };

  const addNode = (kind: StrataNodeData['kind']) => {
    const id = `${kind}-${crypto.randomUUID()}`;
    const label = kind === 'query' ? 'New SQL transform' : kind === 'result' ? 'Data preview' : kind === 'chart' ? 'Chart output' : 'Dataset comparison';
    setNodes((old) => [...old, { id, type: 'strata', position: { x: 360 + old.length * 22, y: 90 + old.length * 26 }, data: { kind, label, sql: kind === 'query' ? 'SELECT * FROM $input LIMIT 100;' : undefined } }]);
    setSelectedId(id);
  };

  const updateSelected = (patch: Partial<StrataNodeData>) => setNodes((old) => old.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, ...patch } } : node));
  const exportProject = () => {
    const project: ProjectFile = { version: 1, name: 'Untitled workspace', nodes, edges, savedAt: new Date().toISOString() };
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'strata-project.json');
    setMessage('Project definition exported.');
  };
  const exportCsv = () => {
    if (!resultColumns.length) return;
    const cell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const csv = [resultColumns.map(cell).join(','), ...resultRows.map((row) => resultColumns.map((column) => cell(row[column])).join(','))].join('\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'strata-result.csv');
  };
  const loadProject = async (file: File) => {
    try {
      const project = JSON.parse(await file.text()) as ProjectFile;
      if (project.version !== 1 || !Array.isArray(project.nodes) || !Array.isArray(project.edges)) throw new Error('Unsupported or invalid project file.');
      setNodes(project.nodes); setEdges(project.edges); setSelectedId(project.nodes[0]?.id ?? '');
      setMessage('Project loaded. Re-import source files to restore local tables.');
      log('Project graph restored; source files must be re-imported for execution.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Layers3 size={17}/></div><span>STRATA</span><span className="brand-divider">/</span><span className="workspace-name">Untitled workspace</span></div>
      <div className="top-center"><span className="crumb">WORKSPACE</span><span className="crumb-sep">/</span><span className="crumb active">CANVAS</span></div>
      <div className="top-actions">
        <div className={`engine-pill ${engineState}`}><span className="pulse"/>{engineState === 'ready' ? 'LOCAL ENGINE ONLINE' : engineState === 'error' ? 'ENGINE ERROR' : 'STARTING ENGINE'}</div>
        <button className="icon-button" title="Export project" onClick={exportProject}><Save size={15}/></button>
        <button className="run-button" onClick={runPipeline} disabled={busy || engineState !== 'ready'}><Play size={13} fill="currentColor"/>{busy ? 'RUNNING' : 'RUN PIPELINE'}</button>
      </div>
    </header>
    <div className="main-layout">
      <aside className="left-rail">
        <div className="rail-section"><div className="rail-label">BUILD</div>
          <button className="rail-action" onClick={() => fileRef.current?.click()}><Upload size={15}/><span>Import data</span><kbd>⌘ I</kbd></button>
          <button className="rail-action" onClick={() => addNode('query')}><Code2 size={15}/><span>SQL transform</span><kbd>Q</kbd></button>
          <button className="rail-action" onClick={() => addNode('result')}><Table2 size={15}/><span>Data preview</span></button>
          <button className="rail-action" onClick={() => addNode('chart')}><ChartNoAxesCombined size={15}/><span>Chart output</span></button>
          <button className="rail-action" onClick={() => addNode('diff')}><GitCompareArrows size={15}/><span>Dataset diff</span></button>
        </div>
        <div className="rail-section source-section"><div className="rail-label">SOURCES <span>{sources.length.toString().padStart(2, '0')}</span></div>
          {sources.length === 0 ? <div className="empty-sources">Your imported files<br/>will appear here.</div> : sources.map((source) => <button className="source-item" key={source.id} onClick={() => setSelectedId(source.id)}><Database size={13}/><span>{source.data.label}</span></button>)}
        </div>
        <div className="rail-bottom"><div className="privacy-note"><HardDrive size={14}/><span>LOCAL BY DESIGN</span></div><div className="version">STRATA 1.0.0 · BROWSER RUNTIME</div></div>
      </aside>
      <main className="workspace">
        <div className="canvas-toolbar">
          <div><span className="canvas-heading">Pipeline canvas</span><span className="canvas-subtitle"> / {nodes.length} nodes · {edges.length} connections</span></div>
          <div className="canvas-tools"><button onClick={() => fileRef.current?.click()}><FilePlus2 size={14}/> Add source</button><button onClick={exportProject}><FileJson size={14}/> Export graph</button></div>
        </div>
        <div className="canvas-area" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files); }}>
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => setSelectedId(node.id)} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.25} maxZoom={1.5} deleteKeyCode={['Backspace', 'Delete']}>
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#30313a"/>
            <Controls position="bottom-left" showInteractive={false}/>
            <MiniMap position="bottom-right" nodeColor={(node) => (node.data as StrataNodeData).kind === 'source' ? '#789b88' : (node.data as StrataNodeData).kind === 'query' ? '#bd9566' : '#758ba5'} maskColor="rgba(8,9,12,.65)"/>
          </ReactFlow>
          <div className="canvas-hint"><span className="hint-dot"/> Drag files here · Connect nodes to define execution order</div>
        </div>
        <section className="bottom-panel">
          <div className="panel-header"><div className="panel-tabs"><button className={activeTab === 'results' ? 'active' : ''} onClick={() => setActiveTab('results')}><Table2 size={13}/> RESULTS <span>{resultRows.length}</span></button><button className={activeTab === 'schema' ? 'active' : ''} onClick={() => setActiveTab('schema')}><Braces size={13}/> SCHEMA</button><button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}><Activity size={13}/> EXECUTION LOG</button></div><div className="panel-status"><span className="status-dot"/>{message}</div></div>
          {activeTab === 'results' && <div className="table-wrap">{resultRows.length ? <table><thead><tr>{resultColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{resultRows.slice(0, 100).map((row, index) => <tr key={index}>{resultColumns.map((column) => <td key={column}>{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table> : <div className="panel-empty"><Table2 size={19}/><span>Run a pipeline to inspect query output.</span></div>}</div>}
          {activeTab === 'schema' && <div className="schema-list">{sources.map((source) => <div key={source.id} className="schema-source"><strong>{source.data.label}</strong>{(source.data.source?.columns ?? []).map((column) => <span key={column}>{column}</span>)}</div>)}{!sources.length && <div className="panel-empty">Import a dataset to inspect its schema.</div>}</div>}
          {activeTab === 'logs' && <div className="log-list">{logs.map((line, index) => <div key={index}>{line}</div>)}</div>}
        </section>
      </main>
      <aside className="inspector">
        <div className="inspector-head"><div><div className="rail-label">INSPECTOR</div><div className="inspector-title">{selectedData?.label ?? 'No selection'}</div></div><Settings2 size={16}/></div>
        {selectedData ? <div className="inspector-content">
          <div className="field-label">NODE TYPE</div><div className="type-chip">{selectedData.kind.toUpperCase()}</div>
          <label className="field-label" htmlFor="node-label">NAME</label><input id="node-label" className="text-input" value={selectedData.label} onChange={(event) => updateSelected({ label: event.target.value })}/>
          {selectedData.kind === 'query' && <>
            <div className="editor-heading"><span className="field-label">SQL EDITOR</span><button onClick={() => { try { updateSelected({ sql: format(selectedData.sql ?? '', { language: 'sql' }) }); } catch { /* keep original SQL */ } }}><Zap size={12}/> Format</button></div>
            <textarea className="sql-editor" spellCheck={false} value={selectedData.sql ?? ''} onChange={(event) => updateSelected({ sql: event.target.value })} />
            <div className="sql-help"><span>$input</span> resolves to the first connected source table. You can also reference imported tables by name.</div>
          </>}
          {selectedData.kind === 'source' && <div className="source-details"><div><span>FILE</span><strong>{selectedData.source?.fileName ?? 'No file attached'}</strong></div><div><span>ROWS</span><strong>{selectedData.source?.rows.toLocaleString() ?? '—'}</strong></div><div><span>SIZE</span><strong>{selectedData.source ? (selectedData.source.bytes / 1024 / 1024).toFixed(2) + ' MB' : '—'}</strong></div></div>}
          {selectedData.kind !== 'source' && selectedData.kind !== 'query' && <div className="inspector-note">This node receives the output of its connected upstream node. Result preview is shown in the lower panel.</div>}
          {selectedData.durationMs !== undefined && <div className="metric-card"><Clock3 size={14}/><div><strong>{selectedData.durationMs} ms</strong><span>Last execution</span></div></div>}
          {selectedData.error && <div className="error-card">{selectedData.error}</div>}
          <button className="run-node" onClick={runPipeline} disabled={busy || engineState !== 'ready'}><Play size={13}/> Execute pipeline</button>
        </div> : <div className="inspector-empty">Select a node to inspect its properties.</div>}
        <div className="inspector-footer"><div className="privacy-lock"><HardDrive size={14}/><div><strong>LOCAL EXECUTION</strong><span>Files stay in this browser session.</span></div></div></div>
      </aside>
    </div>
    <input ref={fileRef} type="file" multiple accept=".csv,.tsv,.parquet,.json,.jsonl,.ndjson,.db,.sqlite,.sqlite3" hidden onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }}/>
    {engineState === 'error' && <div className="engine-error"><X size={14}/> DuckDB could not initialize: {engineError}</div>}
    <footer className="statusbar"><span><span className="status-dot"/> {engineState === 'ready' ? 'ENGINE READY' : engineState.toUpperCase()}</span><span>NO BACKEND · NO UPLOADS</span><span>{busy ? 'EXECUTING' : 'IDLE'}</span></footer>
  </div>;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

export default App;
