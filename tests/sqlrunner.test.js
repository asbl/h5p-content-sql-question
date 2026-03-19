import { describe, expect, it, vi } from 'vitest';

vi.mock('sql.js', () => ({
  default: vi.fn(),
}));

const { default: SQLRunner } = await import('../src/scripts/runtime/sqlrunner.js');

describe('SQLRunner', () => {
  it('formats truncated row messages from SQLQuestion localization fallbacks', () => {
    const runner = new SQLRunner({}, { maxRows: 1, l10n: {} });

    const table = runner._sqlToTable([
      {
        columns: ['id'],
        values: [[1], [2]],
      },
    ]);

    expect(table).toContain('...(1 of 2 rows shown)');
  });

  it('quotes identifiers for follow-up table queries', async () => {
    const runner = new SQLRunner({}, {});
    const exec = vi.fn((query) => {
      if (query.includes('sqlite_schema')) {
        return [{ values: [['demo "table"']] }];
      }

      return [{ columns: ['id'], values: [[1]] }];
    });

    runner.setup = vi.fn();
    runner._prepareDatabase = vi.fn();
    runner.db = { exec };

    const tables = await runner.getAllTables();

    expect(exec).toHaveBeenNthCalledWith(2, 'SELECT * FROM "demo ""table"""');
    expect(tables).toEqual([
      ['demo "table"', { columns: ['id'], values: [[1]] }],
    ]);
  });

  it('escapes double quotes inside identifiers', () => {
    const runner = new SQLRunner({}, {});

    expect(runner.quoteIdentifier('demo "table"')).toBe('"demo ""table"""');
  });
});