import { describe, expect, it } from 'vitest';

import {
  checkQueryConstraints,
  hasQueryConstraints,
  hasSubquery,
  parseKeywordList,
  sanitizeSql,
  usesSelectStar,
} from '../src/scripts/services/sql-query-constraints.js';

const translate = (key, replacements = {}) => `${key}${replacements.value ? `:${replacements.value}` : ''}`;

describe('sql query constraints', () => {
  it('parses comma, semicolon and line separated keyword lists', () => {
    expect(parseKeywordList('join, group  by;\nhaving ,')).toEqual(['JOIN', 'GROUP BY', 'HAVING']);
    expect(parseKeywordList('')).toEqual([]);
    expect(parseKeywordList(undefined)).toEqual([]);
  });

  it('removes comments, strings and quoted identifiers before checking', () => {
    const sanitized = sanitizeSql(`
      SELECT "join", 'JOIN' -- JOIN in a comment
      FROM t /* LEFT JOIN */ WHERE a = 'it''s'`);

    expect(sanitized).not.toContain('JOIN');
    expect(sanitized).toContain('SELECT');
    expect(sanitized).toContain('WHERE A =');
  });

  it('detects required keywords including multi-word keywords', () => {
    const rules = { requiredKeywords: 'JOIN, GROUP BY' };

    expect(checkQueryConstraints(
      'SELECT a, COUNT(*) FROM x JOIN y ON x.id=y.id GROUP\n  BY a',
      rules,
      translate,
    ).passed).toBe(true);

    const result = checkQueryConstraints('SELECT a FROM x JOIN y ON x.id=y.id', rules, translate);
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(['sqlConstraintRequired:GROUP BY']);
    expect(result.checks).toHaveLength(2);
  });

  it('does not treat a keyword inside a longer word or a string as a match', () => {
    const result = checkQueryConstraints(
      "SELECT 'JOIN' AS x, joined FROM t",
      { requiredKeywords: 'JOIN' },
      translate,
    );

    expect(result.passed).toBe(false);
  });

  it('detects forbidden keywords', () => {
    const rules = { forbiddenKeywords: 'LIMIT' };

    expect(checkQueryConstraints('SELECT * FROM t LIMIT 3', rules, translate).violations)
      .toEqual(['sqlConstraintForbidden:LIMIT']);
    expect(checkQueryConstraints('SELECT * FROM t', rules, translate).passed).toBe(true);
  });

  it('detects subqueries', () => {
    expect(hasSubquery(sanitizeSql('SELECT * FROM t WHERE a IN (SELECT a FROM u)'))).toBe(true);
    expect(hasSubquery(sanitizeSql('SELECT * FROM t WHERE a IN (1, 2)'))).toBe(false);

    expect(checkQueryConstraints(
      'SELECT * FROM (SELECT 1)',
      { forbidSubqueries: true },
      translate,
    ).violations).toEqual(['sqlConstraintNoSubquery']);
  });

  it('detects SELECT * but allows COUNT(*) and multiplication', () => {
    expect(usesSelectStar(sanitizeSql('SELECT * FROM t'))).toBe(true);
    expect(usesSelectStar(sanitizeSql('SELECT DISTINCT * FROM t'))).toBe(true);
    expect(usesSelectStar(sanitizeSql('SELECT t.* FROM t'))).toBe(true);
    expect(usesSelectStar(sanitizeSql('SELECT a, * FROM t'))).toBe(true);
    expect(usesSelectStar(sanitizeSql('SELECT COUNT(*) FROM t'))).toBe(false);
    expect(usesSelectStar(sanitizeSql('SELECT a * 2, b FROM t'))).toBe(false);
    expect(usesSelectStar(sanitizeSql('SELECT a FROM t WHERE x = 1 * 2'))).toBe(false);
  });

  it('reports whether any rule is configured', () => {
    expect(hasQueryConstraints(undefined)).toBe(false);
    expect(hasQueryConstraints({ requiredKeywords: '  ' })).toBe(false);
    expect(hasQueryConstraints({ forbidSelectStar: true })).toBe(true);
    expect(hasQueryConstraints({ forbiddenKeywords: 'LIMIT' })).toBe(true);
  });

  it('lists only configured rules', () => {
    expect(checkQueryConstraints('SELECT 1', {}, translate)).toEqual({
      passed: true,
      violations: [],
      checks: [],
    });
  });
});
