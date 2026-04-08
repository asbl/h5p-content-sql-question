import SQLTablesAllRuntime from '../runtime/runtime-tables-all.sql';
import { analyzeSQLHints, buildSQLSchema } from '../services/sql-guidance';
import { getSQLQuestionL10nValue, tSQLQuestion } from '../services/sqlquestion-l10n';

export default class SQLCodeContainer extends H5P.CodeQuestionContainer {

  enhanceOptionCallbacks() {
    if (this.options?._sqlCallbacksEnhanced) {
      return;
    }

    this.options = this.options || {};
    const inheritedCallback = this.options?.onChangeCallback;
    this.options.onChangeCallback = (code) => {
      inheritedCallback?.(code);
      this.handleEditorCodeChanged(code);
    };
    this.options._sqlCallbacksEnhanced = true;
  }

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
    this.enhanceOptionCallbacks();
    await super.setup();
    this.registerSQLButtons();
    this.registerSQLPages();
    this.registerDOM();
    this.decorateCodePage();

    this.unregisterInheritedRunObservers();
    this.registerSQLObservers();

    this.hideConsole();
    await this.renderDatabaseTables();
    this.handleEditorCodeChanged(this.getEditorManager?.()?.getCode?.() || '');
  }

  escapeHTML(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  decorateCodePage() {
    const codePage = this.getPageManager().getPage('code');
    if (!codePage || codePage.querySelector('.sql-code-workspace')) {
      return;
    }

    const workspace = document.createElement('div');
    workspace.className = 'sql-code-workspace';

    const editorPane = document.createElement('div');
    editorPane.className = 'sql-editor-pane';

    while (codePage.firstChild) {
      editorPane.appendChild(codePage.firstChild);
    }

    this.databasePreviewBody = document.createElement('div');
    this.databasePreviewBody.className = 'sql-preview-body sql-preview-body-database';

    this.resultPreviewBody = document.createElement('div');
    this.resultPreviewBody.className = 'sql-preview-body sql-preview-body-result';

    const previewPane = document.createElement('aside');
    previewPane.className = 'sql-preview-pane';
    previewPane.appendChild(this.createPreviewSection('sqlPreviewTablesTitle', this.databasePreviewBody));
    previewPane.appendChild(this.createPreviewSection('sqlPreviewResultTitle', this.resultPreviewBody));

    workspace.appendChild(editorPane);
    workspace.appendChild(previewPane);
    codePage.appendChild(workspace);
  }

  createPreviewSection(labelKey, body) {
    const section = document.createElement('section');
    section.className = 'sql-preview-section';

    const heading = document.createElement('h3');
    heading.className = 'sql-preview-heading';
    heading.textContent = this.getLocalizedSQLLabel(labelKey);

    section.appendChild(heading);
    section.appendChild(body);
    return section;
  }

  getDatabaseSchema() {
    return buildSQLSchema(this.databaseTableResults);
  }

  handleEditorCodeChanged(code = '') {
    this.currentEditorCode = code;
    this.updateEditorDiagnostics(code);
  }

  updateEditorDiagnostics(code = '') {
    const editorInstance = this.getEditorManager?.()?.getActiveEditorInstance?.();
    if (!editorInstance?.setInlineDiagnostics) {
      return;
    }

    const diagnostics = analyzeSQLHints(code, this.getDatabaseSchema()).map((diagnostic) => ({
      from: diagnostic.from,
      to: diagnostic.to,
      severity: diagnostic.severity,
      message: this.getSQLDiagnosticMessage(diagnostic),
    }));

    editorInstance.setInlineDiagnostics(diagnostics);
  }

  getSQLDiagnosticMessage(diagnostic = {}) {
    if (diagnostic.type === 'unknown-table') {
      if (diagnostic.suggestion) {
        return this.getLocalizedSQLLabel('sqlHintUnknownTableSuggestion', {
          name: diagnostic.identifier,
          suggestion: diagnostic.suggestion,
        });
      }

      return this.getLocalizedSQLLabel('sqlHintUnknownTable', {
        name: diagnostic.identifier,
      });
    }

    if (diagnostic.suggestion) {
      return this.getLocalizedSQLLabel('sqlHintUnknownColumnSuggestion', {
        name: diagnostic.identifier,
        suggestion: diagnostic.suggestion,
      });
    }

    return this.getLocalizedSQLLabel('sqlHintUnknownColumn', {
      name: diagnostic.identifier,
    });
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
    this.databaseTableResults = tablesRuntime.tableResults;
    this.databaseTables.forEach((value, key) => {
      const formattedTable = new H5P.Markdown(value).getHTML();
      this.appendDatabaseTable(key, formattedTable);
    });

    this.renderDatabasePreview();
  }

  renderDatabasePreview() {
    if (!this.databasePreviewBody) {
      return;
    }

    if (!(this.databaseTableResults instanceof Map) || this.databaseTableResults.size === 0) {
      this.databasePreviewBody.innerHTML = `<p class="sql-preview-note">${this.getLocalizedSQLLabel('sqlPreviewNoTables')}</p>`;
      return;
    }

    const cards = [];
    this.databaseTableResults.forEach((tableResult, tableName) => {
      const table = Array.isArray(tableResult) ? tableResult[0] : tableResult;
      if (!table) {
        return;
      }

      const columns = Array.isArray(table.columns) ? table.columns : [];
      const rows = Array.isArray(table.values) ? table.values.slice(0, 5) : [];
      const chipMarkup = columns
        .map((column) => `<span class="sql-column-chip">${this.escapeHTML(column)}</span>`)
        .join('');

      cards.push(`
        <article class="sql-table-card">
          <header class="sql-table-card-header">
            <h4>${this.escapeHTML(tableName)}</h4>
            <p>${this.getLocalizedSQLLabel('sqlPreviewTableMeta', {
              columns: columns.length,
              rows: Array.isArray(table.values) ? table.values.length : 0,
            })}</p>
          </header>
          <div class="sql-column-chip-list">${chipMarkup}</div>
          ${this.renderCompactTable(columns, rows)}
        </article>
      `);
    });

    this.databasePreviewBody.innerHTML = cards.join('');
  }

  renderCompactTable(columns = [], rows = []) {
    const headerMarkup = columns
      .map((column) => `<th>${this.escapeHTML(column)}</th>`)
      .join('');

    const bodyMarkup = rows.map((row) => `
      <tr>${row.map((cell) => `<td>${this.escapeHTML(cell)}</td>`).join('')}</tr>
    `).join('');

    return `
      <div class="sql-preview-table-scroll">
        <table class="sql-preview-table">
          <thead><tr>${headerMarkup}</tr></thead>
          <tbody>${bodyMarkup}</tbody>
        </table>
      </div>
    `;
  }

  getResultMetrics(resultObject = []) {
    const table = Array.isArray(resultObject) ? resultObject[0] : null;
    const rowCount = Array.isArray(table?.values) ? table.values.length : 0;
    const columnCount = Array.isArray(table?.columns) ? table.columns.length : 0;

    return {
      rowCount,
      columnCount,
      hasRows: rowCount > 0,
      hasColumns: columnCount > 0,
    };
  }

  buildResultMarkup(resultObject = [], resultTable = '') {
    const metrics = this.getResultMetrics(resultObject);

    if (!metrics.hasColumns) {
      return `
        <div class="sql-result-card sql-result-card-empty">
          <p class="sql-result-status">${this.getLocalizedSQLLabel('sqlResultEmptyTitle')}</p>
          <p>${this.getLocalizedSQLLabel('sqlResultEmptyDescription')}</p>
        </div>
      `;
    }

    const status = metrics.hasRows
      ? this.getLocalizedSQLLabel('sqlResultSuccessTitle')
      : this.getLocalizedSQLLabel('sqlResultNoRowsTitle');

    const summary = metrics.hasRows
      ? this.getLocalizedSQLLabel('sqlResultSuccessDescription', {
        rows: metrics.rowCount,
        columns: metrics.columnCount,
      })
      : this.getLocalizedSQLLabel('sqlResultNoRowsDescription', {
        columns: metrics.columnCount,
      });

    return `
      <div class="sql-result-card ${metrics.hasRows ? 'sql-result-card-success' : 'sql-result-card-empty'}">
        <p class="sql-result-status">${status}</p>
        <p>${summary}</p>
      </div>
      ${resultTable ? new H5P.Markdown(resultTable).getHTML() : ''}
    `;
  }

  renderSQLResult(resultObject = [], resultTable = '') {
    const markup = this.buildResultMarkup(resultObject, resultTable);

    this.getPageManager().setContent('sql_result', markup);
    if (this.resultPreviewBody) {
      this.resultPreviewBody.innerHTML = markup;
    }
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
