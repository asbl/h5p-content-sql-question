import SQLTablesAllRuntime from '../runtime/runtime-tables-all.sql';
import SQLRunner from '../runtime/sqlrunner';
import { createSQLCompletionSource } from '../services/sql-autocomplete';
import { analyzeSQLHints, buildSQLSchema } from '../services/sql-guidance';
import { getSQLQuestionL10nValue, tSQLQuestion } from '../services/sqlquestion-l10n';

const SQL_RESULT_INITIAL_ROWS = 10;
const SQL_RESULT_STEP_ROWS = 50;
const SQL_PREVIEW_OPEN_TABLES = 3;

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

  clearElement(element) {
    if (typeof element?.replaceChildren === 'function') {
      element.replaceChildren();
      return;
    }

    if (element) {
      element.innerHTML = '';
    }
  }

  appendSQLPreviewChild(parent, child) {
    if (typeof parent?.appendChild === 'function') {
      parent.appendChild(child);
      return;
    }

    if (parent && typeof parent.innerHTML === 'string') {
      const wrapper = document.createElement('div');
      wrapper.appendChild(child);
      parent.innerHTML += wrapper.innerHTML;
    }
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
    this.resultPreviewBody.setAttribute('role', 'status');
    this.resultPreviewBody.setAttribute('aria-live', 'polite');
    this.resultPreviewBody.setAttribute('aria-atomic', 'false');

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

  /**
   * Locates a SQLite error in the query: SQLite reports no line, but names the
   * offending token or identifier.
   * @param {{message: string}} executionError Normalized error.
   * @returns {{token: string}|null} Location.
   */
  getRuntimeErrorLocation(executionError) {
    const text = String(executionError?.message ?? '');
    const match = text.match(/near "([^"]+)": syntax error/i)
      || text.match(/no such (?:column|table|function):\s*([^\s\n]+)/i)
      || text.match(/ambiguous column name:\s*([^\s\n]+)/i);
    if (!match) {
      return null;
    }

    const name = match[1];
    return { token: name.includes('.') ? name.split('.').pop() : name };
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
    this.databaseTableSchemas = tablesRuntime.tableSchemas;

    this.applySQLAutocomplete();
    this.renderDatabasePreview();
  }

  renderDatabasePreview() {
    if (!this.databasePreviewBody) {
      return;
    }

    if (!(this.databaseTableResults instanceof Map) || this.databaseTableResults.size === 0) {
      this.clearElement(this.databasePreviewBody);
      const note = document.createElement('p');
      note.className = 'sql-preview-note';
      note.textContent = this.getLocalizedSQLLabel('sqlPreviewNoTables');
      this.appendSQLPreviewChild(this.databasePreviewBody, note);
      return;
    }

    this.clearElement(this.databasePreviewBody);
    let tableIndex = -1;
    this.databaseTableResults.forEach((tableResult, tableName) => {
      const table = Array.isArray(tableResult) ? tableResult[0] : tableResult;
      if (!table) {
        return;
      }

      tableIndex += 1;
      const columns = Array.isArray(table.columns) ? table.columns : [];

      const schemaInfo = this.databaseTableSchemas?.get?.(tableName) ?? { columns: [], foreignKeys: [] };
      const columnInfo = new Map(schemaInfo.columns.map((info) => [info.name, info]));
      const foreignKeys = new Map(schemaInfo.foreignKeys.map((key) => [key.from, key]));

      const card = document.createElement('details');
      card.className = 'sql-table-card';
      card.open = tableIndex < SQL_PREVIEW_OPEN_TABLES;

      const header = document.createElement('summary');
      header.className = 'sql-table-card-header';

      const title = document.createElement('h4');
      title.textContent = tableName;
      header.appendChild(title);

      const insertTable = document.createElement('button');
      insertTable.type = 'button';
      insertTable.className = 'sql-table-insert';
      insertTable.textContent = '+';
      insertTable.title = this.getLocalizedSQLLabel('sqlPreviewInsertTable', { name: tableName });
      insertTable.setAttribute?.('aria-label', insertTable.title);
      insertTable.addEventListener('click', (event) => {
        event.preventDefault();
        this.insertIntoEditor(this.quoteSQLIdentifierIfNeeded(tableName));
      });
      header.appendChild(insertTable);

      const meta = document.createElement('p');
      meta.textContent = this.getLocalizedSQLLabel('sqlPreviewTableMeta', {
        columns: columns.length,
        rows: Array.isArray(table.values) ? table.values.length : 0,
      });
      header.appendChild(meta);
      card.appendChild(header);

      const chipList = document.createElement('div');
      chipList.className = 'sql-column-chip-list';
      columns.forEach((column) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sql-column-chip';
        chip.textContent = column;
        chip.title = this.getLocalizedSQLLabel('sqlPreviewInsertColumn', { name: column });
        this.decorateColumnChip(chip, column, columnInfo.get(column), foreignKeys.get(column));
        chip.addEventListener('click', () => this.insertIntoEditor(this.quoteSQLIdentifierIfNeeded(column)));
        chipList.appendChild(chip);
      });
      card.appendChild(chipList);

      if (Array.isArray(table.values) && table.values.length > 0) {
        card.appendChild(this.buildSampleRows(table));
      }

      this.appendSQLPreviewChild(this.databasePreviewBody, card);
    });
  }

  /**
   * Adds type and key information to a column chip.
   * @param {HTMLElement} chip Column button.
   * @param {string} column Column name.
   * @param {{type?: string, pk?: number}|undefined} info Column details.
   * @param {{table: string, to: string}|undefined} foreignKey Foreign key of the column.
   * @returns {void}
   */
  decorateColumnChip(chip, column, info, foreignKey) {
    const details = [];
    const append = (className, text, description) => {
      const badge = document.createElement('span');
      badge.className = `sql-column-badge ${className}`;
      badge.textContent = text;
      chip.appendChild(badge);
      details.push(description ?? text);
    };

    if (info?.type) {
      append('sql-column-type', String(info.type).toLowerCase());
    }

    if (Number(info?.pk) > 0) {
      chip.classList.add('is-primary-key');
      append('sql-column-key', 'PK', this.getLocalizedSQLLabel('sqlPreviewPrimaryKey'));
    }

    if (foreignKey) {
      chip.classList.add('is-foreign-key');
      const target = `${foreignKey.table}${foreignKey.to ? `.${foreignKey.to}` : ''}`;
      append('sql-column-key', `FK → ${target}`, this.getLocalizedSQLLabel('sqlPreviewForeignKey', { target }));
    }

    if (details.length > 0) {
      chip.setAttribute?.('aria-label', `${this.getLocalizedSQLLabel('sqlPreviewInsertColumn', { name: column })} (${details.join(', ')})`);
    }
  }

  /**
   * Builds an expandable preview with the first rows of a table. The rows are
   * only created when the learner opens it.
   * @param {{columns: string[], values: Array<Array>}} table Table payload.
   * @returns {HTMLElement} Details element.
   */
  buildSampleRows(table) {
    const details = document.createElement('details');
    details.className = 'sql-table-sample';

    const summary = document.createElement('summary');
    summary.textContent = this.getLocalizedSQLLabel('sqlPreviewSampleRows', { count: Math.min(3, table.values.length) });
    details.appendChild(summary);

    details.addEventListener('toggle', () => {
      if (!details.open || details.querySelector('table')) {
        return;
      }

      const wrapper = this.buildResultTable({
        columns: table.columns,
        values: table.values.slice(0, 3),
      });
      details.appendChild(wrapper);
      this.resizeActionHandler?.();
    });

    return details;
  }

  /**
   * Quotes an identifier if it is not a plain SQL name.
   * @param {string} identifier Column or table name.
   * @returns {string} Identifier safe to insert into a query.
   */
  quoteSQLIdentifierIfNeeded(identifier) {
    const name = String(identifier);
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  }

  /**
   * Inserts text at the cursor of the active editor and focuses it.
   * @param {string} text Text to insert.
   */
  insertIntoEditor(text) {
    const editor = this.getEditorManager?.()?.getActiveEditorInstance?.();
    const view = editor?.editorView;
    if (!view?.state || typeof view.dispatch !== 'function') {
      return;
    }

    const selection = view.state.selection.main;
    const doc = view.state.doc;
    // A cursor that never left the start of a non-empty query means the learner
    // has not placed it yet, so the text is appended instead of prepended.
    const untouched = selection.empty && selection.from === 0 && doc.length > 0;
    const from = untouched ? doc.length : selection.from;
    const to = untouched ? doc.length : selection.to;
    const needsSpace = untouched && !/\s$/.test(doc.toString());
    const insert = needsSpace ? ` ${text}` : text;

    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      scrollIntoView: true,
    });
    view.focus?.();
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

  /**
   * Builds the result view: a neutral status line, row/column counts and the
   * result sets as real tables. Large results are shown stepwise.
   * @param {Array} resultObject Result sets as provided by sql.js.
   * @param {string} resultTable Fallback table text (used if no structured result is available).
   * @param {object} [info] Additional execution info.
   * @param {number} [info.rowsModified] Rows changed by INSERT/UPDATE/DELETE.
   * @returns {Promise<DocumentFragment>} Rendered result.
   */
  async buildResultFragment(resultObject = [], resultTable = '', info = {}) {
    const metrics = this.getResultMetrics(resultObject);
    const fragment = document.createDocumentFragment();
    const card = document.createElement('div');

    if (!metrics.hasColumns) {
      card.className = 'sql-result-card sql-result-card-empty';

      const rowsModified = Number(info?.rowsModified);
      const changed = Number.isFinite(rowsModified) && rowsModified > 0;

      const statusElement = document.createElement('p');
      statusElement.className = 'sql-result-status';
      statusElement.textContent = this.getLocalizedSQLLabel(changed ? 'sqlResultModifiedTitle' : 'sqlResultEmptyTitle');
      card.appendChild(statusElement);

      const description = document.createElement('p');
      description.textContent = changed
        ? this.getLocalizedSQLLabel('sqlResultModifiedDescription', { rows: rowsModified })
        : this.getLocalizedSQLLabel('sqlResultEmptyDescription');
      card.appendChild(description);

      fragment.appendChild(card);
      return fragment;
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

    card.className = `sql-result-card ${metrics.hasRows ? 'sql-result-card-success' : 'sql-result-card-empty'}`;

    const statusElement = document.createElement('p');
    statusElement.className = 'sql-result-status';
    statusElement.textContent = status;
    card.appendChild(statusElement);

    const summaryElement = document.createElement('p');
    summaryElement.textContent = summary;
    card.appendChild(summaryElement);
    fragment.appendChild(card);

    const resultSets = (Array.isArray(resultObject) ? resultObject : [])
      .filter((set) => Array.isArray(set?.columns) && set.columns.length > 0);

    if (resultSets.length > 0) {
      resultSets.forEach((set) => fragment.appendChild(this.buildResultTable(set)));
    }
    else if (resultTable) {
      const markdown = new H5P.Markdown(resultTable);
      const markdownElement = typeof markdown.getMarkdownDiv === 'function'
        ? await markdown.getMarkdownDiv()
        : document.createElement('div');

      if (typeof markdown.getMarkdownDiv !== 'function') {
        markdownElement.innerHTML = await markdown.getHTML();
      }

      fragment.appendChild(markdownElement);
    }

    return fragment;
  }

  /**
   * Builds a DOM table for one result set with a row-count caption.
   * Shows the first rows only and offers to reveal more.
   * @param {{columns: string[], values: Array<Array>}} set Result set.
   * @returns {HTMLElement} Wrapper element.
   */
  buildResultTable(set) {
    const rows = Array.isArray(set.values) ? set.values : [];
    let shown = Math.min(rows.length, SQL_RESULT_INITIAL_ROWS);

    const wrapper = document.createElement('div');
    wrapper.className = 'sql-result-table-wrapper';

    const scroll = document.createElement('div');
    scroll.className = 'sql-result-table-scroll';
    const table = document.createElement('table');
    table.className = 'sql-result-table';

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    set.columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = String(column);
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    table.appendChild(body);
    scroll.appendChild(table);
    wrapper.appendChild(scroll);

    const caption = document.createElement('p');
    caption.className = 'sql-result-caption';
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'sql-result-more';
    wrapper.appendChild(caption);
    wrapper.appendChild(more);

    let rendered = 0;
    const update = () => {
      for (; rendered < shown; rendered++) {
        const tr = document.createElement('tr');
        rows[rendered].forEach((value) => {
          const td = document.createElement('td');
          td.textContent = value === null || value === undefined ? 'NULL' : String(value);
          if (value === null || value === undefined) {
            td.className = 'sql-result-null';
          }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      }

      const complete = shown >= rows.length;
      caption.hidden = complete;
      more.hidden = complete;
      caption.textContent = this.getLocalizedSQLLabel('sqlResultRowsShown', { shown, total: rows.length });
      const remaining = rows.length - shown;
      more.textContent = remaining > SQL_RESULT_STEP_ROWS
        ? this.getLocalizedSQLLabel('sqlResultShowMore', { count: SQL_RESULT_STEP_ROWS })
        : this.getLocalizedSQLLabel('sqlResultShowAll', { count: remaining });
    };

    more.addEventListener('click', () => {
      const remaining = rows.length - shown;
      shown = remaining > SQL_RESULT_STEP_ROWS ? shown + SQL_RESULT_STEP_ROWS : rows.length;
      update();
      this.resizeActionHandler?.();
    });

    update();
    return wrapper;
  }

  async buildResultMarkup(resultObject = [], resultTable = '', info = {}) {
    const container = document.createElement('div');
    container.appendChild(await this.buildResultFragment(resultObject, resultTable, info));
    return container.innerHTML;
  }

  async renderSQLResult(resultObject = [], resultTable = '', info = {}) {
    if (this.resultPreviewBody) {
      this.clearElement(this.resultPreviewBody);
      this.appendSQLPreviewChild(
        this.resultPreviewBody,
        await this.buildResultFragment(resultObject, resultTable, info),
      );
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
