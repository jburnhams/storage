import { describe, it, expect } from 'vitest';
import { buildSqlSearch } from '../../src/utils/db_search';

describe('buildSqlSearch', () => {
  const table = 'test_table';
  const allowed = ['id', 'title', 'data', 'views'];

  it('generates basic select with defaults', () => {
    const { sql, params } = buildSqlSearch(table, {}, allowed);
    expect(sql).toBe('SELECT * FROM test_table  ORDER BY created_at DESC LIMIT ? OFFSET ?');
    expect(params).toEqual([50, 0]);
  });

  it('handles limit and offset', () => {
    const { sql, params } = buildSqlSearch(table, { limit: '10', offset: '5' }, allowed);
    expect(sql).toContain('LIMIT ? OFFSET ?');
    expect(params).toEqual([10, 5]);
  });

  it('handles basic filtering', () => {
    const { sql, params } = buildSqlSearch(table, { title_eq: 'hello', views_gt: '100' }, allowed);
    expect(sql).toContain('WHERE title = ? AND views > ?');
    // Order of params depends on object iteration, which is generally insertion order in modern JS
    // We can assume title comes first based on key order in object passed
    expect(params).toEqual(['hello', '100', 50, 0]);
  });

  it('handles contains operator', () => {
    const { sql, params } = buildSqlSearch(table, { title_contains: 'world' }, allowed);
    expect(sql).toContain('WHERE title LIKE ?');
    expect(params).toEqual(['%world%', 50, 0]);
  });

  it('handles sorting', () => {
    const { sql } = buildSqlSearch(table, { sort_by: 'views', sort_order: 'asc' }, allowed);
    expect(sql).toContain('ORDER BY views ASC');
  });

  it('handles random sorting', () => {
    const { sql } = buildSqlSearch(table, { sort_by: 'random' }, allowed);
    expect(sql).toContain('ORDER BY RANDOM()');
  });

  it('handles json extraction', () => {
    const { sql, params } = buildSqlSearch(table, { 'data.nested_eq': 'val' }, allowed);
    expect(sql).toContain(`WHERE json_extract(data, '$.nested') = ?`);
    expect(params).toEqual(['val', 50, 0]);
  });

  it('ignores invalid columns', () => {
    const { sql, params } = buildSqlSearch(table, { 'hax_eq': '1' }, allowed);
    expect(sql).not.toContain('hax');
    expect(params).toEqual([50, 0]);
  });

  it('handles sort by json field', () => {
    const { sql } = buildSqlSearch(table, { sort_by: 'data.score' }, allowed);
    expect(sql).toContain(`ORDER BY json_extract(data, '$.score') DESC`);
  });

  it('prevents sql injection in json filter path', () => {
    const maliciousKey = "data.path') OR 1=1 --_eq";
    const { sql, params } = buildSqlSearch(table, { [maliciousKey]: 'val' }, allowed);
    // Should ignore the malicious key
    expect(sql).not.toContain("OR 1=1");
    expect(sql).not.toContain("json_extract"); // No other filters
    expect(params).toEqual([50, 0]);
  });

  it('prevents sql injection in json sort path', () => {
    const maliciousSort = "data.path') OR 1=1 --";
    const { sql } = buildSqlSearch(table, { sort_by: maliciousSort }, allowed);
    // Should fallback to default sort
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sql).not.toContain("json_extract");
  });
});
