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

const {
  default: SQLQuestion,
  parseExternalLibraryUrlsYaml,
} = await import('../src/scripts/sql-question.js');

describe('SQLQuestion', () => {
  beforeEach(() => {
    H5P.getPath.mockClear();
    vi.unstubAllGlobals();
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

  it('passes shared YAML CDN options into container and runtime options', () => {
    expect(parseExternalLibraryUrlsYaml(`
      blockly: https://cdn.example.com/blockly/
      codeMirror: https://cdn.example.com/codemirror/
      markdown: https://cdn.example.com/markdown/
      fontAwesome: https://cdn.example.com/fontawesome.css
      sweetAlert: https://cdn.example.com/sweetalert/
      jsZip: https://cdn.example.com/jszip/
      sqlJs: https://cdn.example.com/sql.js/dist/
    `)).toEqual({
      blocklyCdnUrl: 'https://cdn.example.com/blockly/',
      codeMirrorCdnUrl: 'https://cdn.example.com/codemirror/',
      markdownCdnUrl: 'https://cdn.example.com/markdown/',
      fontAwesomeCdnUrl: 'https://cdn.example.com/fontawesome.css',
      sweetAlertCdnUrl: 'https://cdn.example.com/sweetalert/',
      jsZipCdnUrl: 'https://cdn.example.com/jszip/',
      sqlJsUrl: 'https://cdn.example.com/sql.js/dist/',
    });

    const question = new SQLQuestion({
      advancedOptions: {
        externalLibraryUrls: `
          blockly: https://cdn.example.com/blockly/
          codeMirror: https://cdn.example.com/codemirror/
          markdown: https://cdn.example.com/markdown/
          fontAwesome: https://cdn.example.com/fontawesome.css
          sweetAlert: https://cdn.example.com/sweetalert/
          jsZip: https://cdn.example.com/jszip/
          sqlJs: https://cdn.example.com/sql.js/dist/
        `,
        sqlJsUrl: 'https://legacy.example.com/sql.js/dist/',
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
      sqlFile: null,
      cleanMySQLDump: false,
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

  it('keeps supported Blockly editor modes', () => {
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

    expect(blocksQuestion.getCodeContainerOptions().editorMode).toBe('blocks');
    expect(bothQuestion.getCodeContainerOptions().editorMode).toBe('both');
  });

  it('keeps fill-blanks editor mode', () => {
    const question = new SQLQuestion({
      editorSettings: {
        editorMode: 'fill-blanks',
      },
    }, 1);

    expect(question.getCodeContainerOptions().editorMode).toBe('fill-blanks');
  });

  it('keeps relational-algebra editor mode', () => {
    const question = new SQLQuestion({
      editorSettings: {
        editorMode: 'relalg',
      },
    }, 1);

    expect(question.getCodeContainerOptions().editorMode).toBe('relalg');
  });

  it('injects the relational-algebra editor factory for every container', () => {
    const question = new SQLQuestion({
      editorSettings: { editorMode: 'code' },
    }, 1);

    const options = question.getCodeContainerOptions();
    expect(options.editorFactories).toBeDefined();
    expect(typeof options.editorFactories.relalg).toBe('function');
  });

  it('passes Blockly options for standalone SQL code blocks', () => {
    const workspaceState = { blocks: { blocks: [{ type: 'sql_select_query' }] } };
    const question = new SQLQuestion({
      editorSettings: {
        editorMode: 'code',
      },
    }, 1);

    expect(question.getCodeContainerOptions({
      editorMode: 'both',
      blocklyWorkspaceState: workspaceState,
    })).toMatchObject({
      editorMode: 'both',
      blocklyWorkspaceState: workspaceState,
      blocklyPackages: [],
    });
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
        uploadType: 'db_file',
        dbFile: { path: 'custom.sqlite' },
      },
    }, 9);

    const options = await question.getDatabaseOptions();

    expect(options.dbFile).toBe('resolved:9:custom.sqlite');
    expect(options.sqlPrepare).toBeNull();
  });

  it('uses uploaded SQL file with import options when selected', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        select_db: 'from_file',
        uploadType: 'sql_file',
        dbFile: { path: 'ignored.sqlite' },
        sqlFile: { path: 'dump.sql' },
        sqlImportOptions: {
          cleanMySQLDump: true,
        },
      },
    }, 9);

    const options = await question.getDatabaseOptions();

    expect(options.dbFile).toBeNull();
    expect(options.sqlFile).toBe('resolved:9:dump.sql');
    expect(options.cleanMySQLDump).toBe(true);
    expect(options.sqlPrepare).toBeNull();
  });

  it('resolves SQLite database presets from the repository manifest', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        select_db: 'from_repository',
        repositoryUrl: 'https://cdn.example.com/dbs/manifest.json',
        repositoryDatabase: 'world',
      },
    }, 9);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        databases: [
          {
            id: 'world',
            type: 'sqlite_file',
            url: 'databases/world.sqlite',
          },
        ],
      }),
    }));

    const options = await question.getDatabaseOptions();

    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/dbs/manifest.json');
    expect(options.dbFile).toBe('https://cdn.example.com/dbs/databases/world.sqlite');
    expect(options.sqlFile).toBeNull();
    expect(options.sqlPrepare).toBeNull();
    expect(options.cleanMySQLDump).toBe(false);
  });

  it('resolves SQL database presets from the default repository manifest', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        select_db: 'from_repository',
        repositoryDatabase: 'movie',
      },
    }, 9);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        databases: {
          movie: {
            type: 'sql_file',
            url: 'databases/movie.sql',
            cleanMySQLDump: true,
          },
        },
      }),
    }));

    const options = await question.getDatabaseOptions();

    expect(fetch).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/asbl/SQLQuestionDatabases/main/manifest.json'
    );
    expect(options.dbFile).toBeNull();
    expect(options.sqlFile).toBe(
      'https://raw.githubusercontent.com/asbl/SQLQuestionDatabases/main/databases/movie.sql'
    );
    expect(options.cleanMySQLDump).toBe(true);
    expect(options.sqlPrepare).toBeNull();
  });

  it('throws a clear error when the repository database is missing', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        select_db: 'from_repository',
        repositoryUrl: 'https://cdn.example.com/dbs/manifest.json',
        repositoryDatabase: 'missing',
      },
    }, 9);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        databases: [],
      }),
    }));

    await expect(question.getDatabaseOptions()).rejects.toThrow(
      'Database repository preset not found: missing'
    );
  });

  it('throws a clear error when repository file presets have no URL', async () => {
    const question = new SQLQuestion({
      databaseSettings: {
        select_db: 'from_repository',
        repositoryUrl: 'https://cdn.example.com/dbs/manifest.json',
        repositoryDatabase: 'broken',
      },
    }, 9);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        databases: [
          {
            id: 'broken',
            type: 'sql_file',
          },
        ],
      }),
    }));

    await expect(question.getDatabaseOptions()).rejects.toThrow(
      'Missing URL for repository database: broken'
    );
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
