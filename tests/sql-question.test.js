import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/scripts/container/container-sql', () => ({
  default: class SQLCodeContainerMock {},
}));

vi.mock('../src/scripts/runtime/runtime-test-sql', () => ({
  default: class SQLTestRuntimeMock {},
}));

vi.mock('../src/scripts/runtime/runtime-manual-sql', () => ({
  default: class SQLManualRuntimeMock {},
}));

const { default: SQLQuestion } = await import('../src/scripts/sql-question.js');

describe('SQLQuestion', () => {
  beforeEach(() => {
    H5P.getPath.mockClear();
  });

  it('merges inherited container options with SQL database accessors', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        dbFile: { path: 'db.sqlite' },
      },
    }, 7);
    question.getDatabaseOptions = vi.fn().mockResolvedValue({ dbFile: 'db.sqlite' });

    const options = question.getCodeContainerOptions();

    expect(options.fromParentContainer).toBe(true);
    await options.getDatabaseOptions();
    expect(question.getDatabaseOptions).toHaveBeenCalledTimes(1);
  });

  it('merges inherited runtime options with SQL database options', () => {
    const question = new SQLQuestion({
      l10n: { score: 'Score' },
    }, 3);

    question.databaseOptions = {
      dbFile: 'resolved.db',
      sqlPrepare: 'CREATE TABLE demo(id INT);',
      solutionPrepare: 'SELECT * FROM demo;',
    };

    expect(question.getRuntimeOptions()).toEqual({
      l10n: { score: 'Score' },
      fromParentRuntime: true,
      dbFile: 'resolved.db',
      sqlPrepare: 'CREATE TABLE demo(id INT);',
      solutionPrepare: 'SELECT * FROM demo;',
    });
  });

  it('initializes database options once and caches the prepared solution', async () => {
    const question = new SQLQuestion({
      gradingSettings: {
        gradingMethod: 'bySolution',
        solution: 'SELECT 1;',
      },
      databaseSettings: {
        selectDatabase: 'world',
      },
    }, 2);

    question._getSQLPrepare = vi.fn().mockResolvedValue('CREATE TABLE world(id INT);');
    question.getDecodedCode = vi.fn((code) => `decoded:${code}`);

    const first = await question.getDatabaseOptions();
    const second = await question.getDatabaseOptions();

    expect(question._getSQLPrepare).toHaveBeenCalledTimes(1);
    expect(question.getDecodedCode).toHaveBeenCalledWith('SELECT 1;');
    expect(first).toEqual({
      dbFile: null,
      sqlPrepare: 'CREATE TABLE world(id INT);',
      solutionPrepare: 'decoded:SELECT 1;',
    });
    expect(second).toBe(first);
  });
});