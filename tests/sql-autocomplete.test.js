import { describe, expect, it } from 'vitest';

import {
  createSQLCompletionSource,
  detectSQLClauseContext,
  extractSQLAliases,
} from '../src/scripts/services/sql-autocomplete.js';
import { buildSQLSchema } from '../src/scripts/services/sql-guidance.js';

function createCompletionContext(code, pos = code.length, explicit = true) {
  return {
    pos,
    explicit,
    state: {
      doc: {
        toString: () => code,
      },
    },
    matchBefore(pattern) {
      const before = code.slice(0, pos);
      const match = before.match(new RegExp(`${pattern.source}$`, pattern.flags));

      if (!match) {
        return null;
      }

      const text = match[0];
      return {
        from: pos - text.length,
        to: pos,
        text,
      };
    },
  };
}

describe('SQL autocomplete', () => {
  it('keeps SQL keywords uppercase for mixed-case prefixes', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'continent'], values: [] }]],
    ]));
    const source = createSQLCompletionSource(schema);
    const result = source(createCompletionContext('SeLe'));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'SELECT',
      apply: 'SELECT',
      type: 'keyword',
    }));
  });

  it('extracts aliases from joined tables', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name'], values: [] }]],
      ['city', [{ columns: ['id'], values: [] }]],
    ]));

    const aliases = extractSQLAliases('SELECT * FROM world w JOIN city c ON w.id = c.id', schema);

    expect(Array.from(aliases.keys())).toEqual(['w', 'c']);
    expect(aliases.get('w')).toEqual(expect.objectContaining({ tableName: 'world' }));
  });

  it('detects table and column oriented clause contexts', () => {
    expect(detectSQLClauseContext('SELECT name FROM wor', 'SELECT name FROM wor'.length)).toBe('table');
    expect(detectSQLClauseContext('SELECT na', 'SELECT na'.length)).toBe('column');
  });

  it('suggests alias-qualified columns with highest priority', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'population'], values: [] }]],
    ]));
    const source = createSQLCompletionSource(schema);
    const code = 'SELECT w. FROM world w';
    const result = source(createCompletionContext(code, code.indexOf(' FROM')));

    expect(result.options.map((option) => option.label)).toEqual(['name', 'population']);
    expect(result.options[0].detail).toContain('w -> world');
  });

  it('ranks tables above columns after FROM', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'population'], values: [] }]],
      ['city', [{ columns: ['name'], values: [] }]],
    ]));
    const source = createSQLCompletionSource(schema);
    const result = source(createCompletionContext('SELECT * FROM w'));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'world',
      detail: 'table',
    }));
  });

  it('ranks WHERE above table names after a completed FROM table', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'continent'], values: [] }]],
      ['work', [{ columns: ['task'], values: [] }]],
    ]));
    const source = createSQLCompletionSource(schema);
    const code = 'SELECT * FROM world wh';
    const result = source(createCompletionContext(code));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'WHERE',
      type: 'keyword',
    }));
  });

  it('ranks columns above tables inside SELECT clauses', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'population'], values: [] }]],
      ['city', [{ columns: ['id'], values: [] }]],
    ]));
    const source = createSQLCompletionSource(schema);
    const code = 'SELECT na FROM world';
    const result = source(createCompletionContext(code, 'SELECT na'.length));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'name',
      type: 'property',
    }));
  });

  it('ranks matching columns above SQL keywords inside WHERE clauses', () => {
    const schema = buildSQLSchema(new Map([
      ['world', [{ columns: ['name', 'continent', 'population'], values: [] }]],
    ]));
    const source = createSQLCompletionSource(schema);
    const result = source(createCompletionContext('SELECT * FROM world WHERE contin'));

    expect(result.options[0]).toEqual(expect.objectContaining({
      label: 'continent',
      type: 'property',
    }));
  });
});