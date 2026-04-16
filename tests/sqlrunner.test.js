import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/scripts/runtime/services/sqljs-runtime-service.js', () => ({
  warmupSharedSqlJs: vi.fn(),
  resetSharedSqlJsState: vi.fn(),
}));

const {
  resetSharedSqlJsState,
  warmupSharedSqlJs,
} = await import('../src/scripts/runtime/services/sqljs-runtime-service.js');
const { default: SQLRunner } = await import('../src/scripts/runtime/sqlrunner.js');

describe('SQLRunner', () => {
  beforeEach(() => {
    SQLRunner.resetSharedState();
    warmupSharedSqlJs.mockReset();
    resetSharedSqlJsState.mockClear();
  });

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

  it('resolves database options lazily before preparing the database', async () => {
    const run = vi.fn();
    const Database = vi.fn(() => ({ run }));
    const runner = new SQLRunner({}, {
      getDatabaseOptions: vi.fn().mockResolvedValue({
        sqlPrepare: 'CREATE TABLE world(id INT);',
      }),
    });

    runner.setup = vi.fn();
    runner.SQL = { Database };

    await runner._prepareDatabase();

    expect(runner.options.getDatabaseOptions).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('CREATE TABLE world(id INT);');
  });

  it('reuses the shared sql.js runtime across runner instances', async () => {
    const sqlModule = { Database: vi.fn() };
    warmupSharedSqlJs.mockResolvedValue(sqlModule);

    const firstRunner = new SQLRunner({}, {});
    const secondRunner = new SQLRunner({}, {});

    await firstRunner.setup();
    await secondRunner.setup();

    expect(warmupSharedSqlJs).toHaveBeenCalledTimes(2);
    expect(firstRunner.SQL).toBe(sqlModule);
    expect(secondRunner.SQL).toBe(sqlModule);
  });

  it('passes the configured sql.js URL into runtime warmup', async () => {
    const sqlModule = { Database: vi.fn() };
    warmupSharedSqlJs.mockResolvedValue(sqlModule);

    const runner = new SQLRunner({}, {
      sqlJsUrl: 'https://cdn.example.com/sql.js/dist/',
    });

    await runner.setup();

    expect(warmupSharedSqlJs).toHaveBeenCalledWith('https://cdn.example.com/sql.js/dist/');
  });
});