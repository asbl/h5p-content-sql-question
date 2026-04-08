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

    container.l10n = {};
    container.getButtonManager = () => ({ addButtons, hideButton: vi.fn() });

    container.registerSQLButtons();

    expect(addButtons).toHaveBeenCalledWith([
      expect.objectContaining({ identifier: 'run_spinner', label: '...' }),
    ]);
  });

  it('registers only the temporary loading button for SQL', () => {
    const container = new SQLCodeContainer();
    const addButtons = vi.fn();
    const hideButton = vi.fn();
    container.getButtonManager = () => ({ addButtons, hideButton });

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

  it('renders an explanatory empty-result message when a query returns no rows', () => {
    const container = new SQLCodeContainer();

    const markup = container.buildResultMarkup([{ columns: ['name'], values: [] }], '| name |');

    expect(markup).toContain('The query is correct, but nothing matches.');
    expect(markup).toContain('0 rows across 1 columns');
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
});