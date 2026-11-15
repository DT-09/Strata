import type { StrataEdge, StrataNode } from './types';

export function executionOrder(nodes: StrataNode[], edges: StrataEdge[]): StrataNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('Pipeline contains an edge to a missing node.');
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered: StrataNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(nodes.find((node) => node.id === id)!);
    for (const next of outgoing.get(id)!) {
      const degree = indegree.get(next)! - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  if (ordered.length !== nodes.length) throw new Error('Pipeline contains a cycle. Disconnect an edge to restore a directed acyclic graph.');
  return ordered;
}

export function ancestorsOf(nodeId: string, edges: StrataEdge[]): Set<string> {
  const found = new Set<string>();
  const visit = (id: string) => {
    for (const edge of edges) if (edge.target === id && !found.has(edge.source)) {
      found.add(edge.source);
      visit(edge.source);
    }
  };
  visit(nodeId);
  return found;
}
