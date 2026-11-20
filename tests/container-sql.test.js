import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tablesRuntimeCtor: vi.fn(),
  warmup: vi.fn(() => Promise.resolve()),
}));

vi.mock('../src/scripts/runtime/runtime-tables-all.sql', () => ({
  default: class SQLTablesAllRuntimeMock {
    constructor(...args) {
      mocks.tablesRuntimeCtor(...args);
    }
  },
}));

vi.mock('../src/scripts/runtime/sqlrunner.js', () => ({
  default: class SQLRunnerMock {
    static warmup() {
      return mocks.warmup();
    }
  },
}));

const { default: SQLCodeContainer } = await import('../src/scripts/container/container-sql.js');

describe('SQLCodeContainer', () => {
  beforeEach(() => {
    mocks.warmup.mockClear();
  });

  it('falls back to bundled SQL labels when no content overrides exist', () => {
    const container = new SQLCodeContainer();
    const addButtons = vi.fn();
    const getButton = vi.fn(() => null);

    container.l10n = {};
    container.getButtonManager = () => ({ addButtons, hideButton: vi.fn(), getButton });

    container.registerSQLButtons();

    expect(addButtons).toHaveBeenCalledWith([
      expect.objectContaining({ identifier: 'run_spinner', label: '...' }),
    ]);
  });

  it('registers only the temporary loading button for SQL', () => {
    const container = new SQLCodeContainer();
    const addButtons = vi.fn();
    const hideButton = vi.fn();
    const getButton = vi.fn(() => null);
    container.getButtonManager = () => ({ addButtons, hideButton, getButton });

    container.registerSQLButtons();

    expect(addButtons).toHaveBeenCalledWith([
      expect.objectContaining({ identifier: 'run_spinner', label: '...' }),
    ]);
    expect(hideButton).toHaveBeenCalledWith('run_spinner');
  });

  it('hides the console during setup even when the console manager has no hideConsole method', async () => {
    const container = new SQLCodeContainer();
    const wrapper = {
      classList: {
        add: vi.fn(),
      },
    };

    container.registerSQLButtons = vi.fn();
    container.registerDOM = vi.fn();
    container.unregisterInheritedRunObservers = vi.fn();
    container.registerSQLObservers = vi.fn();
    container.renderDatabaseTables = vi.fn().mockResolvedValue();
    container.getPageManager = vi.fn(() => ({
      getPage: vi.fn(() => null),
    }));
    container.getConsoleManager = vi.fn(() => ({
      consoleUID: 'console-1',
    }));

    const originalDocument = globalThis.document;
    globalThis.document = {
      ...originalDocument,
      getElementById: vi.fn(() => ({
        parentElement: wrapper,
      })),
    };

    try {
      await container.setup();

      expect(mocks.warmup).toHaveBeenCalledTimes(1);
      expect(globalThis.document.getElementById).toHaveBeenCalledWith('console-1');
      expect(wrapper.classList.add).toHaveBeenCalledWith('hidden');
      expect(container.renderDatabaseTables).toHaveBeenCalledTimes(1);
    }
    finally {
      globalThis.document = originalDocument;
    }
  });

  it('unregisters inherited run observers that conflict with the SQL spinner flow', () => {
    const container = new SQLCodeContainer();
    const unregister = vi.fn();

    container.getObserverManager = () => ({ unregister });

    container.unregisterInheritedRunObservers();

    expect(unregister).toHaveBeenCalledWith('state:run:showStopButton');
    expect(unregister).toHaveBeenCalledWith('state:stop:hideStopButton');
    expect(unregister).toHaveBeenCalledWith('state:stop:showRunButton');
  });

  it('creates the table runtime with the container resize handler and database options', () => {
    const container = new SQLCodeContainer();
    const databaseOptions = { dbFile: 'db.sqlite' };
    container.resizeActionHandler = vi.fn();

    container.createTablesRuntime(databaseOptions);

    expect(mocks.tablesRuntimeCtor).toHaveBeenCalledTimes(1);
    expect(mocks.tablesRuntimeCtor.mock.calls[0][1]).toBe(container);
    expect(mocks.tablesRuntimeCtor.mock.calls[0][2]).toBe(databaseOptions);
    expect(typeof mocks.tablesRuntimeCtor.mock.calls[0][0]).toBe('function');
  });

  it('loads database tables and appends every rendered table to the tables page', async () => {
    const container = new SQLCodeContainer();
    const databaseOptions = { dbFile: 'db.sqlite' };
    const resultTables = new Map([
      ['world', '| world table |'],
      ['city', '| city table |'],
    ]);
    const setup = vi.fn();
    const prepareForRun = vi.fn();
    const run = vi.fn().mockResolvedValue();

    container.options = {
      getDatabaseOptions: vi.fn().mockResolvedValue(databaseOptions),
    };
    container.createTablesRuntime = vi.fn(() => ({
      setup,
      prepareForRun,
      run,
      resultTables,
      tableResults: new Map(),
    }));

    await container.renderDatabaseTables();

    expect(container.options.getDatabaseOptions).toHaveBeenCalledTimes(1);
    expect(container.createTablesRuntime).toHaveBeenCalledWith(databaseOptions);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(prepareForRun).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(container.databaseTables).toBe(resultTables);
  });

  it('renders an explanatory empty-result message when a query returns no rows', async () => {
    const container = new SQLCodeContainer();

    const markup = await container.buildResultMarkup([{ columns: ['name'], values: [] }], '| name |');

    expect(markup).toContain('Query executed, but no row matches.');
    expect(markup).toContain('0 rows (1 columns)');
  });

  it('reports changed rows for statements without a result set', async () => {
    const container = new SQLCodeContainer();

    const markup = await container.buildResultMarkup([], '', { rowsModified: 3 });

    expect(markup).toContain('3 rows were changed.');
  });

  it('shows large results stepwise with a row-count caption instead of a fake table row', () => {
    const container = new SQLCodeContainer();
    container.resizeActionHandler = vi.fn();
    const values = Array.from({ length: 195 }, (_, index) => [index]);

    const wrapper = container.buildResultTable({ columns: ['id'], values });
    const [scroll, caption, more] = wrapper.children;
    const body = scroll.children[0].children[1];

    expect(body.children).toHaveLength(10);
    expect(caption.textContent).toBe('10 of 195 rows shown');
    expect(more.textContent).toBe('Show 50 more rows');

    more.dispatch('click');
    expect(body.children).toHaveLength(60);

    more.dispatch('click');
    more.dispatch('click');
    more.dispatch('click');
    expect(body.children).toHaveLength(195);
    expect(more.hidden).toBe(true);
    expect(caption.hidden).toBe(true);
  });

  it('inserts clicked column names into the editor', () => {
    const container = new SQLCodeContainer();
    const dispatch = vi.fn();
    const focus = vi.fn();
    container.getEditorManager = () => ({
      getActiveEditorInstance: () => ({
        editorView: { state: { selection: { main: { from: 7, to: 7 } } }, dispatch, focus },
      }),
    });
    container.databasePreviewBody = { innerHTML: '' };
    container.databaseTableResults = new Map([
      ['world', [{ columns: ['name', 'Population (M)'], values: [['Germany', 1]] }]],
    ]);

    container.insertIntoEditor(container.quoteSQLIdentifierIfNeeded('Population (M)'));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: { from: 7, to: 7, insert: '"Population (M)"' },
    }));
    expect(focus).toHaveBeenCalled();
    expect(container.quoteSQLIdentifierIfNeeded('name')).toBe('name');
  });

  it('appends clicked names when the cursor was never placed in the query', () => {
    const container = new SQLCodeContainer();
    const dispatch = vi.fn();
    container.getEditorManager = () => ({
      getActiveEditorInstance: () => ({
        editorView: {
          state: { selection: { main: { from: 0, to: 0, empty: true } }, doc: { length: 8, toString: () => 'SELECT *' } },
          dispatch,
        },
      }),
    });

    container.insertIntoEditor('name');

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: { from: 8, to: 8, insert: ' name' },
    }));
  });

  it('renders available tables preview without example rows', () => {
    const container = new SQLCodeContainer();
    container.databasePreviewBody = { innerHTML: '' };
    container.databaseTableResults = new Map([
      ['world', [{ columns: ['name', 'population'], values: [['Germany', 1]] }]],
    ]);

    container.renderDatabasePreview();

    expect(container.databasePreviewBody.innerHTML).toContain('world');
    expect(container.databasePreviewBody.innerHTML).toContain('population');
    expect(container.databasePreviewBody.innerHTML).not.toContain('Germany');
    expect(container.databasePreviewBody.innerHTML).not.toContain('<table');
  });

  it('shows and hides the loading spinner directly', () => {
    const container = new SQLCodeContainer();
    const buttonManager = {
      showButton: vi.fn(),
      hideButton: vi.fn(),
    };

    container.getButtonManager = () => buttonManager;
    container.showLoadingSpinner();
    container.hideLoadingSpinner();

    expect(buttonManager.showButton).toHaveBeenCalledWith('run_spinner');
    expect(buttonManager.hideButton).toHaveBeenCalledWith('run_spinner');
  });

  it('builds schema-based autocomplete config from the loaded database tables', () => {
    const container = new SQLCodeContainer();
    container.databaseTableResults = new Map([
      ['world', [{ columns: ['name', 'population'], values: [] }]],
      ['city', [{ columns: ['id'], values: [] }]],
    ]);

    expect(container.buildSQLAutocompleteConfig()).toEqual({
      schema: {
        world: ['name', 'population'],
        city: ['id'],
      },
      upperCaseKeywords: true,
    });
  });

  it('applies SQL autocomplete config to the editor manager after loading tables', async () => {
    const container = new SQLCodeContainer();
    const setLanguageConfig = vi.fn();
    const setCompletionConfig = vi.fn();
    const databaseOptions = { dbFile: 'db.sqlite' };
    const tableResults = new Map([
      ['world', [{ columns: ['name'], values: [] }]],
    ]);

    container.getEditorManager = vi.fn(() => ({ setLanguageConfig, setCompletionConfig }));
    container.renderDatabasePreview = vi.fn();
    container.options = {
      getDatabaseOptions: vi.fn().mockResolvedValue(databaseOptions),
    };
    container.createTablesRuntime = vi.fn(() => ({
      setup: vi.fn(),
      prepareForRun: vi.fn(),
      run: vi.fn().mockResolvedValue(),
      resultTables: new Map(),
      tableResults,
    }));

    await container.renderDatabaseTables();

    expect(setLanguageConfig).toHaveBeenCalledWith({
      schema: {
        world: ['name'],
      },
      upperCaseKeywords: true,
      defaultTable: 'world',
    });
    expect(setCompletionConfig).toHaveBeenCalledTimes(1);
    expect(setCompletionConfig.mock.calls[0][0]).toEqual(expect.objectContaining({
      activateOnTyping: true,
      maxRenderedOptions: 200,
      override: [expect.any(Function)],
    }));
  });

  it('hides the run result section until a run output is rendered and clears it again', async () => {
    const container = new SQLCodeContainer();

    container.l10n = {};
    container.resizeActionHandler = vi.fn();
    container.resultPreviewBody = { innerHTML: '' };
    container.resultSection = { hidden: false };

    container.clearRunOutput();

    expect(container.resultSection.hidden).toBe(true);

    await container.renderSQLResult([{ columns: ['name'], values: [['Oslo']] }], '| name |\n| --- |\n| Oslo |');

    expect(container.resultSection.hidden).toBe(false);
    expect(container.resultPreviewBody.innerHTML).toContain('sql-result-card');

    container.clearRunOutput();

    expect(container.resultSection.hidden).toBe(true);
    expect(container.resultPreviewBody.innerHTML).toBe('');
  });
});
describe('SQLCodeContainer runtime error location', () => {
  it('points at the token named by SQLite', () => {
    const container = new SQLCodeContainer();

    expect(container.getRuntimeErrorLocation({ message: 'Error: near "FORM": syntax error' })).toEqual({ token: 'FORM' });
    expect(container.getRuntimeErrorLocation({ message: 'Error: no such column: country.nmae' })).toEqual({ token: 'nmae' });
    expect(container.getRuntimeErrorLocation({ message: 'something else' })).toBeNull();
  });
});
