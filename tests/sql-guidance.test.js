import { describe, expect, it } from 'vitest';

import { analyzeSQLHints, buildSQLSchema, maskSQLNonCode } from '../src/scripts/services/sql-guidance.js';

describe('SQL guidance', () => {
  it('builds table and column schema information from table results', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'population'], values: [['A', 1]] }]],
      ['city', [{ columns: ['id', 'name'], values: [[1, 'Berlin']] }]],
    ]));

    expect(schema.tableNames).toEqual(['world', 'city']);
    expect(schema.tables.world.columns).toEqual(['name', 'population']);
    expect(schema.allColumns).toContain('population');
  });

  it('finds unknown table and column identifiers', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'population'], values: [['A', 1]] }]],
    ]));

    const diagnostics = analyzeSQLHints('SELECT poplation FROM worlld', schema);

    expect(diagnostics).toEqual([
      expect.objectContaining({
        type: 'unknown-column',
        identifier: 'poplation',
        suggestion: 'population',
      }),
      expect.objectContaining({
        type: 'unknown-table',
        identifier: 'worlld',
        suggestion: 'world',
      }),
    ]);
  });
  describe('false positives', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'continent', 'area', 'population'], values: [] }]],
    ]));
    const identifiers = (code) => analyzeSQLHints(code, schema).map((diagnostic) => diagnostic.identifier);

    it('ignores the content of string literals', () => {
      expect(identifiers('SELECT name FROM world WHERE continent = \'Europe\'')).toEqual([]);
      expect(identifiers('SELECT name FROM world WHERE name LIKE \'Ger%\' AND continent = \'Western Europe\'')).toEqual([]);
      expect(identifiers('SELECT name FROM world WHERE name = \'O\'\'Brien Land\'')).toEqual([]);
    });

    it('ignores comments', () => {
      expect(identifiers('SELECT name FROM world -- Kommentar zum Land')).toEqual([]);
      expect(identifiers('SELECT name /* nur Namen */ FROM world')).toEqual([]);
    });

    it('accepts column aliases in HAVING and ORDER BY', () => {
      expect(identifiers('SELECT name, population / area AS dichte FROM world ORDER BY dichte')).toEqual([]);
      expect(identifiers('SELECT continent, COUNT(*) AS anzahl FROM world GROUP BY continent HAVING anzahl > 3')).toEqual([]);
    });

    it('still reports real typos next to literals and aliases', () => {
      expect(identifiers('SELECT name FROM world WHERE continnent = \'Europe\'')).toEqual(['continnent']);
      expect(identifiers('SELECT COUNT(*) AS anzahl FROM world HAVING anzal > 3')).toEqual(['anzal']);
    });

    it('keeps diagnostic ranges aligned with the original code', () => {
      const code = 'SELECT \'a b\' AS x, poplation FROM world';
      const [diagnostic] = analyzeSQLHints(code, schema);

      expect(code.slice(diagnostic.from, diagnostic.to)).toBe('poplation');
    });

    it('masks literals and comments without changing the length', () => {
      const code = 'a \'x y\' -- c\nb';
      expect(maskSQLNonCode(code)).toHaveLength(code.length);
      expect(maskSQLNonCode(code)).not.toMatch(/[xyc]/);
    });
  });
});