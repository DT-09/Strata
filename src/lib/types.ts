import type { Edge, Node } from '@xyflow/react';

export type SourceData = { table: string; fileName: string; bytes: number; columns: string[]; rows: number };
export type StrataNodeData = {
  label: string;
  source?: SourceData;
  sql?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
  rows?: Record<string, unknown>[];
  columns?: string[];
  durationMs?: number;
  error?: string;
  kind: 'source' | 'query' | 'result' | 'chart' | 'diff';
};
export type StrataNode = Node<StrataNodeData>;
export type StrataEdge = Edge;
export type ProjectFile = { version: 1; name: string; nodes: StrataNode[]; edges: StrataEdge[]; savedAt: string };
