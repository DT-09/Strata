import { describe, expect, it } from 'vitest';
import { executionOrder } from './graph';
import type { StrataNode } from './types';

const node = (id: string) => ({ id, type: 'strata', position: { x: 0, y: 0 }, data: { kind: 'query', label: id } }) as StrataNode;

describe('executionOrder', () => {
  it('orders dependencies before consumers', () => {
    const result = executionOrder([node('c'), node('a'), node('b')], [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
    ]);
    expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
  it('rejects cycles', () => {
    expect(() => executionOrder([node('a'), node('b')], [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'a' },
    ])).toThrow(/cycle/i);
  });
  it('rejects dangling edges', () => {
    expect(() => executionOrder([node('a')], [
      { id: '1', source: 'a', target: 'missing' },
    ])).toThrow(/missing node/i);
  });
});