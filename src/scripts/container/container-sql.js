import SQLTablesAllRuntime from '../runtime/runtime-tables-all.sql';
import SQLRunner from '../runtime/sqlrunner';
import { createSQLCompletionSource } from '../services/sql-autocomplete';
import { analyzeSQLHints, buildSQLSchema } from '../services/sql-guidance';
import { getSQLQuestionL10nValue, tSQLQuestion } from '../services/sqlquestion-l10n';

export default class SQLCodeContainer extends H5P.CodeQuestionContainer {

  enforceSQLToolbarState() {
    const buttonManager = this.getButtonManager();
    buttonManager?.showButton?.('runButton');
    buttonManager?.hideButton?.('showCodeButton');
  }

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
    const sqlWarmup = SQLRunner.warmup();

    this.enhanceOptionCallbacks();
    await super.setup();
    this.registerSQLButtons();
    this.registerDOM();
    this.decorateCodePage();

    this.unregisterInheritedRunObservers();
    this.registerSQLObservers();

    this.hideConsole();
    await sqlWarmup;
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

    const editorContent = document.createElement('div');
    editorContent.className = 'sql-editor-content';

    while (codePage.firstChild) {
      editorContent.appendChild(codePage.firstChild);
    }

    editorPane.appendChild(editorContent);

    this.databasePreviewBody = document.createElement('div');
    this.databasePreviewBody.className = 'sql-preview-body sql-preview-body-database';

    this.resultPreviewBody = document.createElement('div');
    this.resultPreviewBody.className = 'sql-preview-body sql-preview-body-result';

    const previewPane = document.createElement('aside');
    previewPane.className = 'sql-preview-pane';

    const tablesSection = this.createPreviewSection(
      'sqlPreviewTablesTitle',
      this.databasePreviewBody,
      'sql-preview-section-tables'
    );
    const resultSection = this.createPreviewSection(
      'sqlPreviewResultTitle',
      this.resultPreviewBody,
      'sql-result-section'
    );

    this.resultSection = resultSection;
    this.clearRunOutput();

    previewPane.appendChild(tablesSection);

    workspace.appendChild(editorPane);
    workspace.appendChild(previewPane);
    workspace.appendChild(resultSection);
    codePage.appendChild(workspace);
  }

  createPreviewSection(labelKey, body, extraClass = '') {
    const section = document.createElement('section');
    section.className = `sql-preview-section ${extraClass}`.trim();

    const heading = document.createElement('h3');
    heading.className = 'sql-preview-heading';
    heading.textContent = this.getLocalizedSQLLabel(labelKey);

    section.appendChild(heading);
    section.appendChild(body);
    return section;
  }

  clearRunOutput() {
    if (this.resultPreviewBody) {
      this.resultPreviewBody.innerHTML = '';
    }

    if (this.resultSection) {
      this.resultSection.hidden = true;
    }

    this.resizeActionHandler?.();
  }

  getDatabaseSchema() {
    return buildSQLSchema(this.databaseTableResults);
  }

  buildSQLAutocompleteSchema() {
    if (!(this.databaseTableResults instanceof Map)) {
      return {};
    }

    const schema = {};

    this.databaseTableResults.forEach((tableResult, tableName) => {
      const table = Array.isArray(tableResult) ? tableResult[0] : tableResult;
      const columns = Array.isArray(table?.columns) ? table.columns : [];

      if (typeof tableName !== 'string' || tableName.trim() === '') {
        return;
      }

      schema[tableName] = columns
        .filter((column) => typeof column === 'string' && column.trim() !== '');
    });

    return schema;
  }

  buildSQLAutocompleteConfig() {
    const schema = this.buildSQLAutocompleteSchema();
    const tableNames = Object.keys(schema);

    return {
      schema,
      upperCaseKeywords: true,
      ...(tableNames.length === 1 ? { defaultTable: tableNames[0] } : {}),
    };
  }

  applySQLAutocomplete() {
    const editorManager = this.getEditorManager?.();
    const databaseSchema = this.getDatabaseSchema();

    editorManager?.setLanguageConfig?.(this.buildSQLAutocompleteConfig());
    editorManager?.setCompletionConfig?.({
      override: [createSQLCompletionSource(databaseSchema)],
      activateOnTyping: true,
      maxRenderedOptions: 200,
    });
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
    ]);

    this.getButtonManager().hideButton('run_spinner');

    const runButton = this.getButtonManager().getButton('runButton');
    runButton?.querySelector('.button-icon')?.remove();
    this.enforceSQLToolbarState();
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
      'page:hide:code',
      new H5P.PageHideObserver(
        this.getPageManager().getPage('code'),
        () => this.enforceSQLToolbarState(),
      ),
    );

    this.getObserverManager().register(
      'page:show:code',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('code'),
        () => this.enforceSQLToolbarState(),
      ),
    );
  }

  showCodePage() {
    super.showCodePage();
    this.enforceSQLToolbarState();
  }

  onHideCodePage() {
    this.clearPendingEditorFocus();
    this.enforceSQLToolbarState();
  }

  hideRunButton() {
    this.enforceSQLToolbarState();
  }

  showRunButton() {
    this.enforceSQLToolbarState();
  }

  hideCodeButton() {
    this.getButtonManager().hideButton('showCodeButton');
  }

  /**
   * Shows the temporary spinner while sqlite loads.
   * @returns {void}
   */
  showLoadingSpinner() {
    this.getButtonManager()?.showButton?.('run_spinner');
  }

  /**
   * Hides the temporary spinner once sqlite is ready.
   * @returns {void}
   */
  hideLoadingSpinner() {
    this.getButtonManager()?.hideButton?.('run_spinner');
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

    this.applySQLAutocomplete();
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
        </article>
      `);
    });

    this.databasePreviewBody.innerHTML = cards.join('');
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

  async buildResultMarkup(resultObject = [], resultTable = '') {
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

    const resultTableMarkup = resultTable
      ? await new H5P.Markdown(resultTable).getHTML()
      : '';

    return `
      <div class="sql-result-card ${metrics.hasRows ? 'sql-result-card-success' : 'sql-result-card-empty'}">
        <p class="sql-result-status">${status}</p>
        <p>${summary}</p>
      </div>
      ${resultTableMarkup}
    `;
  }

  async renderSQLResult(resultObject = [], resultTable = '') {
    const markup = await this.buildResultMarkup(resultObject, resultTable);
    if (this.resultPreviewBody) {
      this.resultPreviewBody.innerHTML = markup;
    }

    if (this.resultSection) {
      this.resultSection.hidden = false;
    }

    this.resizeActionHandler?.();
  }


  /**
   * Return mode for SQL
   * @returns {string} String: 'sql'
   */
  getMode() {
    return 'sql';
  }

}
