import SQLTablesAllRuntime from '../runtime/runtime-tables-all.sql';
import { getSQLQuestionL10nValue, tSQLQuestion } from '../services/sqlquestion-l10n';

export default class SQLCodeContainer extends H5P.CodeQuestionContainer {

  /**
   * Returns a localized SQL-specific label.
   * @param {string} key - L10n key.
   * @param {object} [replacements] - Placeholder replacements.
   * @returns {string} Localized label.
   */
  getLocalizedSQLLabel(key, replacements = {}) {
    return Object.keys(replacements).length > 0
      ? tSQLQuestion(this.l10n, key, replacements)
      : getSQLQuestionL10nValue(this.l10n, key);
  }

  async setup() {
    await super.setup();
    this.registerSQLButtons();
    this.registerSQLPages();
    this.registerDOM();

    this.unregisterInheritedRunObservers();
    this.registerSQLObservers();

    this.hideConsole();
    await this.renderDatabaseTables();
  }

  /**
   * Hides the console using the current or legacy console manager API.
   * @returns {void}
   */
  hideConsole() {
    const consoleManager = this.getConsoleManager?.();
    if (!consoleManager) {
      return;
    }

    if (typeof consoleManager.hideConsole === 'function') {
      consoleManager.hideConsole();
      return;
    }

    const consoleElement = typeof document?.getElementById === 'function' && consoleManager.consoleUID
      ? document.getElementById(consoleManager.consoleUID)
      : null;
    const wrapper = consoleElement?.parentElement;

    if (!wrapper) {
      return;
    }

    wrapper.classList.add('hidden');
    this.resizeActionHandler();
  }

  /**
   * Registers SQL-specific navigation buttons.
   * @returns {void}
   */
  registerSQLButtons() {
    this.getButtonManager().addButtons([
      {
        identifier: 'run_spinner',
        label: '...',
        class: 'run_spinner',
        weight: -1,
      },
      {
        identifier: 'tables_button',
        label: this.getLocalizedSQLLabel('sqlTables'),
        class: 'tables',
      },
      {
        identifier: 'sql_result_button',
        name: 'sql_result_button',
        label: this.getLocalizedSQLLabel('sqlResult'),
        class: 'sql-result',
      },
    ]);

    this.getButtonManager().hideButton('run_spinner');
    this.getButtonManager().hideButton('sql_result_button');
  }

  /**
   * Registers SQL-specific pages.
   * @returns {void}
   */
  registerSQLPages() {
    this.getPageManager().addPage('tables', '', 'tables', false, true);
    this.getPageManager().addPage('sql_result', '', 'sql_result', false, false);
  }

  /**
   * Removes inherited state observers that conflict with the SQL spinner flow.
   * @returns {void}
   */
  unregisterInheritedRunObservers() {
    [
      'state:run:showStopButton',
      'state:stop:hideStopButton',
      'state:stop:showRunButton',
    ].forEach((observerName) => this.getObserverManager().unregister(observerName));
  }

  /**
   * Registers SQL-specific observers.
   * @returns {void}
   */
  registerSQLObservers() {
    this.getObserverManager().register(
      'button:tables',
      new H5P.ButtonClickedObserver(
        this.getButtonManager().getButton('tables_button'),
        () => this.getPageManager().showPage('tables'),
      ),
    );

    this.getObserverManager().register(
      'button:result',
      new H5P.ButtonClickedObserver(
        this.getButtonManager().getButton('sql_result_button'),
        () => this.getPageManager().showPage('sql_result'),
      ),
    );

    this.getObserverManager().register(
      'state:run:showSpinner',
      new H5P.StateRunObserver(
        this.getStateManager(),
        () => {
          this.getButtonManager().showButton('run_spinner');
        },
      ),
    );

    this.getObserverManager().register(
      'state:run:hideSpinner',
      new H5P.StateStopObserver(
        this.getStateManager(),
        () => this.getButtonManager().hideButton('run_spinner'),
      ),
    );

    this.getObserverManager().register(
      'page:hide:code',
      new H5P.PageHideObserver(
        this.getPageManager().getPage('code'),
        () => {
          this.getButtonManager().hideButton('runButton');
        },
      ),
    );

    this.getObserverManager().register(
      'page:show:code',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('code'),
        () => {
          this.getButtonManager().showButton('runButton');
        },
      ),
    );

