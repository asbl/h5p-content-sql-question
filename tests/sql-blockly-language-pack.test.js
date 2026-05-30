import { describe, expect, it } from 'vitest';
import {
  validateBlocklyLanguagePack,
} from '../../H5P.LibCodeTools-6.0/src/scripts/editor/blockly/blockly-language-pack-contract.js';
import {
  SQL_BLOCKLY_LANGUAGE_PACK,
  generateSqlFromBlocklyWorkspace,
} from '../src/scripts/blockly/sql-blockly-language-pack.js';

describe('SQL Blockly language pack', () => {
  it('fulfills the shared language pack contract', () => {
    expect(validateBlocklyLanguagePack(SQL_BLOCKLY_LANGUAGE_PACK)).toEqual([]);
    expect(SQL_BLOCKLY_LANGUAGE_PACK.supported).toBe(true);
    expect(typeof SQL_BLOCKLY_LANGUAGE_PACK.registerBlocks).toBe('function');
  });

  // ── Block helpers ──────────────────────────────────────────────────────

  function valueBlock(type, fields = {}, inputs = {}) {
    return {
      type,
      outputConnection: {},
      getFieldValue: (name) => fields[name] ?? null,
      getInput: (name) => inputs[name]
        ? { connection: { targetBlock: () => inputs[name] } }
        : { connection: { targetBlock: () => null } },
      getNextBlock: () => null,
    };
  }

  function clauseBlock(type, fields = {}, inputs = {}, next = null) {
    return {
      type,
      outputConnection: null,
      getFieldValue: (name) => fields[name] ?? null,
      getInput: (name) => inputs[name]
        ? { connection: { targetBlock: () => inputs[name] } }
        : { connection: { targetBlock: () => null } },
      getNextBlock: () => next,
    };
  }

  function chain(...blocks) {
    for (let i = 0; i < blocks.length - 1; i++) {
      const current = blocks[i];
      const next = blocks[i + 1];
      current.getNextBlock = () => next;
    }
    return blocks[0];
  }

  // ── Clause block generation ────────────────────────────────────────────

  it('generates SELECT * FROM table;', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM world;');
  });

  it('generates SELECT DISTINCT with column list', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', { DISTINCT: 'DISTINCT' }, {
            COLUMNS: valueBlock('sql_column_list', {}, {
              LEFT: valueBlock('sql_column', { NAME: 'name' }),
              RIGHT: valueBlock('sql_column', { NAME: 'continent' }),
            }),
          }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
        ),
      ],
    });
    expect(sql).toBe('SELECT DISTINCT name, continent\nFROM world;');
  });

  it('generates WHERE with comparison', () => {
    const cond = valueBlock('sql_compare', { OP: '>' }, {
      LEFT: valueBlock('sql_column', { NAME: 'population' }),
      RIGHT: valueBlock('sql_number', { NUM: 100000000 }),
    });
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
          clauseBlock('sql_where', {}, { COND: cond }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM world\nWHERE population > 100000000;');
  });

  it('generates JOIN … ON', () => {
    const on = valueBlock('sql_compare', { OP: '=' }, {
      LEFT: valueBlock('sql_column', { NAME: 'team.id' }),
      RIGHT: valueBlock('sql_column', { NAME: 'goal.teamid' }),
    });
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'team' }) }),
          clauseBlock('sql_join', { JOIN_TYPE: 'INNER' }, {
            TABLE: valueBlock('sql_column', { NAME: 'goal' }),
            ON: on,
          }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM team\nJOIN goal ON team.id = goal.teamid;');
  });

  it('generates LEFT JOIN', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'a' }) }),
          clauseBlock('sql_join', { JOIN_TYPE: 'LEFT' }, {
            TABLE: valueBlock('sql_column', { NAME: 'b' }),
            ON: null,
          }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM a\nLEFT JOIN b;');
  });

  it('generates GROUP BY … HAVING', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, {
            COLUMNS: valueBlock('sql_column_list', {}, {
              LEFT: valueBlock('sql_column', { NAME: 'continent' }),
              RIGHT: valueBlock('sql_count_star'),
            }),
          }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
          clauseBlock('sql_group_by', {}, { EXPR: valueBlock('sql_column', { NAME: 'continent' }) }),
          clauseBlock('sql_having', {}, {
            COND: valueBlock('sql_compare', { OP: '>=' }, {
              LEFT: valueBlock('sql_count_star'),
              RIGHT: valueBlock('sql_number', { NUM: 5 }),
            }),
          }),
        ),
      ],
    });
    expect(sql).toBe('SELECT continent, COUNT(*)\nFROM world\nGROUP BY continent\nHAVING COUNT(*) >= 5;');
  });

  it('generates ORDER BY with direction', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
          clauseBlock('sql_order_by', { DIR: 'DESC' }, { EXPR: valueBlock('sql_column', { NAME: 'population' }) }),
          clauseBlock('sql_limit', { NUM: 5 }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM world\nORDER BY population DESC\nLIMIT 5;');
  });

  // ── Value block generation ─────────────────────────────────────────────

  it('generates aggregate functions', () => {
    const aggs = [
      ['sql_count_star', {}, {}, 'COUNT(*)'],
      ['sql_count', {}, { EXPR: valueBlock('sql_column', { NAME: 'id' }) }, 'COUNT(id)'],
      ['sql_min', {}, { EXPR: valueBlock('sql_column', { NAME: 'price' }) }, 'MIN(price)'],
      ['sql_max', {}, { EXPR: valueBlock('sql_column', { NAME: 'price' }) }, 'MAX(price)'],
      ['sql_avg', {}, { EXPR: valueBlock('sql_column', { NAME: 'price' }) }, 'AVG(price)'],
      ['sql_sum', {}, { EXPR: valueBlock('sql_column', { NAME: 'price' }) }, 'SUM(price)'],
    ];
    for (const [type, fields, inputs, expected] of aggs) {
      const sql = generateSqlFromBlocklyWorkspace({
        getTopBlocks: () => [
          chain(
            clauseBlock('sql_select', {}, { COLUMNS: valueBlock(type, fields, inputs) }),
            clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 't' }) }),
          ),
        ],
      });
      expect(sql).toContain(expected);
    }
  });

  it('generates AS alias', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, {
            COLUMNS: valueBlock('sql_as', { ALIAS: 'anzahl' }, { EXPR: valueBlock('sql_count_star') }),
          }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
        ),
      ],
    });
    expect(sql).toBe('SELECT COUNT(*) AS anzahl\nFROM world;');
  });

  it('generates AND / OR / NOT conditions', () => {
    const cond = valueBlock('sql_and', {}, {
      LEFT: valueBlock('sql_compare', { OP: '>' }, {
        LEFT: valueBlock('sql_column', { NAME: 'population' }),
        RIGHT: valueBlock('sql_number', { NUM: 0 }),
      }),
      RIGHT: valueBlock('sql_not', {}, {
        COND: valueBlock('sql_compare', { OP: '=' }, {
          LEFT: valueBlock('sql_column', { NAME: 'continent' }),
          RIGHT: valueBlock('sql_string', { TEXT: 'Antarctica' }),
        }),
      }),
    });
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
          clauseBlock('sql_where', {}, { COND: cond }),
        ),
      ],
    });
    expect(sql).toBe("SELECT *\nFROM world\nWHERE (population > 0 AND NOT continent = 'Antarctica');");
  });

  it('generates BETWEEN', () => {
    const cond = valueBlock('sql_between', {}, {
      EXPR: valueBlock('sql_column', { NAME: 'population' }),
      LOW: valueBlock('sql_number', { NUM: 1000000 }),
      HIGH: valueBlock('sql_number', { NUM: 10000000 }),
    });
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
          clauseBlock('sql_where', {}, { COND: cond }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM world\nWHERE population BETWEEN 1000000 AND 10000000;');
  });

  it('generates IS NULL / IS NOT NULL', () => {
    const cond = valueBlock('sql_is_null', { NOT: 'NOT' }, {
      EXPR: valueBlock('sql_column', { NAME: 'capital' }),
    });
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
          clauseBlock('sql_where', {}, { COND: cond }),
        ),
      ],
    });
    expect(sql).toBe('SELECT *\nFROM world\nWHERE capital IS NOT NULL;');
  });

  it('generates arithmetic math expressions', () => {
    const expr = valueBlock('sql_math', { OP: '*' }, {
      LEFT: valueBlock('sql_column', { NAME: 'price' }),
      RIGHT: valueBlock('sql_number', { NUM: 1.19 }),
    });
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        chain(
          clauseBlock('sql_select', {}, { COLUMNS: expr }),
          clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'products' }) }),
        ),
      ],
    });
    expect(sql).toBe('SELECT (price * 1.19)\nFROM products;');
  });

  it('skips top blocks that are not SELECT', () => {
    const sql = generateSqlFromBlocklyWorkspace({
      getTopBlocks: () => [
        clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'world' }) }),
      ],
    });
    expect(sql).toBe('');
  });

  it('generates multiple independent queries', () => {
    const q1 = chain(
      clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
      clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'a' }) }),
    );
    const q2 = chain(
      clauseBlock('sql_select', {}, { COLUMNS: valueBlock('sql_star') }),
      clauseBlock('sql_from', {}, { TABLE: valueBlock('sql_column', { NAME: 'b' }) }),
    );
    const sql = generateSqlFromBlocklyWorkspace({ getTopBlocks: () => [q1, q2] });
    expect(sql).toBe('SELECT *\nFROM a;\n\nSELECT *\nFROM b;');
  });
});
