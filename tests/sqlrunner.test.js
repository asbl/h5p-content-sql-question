import { beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';

vi.mock('../src/scripts/runtime/services/sqljs-runtime-service.js', () => ({
  warmupSharedSqlJs: vi.fn(),
  resetSharedSqlJsState: vi.fn(),
}));

const {
  resetSharedSqlJsState,
  warmupSharedSqlJs,
} = await import('../src/scripts/runtime/services/sqljs-runtime-service.js');
const { default: SQLRunner } = await import('../src/scripts/runtime/sqlrunner.js');

const sqlJsWasmPath = new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname;

async function createSQLJs() {
  return initSqlJs({
    locateFile: () => sqlJsWasmPath,
  });
}

describe('SQLRunner', () => {
  beforeEach(() => {
    SQLRunner.resetSharedState();
    warmupSharedSqlJs.mockReset();
    resetSharedSqlJsState.mockClear();
    vi.unstubAllGlobals();
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

  it('loads uploaded SQL files into a new SQLite database', async () => {
    const run = vi.fn();
    const Database = vi.fn(() => ({ run }));
    const runner = new SQLRunner({}, {
      getDatabaseOptions: vi.fn().mockResolvedValue({
        sqlFile: 'resolved:1:dump.sql',
      }),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('CREATE TABLE demo(id INTEGER);'),
    }));

    runner.setup = vi.fn();
    runner.SQL = { Database };

    await runner._prepareDatabase();

    expect(fetch).toHaveBeenCalledWith('resolved:1:dump.sql');
    expect(Database).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('CREATE TABLE demo(id INTEGER);');
  });

  it('loads uploaded SQLite database files as binary databases', async () => {
    const SQL = await createSQLJs();
    const sourceDb = new SQL.Database();
    sourceDb.run(`
      CREATE TABLE uploaded(id INTEGER PRIMARY KEY, name TEXT);
      INSERT INTO uploaded(name) VALUES ('binary upload');
    `);
    const exportedDb = sourceDb.export();
    const runner = new SQLRunner({}, {
      getDatabaseOptions: vi.fn().mockResolvedValue({
        dbFile: 'resolved:1:uploaded.sqlite',
      }),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('application/octet-stream'),
      },
      arrayBuffer: vi.fn().mockResolvedValue(exportedDb.buffer),
    }));

    runner.setup = vi.fn();
    runner.SQL = SQL;

    await runner._prepareDatabase();

    expect(fetch).toHaveBeenCalledWith('resolved:1:uploaded.sqlite');
    expect(runner.db.exec('SELECT name FROM uploaded')).toEqual([
      {
        columns: ['name'],
        values: [['binary upload']],
      },
    ]);
  });

  it('rejects uploaded database URLs that return HTML instead of SQLite data', async () => {
    const runner = new SQLRunner({}, {
      getDatabaseOptions: vi.fn().mockResolvedValue({
        dbFile: 'resolved:1:not-a-db.html',
      }),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('text/html; charset=utf-8'),
      },
    }));

    runner.setup = vi.fn();
    runner.SQL = { Database: vi.fn() };

    await expect(runner._prepareDatabase()).rejects.toThrow(
      'Database URL returned HTML instead of SQLite binary'
    );
  });

  it('imports cleaned MySQL dumps into a real SQLite database', async () => {
    const SQL = await createSQLJs();
    const runner = new SQLRunner({}, {
      getDatabaseOptions: vi.fn().mockResolvedValue({
        sqlFile: 'resolved:1:mysql.sql',
        cleanMySQLDump: true,
      }),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`
        /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
        SET NAMES utf8mb4;
        CREATE TABLE \`users\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`name\` varchar(255) COLLATE utf8mb4_unicode_ci COMMENT 'Display name',
          KEY \`name_idx\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        INSERT INTO \`users\` VALUES (1, 'Ada');
      `),
    }));

    runner.setup = vi.fn();
    runner.SQL = SQL;

    await runner._prepareDatabase();

    expect(runner.db.exec('SELECT name FROM users')).toEqual([
      {
        columns: ['name'],
        values: [['Ada']],
      },
    ]);
  });

  it('cleans common MySQL dump syntax before importing SQL files', async () => {
    const run = vi.fn();
    const Database = vi.fn(() => ({ run }));
    const runner = new SQLRunner({}, {
      getDatabaseOptions: vi.fn().mockResolvedValue({
        sqlFile: 'resolved:1:mysql.sql',
        cleanMySQLDump: true,
      }),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(`
        /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
        SET NAMES utf8mb4;
        CREATE DATABASE \`ignored\`;
        USE \`ignored\`;
        CREATE TABLE \`users\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`name\` varchar(255) COLLATE utf8mb4_unicode_ci COMMENT 'Display name',
          KEY \`name_idx\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `),
    }));

    runner.setup = vi.fn();
    runner.SQL = { Database };

    await runner._prepareDatabase();

    const importedSQL = run.mock.calls[0][0];
    expect(importedSQL).toContain('CREATE TABLE "users"');
    expect(importedSQL).toContain('"id" INTEGER NOT NULL');
    expect(importedSQL).toContain('"name" TEXT');
    expect(importedSQL).not.toMatch(/\b(?:SET NAMES|CREATE DATABASE|USE|ENGINE=|AUTO_INCREMENT)\b|KEY `name_idx`/i);
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