    this.getObserverManager().register(
      'page:show:tables',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('tables'),
        () => this.handleTablesPageShown(),
      ),
    );

    this.getObserverManager().register(
      'page:hide:sqlresults',
      new H5P.PageHideObserver(
        this.getPageManager().getPage('sql_result'),
        () => this.handleSQLResultPageHidden(),
      ),
    );

    this.getObserverManager().register(
      'page:show:sqlresults',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('sql_result'),
        () => this.handleSQLResultPageShown(),
      ),
    );
  }

  /**
   * Marks the tables navigation as active.
   * @returns {void}
   */
  handleTablesPageShown() {
    this.getButtonManager().setActive('tables_button');
  }

  /**
   * Updates the SQL result button without rebuilding the full container DOM.
   * @param {boolean} isVisible - Whether the SQL result button should be visible.
   * @returns {void}
   */
  updateSQLResultButtonVisibility(isVisible) {
    this.getButtonManager().updateButton('sql_result_button', isVisible);
    this.resizeActionHandler();
  }

  /**
   * Marks the SQL result navigation as active and visible.
   * @returns {void}
   */
  handleSQLResultPageShown() {
    this.updateSQLResultButtonVisibility(true);
    this.getButtonManager().setActive('sql_result_button');
  }

  /**
   * Restores the SQL result button only when there is result content.
   * @returns {void}
   */
  handleSQLResultPageHidden() {
    this.updateSQLResultButtonVisibility(!this.getPageManager().isEmpty('sql_result'));
  }

  /**
   * Creates the runtime used to render the database table overview.
   * @param {object} databaseOptions - Database configuration.
   * @returns {SQLTablesAllRuntime} Runtime instance.
   */
  createTablesRuntime(databaseOptions) {
    return new SQLTablesAllRuntime(
      () => this.resizeActionHandler(),
      this,
      databaseOptions,
    );
  }

  /**
   * Renders the overview of available database tables.
   * @returns {Promise<void>}
   */
  async renderDatabaseTables() {
    const databaseOptions = await this.options.getDatabaseOptions();
    const tablesRuntime = this.createTablesRuntime(databaseOptions);

    tablesRuntime.setup();
    tablesRuntime.prepareForRun();
    await tablesRuntime.run();

    this.databaseTables = tablesRuntime.resultTables;
    this.databaseTables.forEach((value, key) => {
      const formattedTable = new H5P.Markdown(value).getHTML();
      this.appendDatabaseTable(key, formattedTable);
    });
  }

  /**
   * Creates a safe heading element for one database table.
   * @param {string} tableName - Table name to display.
   * @returns {HTMLHeadingElement} Heading element.
   */
  createTableHeading(tableName) {
    const heading = document.createElement('h3');
    heading.textContent = this.getLocalizedSQLLabel('sqlTableHeading', { name: tableName });
    return heading;
  }

  /**
   * Appends a rendered database table to the tables page.
   * @param {string} tableName - Table name to display.
   * @param {string} formattedTable - HTML table markup.
   * @returns {void}
   */
  appendDatabaseTable(tableName, formattedTable) {
    const tableWrapper = document.createElement('div');
    tableWrapper.innerHTML = formattedTable;

    this.getPageManager().appendChild('tables', this.createTableHeading(tableName));
    this.getPageManager().appendChild('tables', tableWrapper);
  }


  /**
   * Return mode for SQL
   * @returns {string} String: 'sql'
   */
  getMode() {
    return 'sql';
  }

}
