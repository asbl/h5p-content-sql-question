import { describe, expect, it } from 'vitest';

import { analyzeSQLHints, buildSQLSchema } from '../src/scripts/services/sql-guidance.js';

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
});