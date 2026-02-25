import initSqlJs from 'sql.js';
import AsciiTable from 'ascii-table';

const sqlWasm = new URL('sql.js/dist/sql-wasm.wasm', import.meta.url);

/**
 * SQLRunner
 *
 * Runner for executing SQL code using sql.js.
 */
export default class SQLRunner {

  /**
   * @param {object} runtime
   *   Runtime instance controlling UI, state and callbacks.
   * @param {object} options
   * @param {string|null} [options.dbFile]
   * @param {string|null} [options.sqlPrepare]
   * @param {string|null} [options.solutionPrepare]
   */
  constructor(runtime, options = {}) {
    console.log('sqlrunner', runtime, options)
    this.runtime = runtime;
    this.options = options;
    this.dbFile = options.dbFile ?? null;
    this.sqlPrepare = options.sqlPrepare ?? null;
    this.solutionPrepare = options.solutionPrepare ?? null;
    this.SQL = null;
    this.db = null;

    this.stopped = false;
    this._initialized = false;

    this.tableFormat = options.tableFormat ?? 'ascii';
    this.maxRows = options.maxRows ?? 10; // show max. 10 lines

  }

  /**
   * Initializes sql.js runtime.
   * @returns {Promise<void>}
   */
  async setup() {
    if (this._initialized) return;

    this.SQL = await initSqlJs({
      locateFile: () => sqlWasm.href
    });

    this._initialized = true;
  }

  /**
   * Executes SQL code.
   * @param {string} code
   *   SQL code entered by the user.
   * @returns {Promise<void>}
   */
  async execute(code) {
    this.stopped = false;

    try {
      await this.setup();
      await this._prepareDatabase();

      if (this.stopped) return;
      const result = this.db.exec(code);
      const table = this._sqlToTable(result);
      await this.onSuccess(result, table);
    }
    catch (error) {
      await this.onError(error);
    }
    finally {
      this.runtime?.question?.trigger?.('resize');
    }
  }

  /**
   * Stops execution.
   * sql.js queries cannot be interrupted, so this is a soft stop.
   */
  stop() {
    this.stopped = true;
    this.db = null;
  }

  /**
   * Called when execution succeeded.
   * @param {Array} result The results as array provided by runner
   * @param {string} table The results as table provided by runner
   */
  async onSuccess(result, table) {
    await this.runtime.onSuccess?.(result, table);
  }

  /**
   * Called when execution failed.
   * @param {Error|string} error The error
   */
  async onError(error) {
    const message = error?.message ?? String(error);
    this.runtime.onError?.(message);
  }

  /**
   * Prepares the SQLite database.
   * @returns {Promise<void>}
   * @private
   */
  async _prepareDatabase() {
    if (this.db) return;
    if (this.dbFile) {
      const buffer = await fetch(this.dbFile).then((r) => r.arrayBuffer());
      this.db = new this.SQL.Database(new Uint8Array(buffer));
    }
    else {
      this.db = new this.SQL.Database();
      if (this.sqlPrepare) {
        this.db.run(this.sqlPrepare);
      }
    }
  }

  /**
   * Converts sql.js output to ASCII table.
   * Depends on `this.tableFormat`: ascii | Markdown | html
   *
   * @param {Array} sqlResult the SQL result as array
   * @returns {string} The table as string (Markdown, HTML, or ascii)
   * @private
   */
  _sqlToTable(sqlResult) {
    if (!sqlResult || !sqlResult[0]) return '';

    let { columns, values } = sqlResult[0];

    const truncated = this.maxRows > 0 && values.length > this.maxRows;
    if (truncated) values = values.slice(0, this.maxRows);

    let table;
    switch (this.tableFormat) {
      case 'markdown':
        table = this._toMarkdownTable(columns, values);
        break;
      case 'html':
        table = this._toHtmlTable(columns, values);
        break;
      case 'ascii':
      default:
        table = this._toAsciiTable(columns, values);
        break;
    }

    if (truncated) {
      table += `\n...(${values.length} von ${sqlResult[0].values.length} Zeilen angezeigt)`;
    }

    return table;
  }


  _toAsciiTable(columns, rows) {
    return AsciiTable
      .factory({
        heading: columns,
        rows
      })
      .toString()
      .trim();
  }

  _toMarkdownTable(columns, rows) {
    const escape = (v) => String(v ?? '');

    const header = `| ${columns.map(escape).join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map(
      (row) => `| ${row.map(escape).join(' | ')} |`
    );

    return [header, separator, ...body].join('\n');
  }

  _toHtmlTable(columns, rows) {
    const escape = (v) =>
      String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const thead = `
    <thead>
      <tr>
        ${columns.map((c) => `<th>${escape(c)}</th>`).join('')}
      </tr>
    </thead>`;

    const tbody = `
    <tbody>
      ${rows.map((row) => `
        <tr>
          ${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>`;

    return `<table>${thead}${tbody}</table>`;
  }



  /**
   * Returns all user-defined tables.
   * @returns {Promise<Array<[string, object]>>} Returns an  array with all tables
   */
  async getAllTables() {
    await this.setup();
    await this._prepareDatabase();

    const result = this.db.exec(
      'SELECT name FROM sqlite_schema WHERE name NOT LIKE \'sqlite_%\''
    );

    if (!result[0]) return [];

    return result[0].values.map(([name]) => {
      const rows = this.db.exec(`SELECT * FROM ${name}`);
      return [name, rows[0]];
    });
  }
}
