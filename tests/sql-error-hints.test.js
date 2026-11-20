import { describe, expect, it } from 'vitest';

import { explainSQLError } from '../src/scripts/services/sql-error-hints';
import { buildSQLSchema } from '../src/scripts/services/sql-guidance';

const translate = (key, replacements = {}) => `${key}:${JSON.stringify(replacements)}`;
const schema = buildSQLSchema(new Map([
  ['world', [{ columns: ['name', 'population', 'continent'], values: [] }]],
]));

describe('explainSQLError', () => {
  it('suggests a keyword for a mistyped keyword', () => {
    expect(explainSQLError('near "FORM": syntax error', { schema, translate }))
      .toBe('sqlErrorSyntaxKeyword:{"token":"FORM","suggestion":"FROM"}\nnear "FORM": syntax error');
  });

  it('gives a generic tip for other syntax errors', () => {
    expect(explainSQLError('near ",": syntax error', { schema, translate }))
      .toContain('sqlErrorSyntax:{"token":","}');
  });

  it('suggests the closest column and table', () => {
    expect(explainSQLError('no such column: populaton', { schema, translate }))
      .toContain('sqlErrorNoColumnSuggestion:{"name":"populaton","suggestion":"population"}');
    expect(explainSQLError('no such table: wrld', { schema, translate }))
      .toContain('sqlErrorNoTableSuggestion:{"name":"wrld","suggestion":"world"}');
    expect(explainSQLError('no such column: zzzzzzzz', { schema, translate }))
      .toContain('sqlErrorNoColumn:{"name":"zzzzzzzz"}');
  });

  it('explains incomplete input, ambiguity, aggregates, tokens and functions', () => {
    expect(explainSQLError('incomplete input', { schema, translate })).toContain('sqlErrorIncomplete');
    expect(explainSQLError('ambiguous column name: id', { schema, translate })).toContain('sqlErrorAmbiguous');
    expect(explainSQLError('misuse of aggregate: COUNT()', { schema, translate })).toContain('sqlErrorAggregate');
    expect(explainSQLError('unrecognized token: "\'Europe"', { schema, translate })).toContain('sqlErrorToken');
    expect(explainSQLError('no such function: FOO', { schema, translate })).toContain('sqlErrorFunction');
  });

  it('returns unknown messages unchanged', () => {
    expect(explainSQLError('disk I/O error', { schema, translate })).toBe('disk I/O error');
    expect(explainSQLError('no such table: x')).toBe('no such table: x');
  });
});
