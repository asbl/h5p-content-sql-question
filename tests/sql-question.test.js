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
    expect(options.blocklyCdnUrl).toBe('');
    expect(options.codeMirrorCdnUrl).toBe('');
    expect(options.markdownCdnUrl).toBe('');
    expect(options.fontAwesomeCdnUrl).toBe('');
    expect(options.sweetAlertCdnUrl).toBe('');
    expect(options.jsZipCdnUrl).toBe('');
    expect(options.sqlJsUrl).toBe('');
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
      getDatabaseOptions: expect.any(Function),
      sweetAlertCdnUrl: '',
      sqlJsUrl: '',
    });
  });

  it('passes advanced CDN options into container and runtime options', () => {
    const question = new SQLQuestion({
      advancedOptions: {
        blocklyCdnUrl: 'https://cdn.example.com/blockly/',
        codeMirrorCdnUrl: 'https://cdn.example.com/codemirror/',
        markdownCdnUrl: 'https://cdn.example.com/markdown/',
        fontAwesomeCdnUrl: 'https://cdn.example.com/fontawesome.css',
        sweetAlertCdnUrl: 'https://cdn.example.com/sweetalert/',
        jsZipCdnUrl: 'https://cdn.example.com/jszip/',
        sqlJsUrl: 'https://cdn.example.com/sql.js/dist/',
      },
    }, 1);

    expect(question.getCodeContainerOptions()).toMatchObject({
      blocklyCdnUrl: 'https://cdn.example.com/blockly/',
      codeMirrorCdnUrl: 'https://cdn.example.com/codemirror/',
      markdownCdnUrl: 'https://cdn.example.com/markdown/',
      fontAwesomeCdnUrl: 'https://cdn.example.com/fontawesome.css',
      sweetAlertCdnUrl: 'https://cdn.example.com/sweetalert/',
      jsZipCdnUrl: 'https://cdn.example.com/jszip/',
      sqlJsUrl: 'https://cdn.example.com/sql.js/dist/',
    });

    expect(question.getRuntimeOptions()).toMatchObject({
      sweetAlertCdnUrl: 'https://cdn.example.com/sweetalert/',
      sqlJsUrl: 'https://cdn.example.com/sql.js/dist/',
    });
  });

  it('initializes database options once and caches the prepared solution', async () => {
    const question = new SQLQuestion({
      gradingSettings: {
        gradingMethod: 'bySolution',
        solution: 'SELECT 1;',
      },
      databaseSettings: {
        select_db: 'from_defaults',
        selectDatabase: 'world',
      },
    }, 2);

    question._getSQLPrepare = vi.fn().mockReturnValue('CREATE TABLE world(name TEXT);');
    question.getDecodedCode = vi.fn((code) => `decoded:${code}`);

    const first = await question.getDatabaseOptions();
    const second = await question.getDatabaseOptions();

    expect(question._getSQLPrepare).toHaveBeenCalledTimes(1);
    expect(question.getDecodedCode).toHaveBeenCalledWith('SELECT 1;');
    expect(first).toEqual({
      dbFile: null,
      sqlPrepare: 'CREATE TABLE world(name TEXT);',
      solutionPrepare: 'decoded:SELECT 1;',
    });
    expect(second).toBe(first);
  });

  it('keeps editor mode as code when configured as code', () => {
    const question = new SQLQuestion({
      editorSettings: {
        editorMode: 'code',
      },
    }, 1);

    const options = question.getCodeContainerOptions();
    expect(options.editorMode).toBe('code');
  });

  it('normalizes unsupported editor modes to code', () => {
    const blocksQuestion = new SQLQuestion({
      editorSettings: {
        editorMode: 'blocks',
      },
    }, 1);

    const bothQuestion = new SQLQuestion({
      editorSettings: {
        editorMode: 'both',
      },
    }, 1);

    expect(blocksQuestion.getCodeContainerOptions().editorMode).toBe('code');
    expect(bothQuestion.getCodeContainerOptions().editorMode).toBe('code');
  });

  it('derives SQL-specific feedback text from table comparison details', () => {
    const question = new SQLQuestion({
      l10n: {},
    }, 1);

    question.codeTester = {
      lastComparison: {
        identical: true,
      },
    };

    expect(question.getFeedbackText()).toBe('Your query returns the correct columns and rows.');

    question.codeTester.lastComparison = {
      identical: false,
      nonMatchingRows: 2,
      nonMatchingCols: 1,
    };

    expect(question.getFeedbackText()).toBe('Your query is not correct yet. Check 2 row differences and 1 column differences.');
  });

  it('uses uploaded database file when select_db is from_file', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        select_db: 'from_file',
        dbFile: { path: 'custom.sqlite' },
      },
    }, 9);

    const options = await question.getDatabaseOptions();

    expect(options.dbFile).toBe('resolved:9:custom.sqlite');
    expect(options.sqlPrepare).toBeNull();
  });

  it('returns null sqlPrepare for unknown default preset name', () => {
    const question = new SQLQuestion({
      databaseSettings: {
        selectDatabase: 'does-not-exist',
      },
    }, 1);

    expect(question._getSQLPrepare(question.params)).toBeNull();
  });
});