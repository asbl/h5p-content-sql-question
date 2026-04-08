import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tablesRuntimeCtor: vi.fn(),
}));

vi.mock('../src/scripts/runtime/runtime-tables-all.sql', () => ({
  default: class SQLTablesAllRuntimeMock {
    constructor(...args) {
      mocks.tablesRuntimeCtor(...args);
    }
  },
}));

const { default: SQLCodeContainer } = await import('../src/scripts/container/container-sql.js');

describe('SQLCodeContainer', () => {
  it('falls back to bundled SQL labels when no content overrides exist', () => {
    const container = new SQLCodeContainer();
    const addButtons = vi.fn();

    container.l10n = {};
    container.getButtonManager = () => ({ addButtons, hideButton: vi.fn() });

    container.registerSQLButtons();

    expect(addButtons).toHaveBeenCalledWith([
      expect.objectContaining({ identifier: 'run_spinner', label: '...' }),
      expect.objectContaining({ identifier: 'tables_button', label: 'Tables' }),
      expect.objectContaining({ identifier: 'sql_result_button', label: 'Result' }),
    ]);
  });

  it('uses localized SQL labels for navigation buttons', () => {
    const container = new SQLCodeContainer();
    const addButtons = vi.fn();
    const hideButton = vi.fn();

    container.l10n = {
      sqlTables: 'Tabellen',
      sqlResult: 'Ergebnis',
    };
    container.getButtonManager = () => ({ addButtons, hideButton });

    container.registerSQLButtons();

    expect(addButtons).toHaveBeenCalledWith([
      expect.objectContaining({ identifier: 'run_spinner', label: '...' }),
      expect.objectContaining({ identifier: 'tables_button', label: 'Tabellen' }),
      expect.objectContaining({ identifier: 'sql_result_button', label: 'Ergebnis' }),
    ]);
    expect(hideButton).toHaveBeenCalledWith('run_spinner');
    expect(hideButton).toHaveBeenCalledWith('sql_result_button');
  });

  it('hides the console during setup even when the console manager has no hideConsole method', async () => {
    const container = new SQLCodeContainer();
    const wrapper = {
      classList: {
        add: vi.fn(),
      },
    };

    container.registerSQLButtons = vi.fn();
    container.registerSQLPages = vi.fn();
    container.registerDOM = vi.fn();
    container.unregisterInheritedRunObservers = vi.fn();
    container.registerSQLObservers = vi.fn();
    container.renderDatabaseTables = vi.fn().mockResolvedValue();
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
    }));
    container.appendDatabaseTable = vi.fn();

    await container.renderDatabaseTables();

    expect(container.options.getDatabaseOptions).toHaveBeenCalledTimes(1);
    expect(container.createTablesRuntime).toHaveBeenCalledWith(databaseOptions);
    expect(setup).toHaveBeenCalledTimes(1);
    expect(prepareForRun).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(container.databaseTables).toBe(resultTables);
    expect(container.appendDatabaseTable).toHaveBeenNthCalledWith(1, 'world', '<p>| world table |</p>');
    expect(container.appendDatabaseTable).toHaveBeenNthCalledWith(2, 'city', '<p>| city table |</p>');
  });

  it('updates the SQL result button without rebuilding the container DOM', () => {
    const container = new SQLCodeContainer();
    const buttonManager = {
      setActive: vi.fn(),
      updateButton: vi.fn(),
    };

    container.getButtonManager = () => buttonManager;
    container.registerDOM = vi.fn();
    container.resizeActionHandler = vi.fn();

    container.handleSQLResultPageShown();

    expect(buttonManager.updateButton).toHaveBeenCalledWith('sql_result_button', true);
    expect(buttonManager.setActive).toHaveBeenCalledWith('sql_result_button');
    expect(container.registerDOM).not.toHaveBeenCalled();
    expect(container.resizeActionHandler).toHaveBeenCalledTimes(1);
  });

  it('hides the SQL result button when the result page is empty', () => {
    const container = new SQLCodeContainer();
    const buttonManager = {
      updateButton: vi.fn(),
    };

    container.getButtonManager = () => buttonManager;
    container.getPageManager = () => ({ isEmpty: vi.fn().mockReturnValue(true) });
    container.resizeActionHandler = vi.fn();

    container.handleSQLResultPageHidden();

    expect(buttonManager.updateButton).toHaveBeenCalledWith('sql_result_button', false);
    expect(container.resizeActionHandler).toHaveBeenCalledTimes(1);
  });

  it('renders database table headings as text instead of HTML', () => {
    const container = new SQLCodeContainer();
    const originalDocument = globalThis.document;

    container.l10n = {
      sqlTableHeading: 'Tabelle: {name}',
    };

    globalThis.document = {
      createElement: vi.fn((tagName) => ({
        tagName: tagName.toUpperCase(),
        textContent: '',
        innerHTML: '',
      })),
    };

    try {
      const heading = container.createTableHeading('<img src=x onerror=alert(1)>');

      expect(heading.textContent).toBe('Tabelle: <img src=x onerror=alert(1)>');

      expect(heading.innerHTML).toBe('');
    }
    finally {
      globalThis.document = originalDocument;
    }
  });
});