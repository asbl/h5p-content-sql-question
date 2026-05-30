import AsciiTable from 'ascii-table';
import { tSQLQuestion } from '../services/sqlquestion-l10n';
import { resetSharedSqlJsState, warmupSharedSqlJs } from './services/sqljs-runtime-service';
import {
  createSqlRuntimeError,
  createSqlRuntimeResult,
  formatSqlRuntimeError,
} from './sql-runtime-result';

/**
 * SQLRunner
 *
 * Runner for executing SQL code using sql.js.
 */
export default class SQLRunner {
  static warmup() {
    return warmupSharedSqlJs();
  }

  static resetSharedState() {
    resetSharedSqlJsState();
  }

  /**
   * @param {object} runtime
   *   Runtime instance controlling UI, state and callbacks.
   * @param {object} options
   * @param {string|null} [options.dbFile]
   * @param {string|null} [options.sqlFile]
   * @param {boolean} [options.cleanMySQLDump]
   * @param {string|null} [options.sqlPrepare]
   * @param {string|null} [options.solutionPrepare]
   */
  constructor(runtime, options = {}) {
    this.runtime = runtime;
    this.options = options;
    this.dbFile = options.dbFile ?? null;
    this.sqlFile = options.sqlFile ?? null;
    this.cleanMySQLDump = options.cleanMySQLDump === true;
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

    this.SQL = await warmupSharedSqlJs(this.options.sqlJsUrl);

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
    this.runtime?.codeContainer?.showLoadingSpinner?.();

    try {
      await this.setup();
      await this._prepareDatabase();
      this.runtime?.codeContainer?.hideLoadingSpinner?.();

      if (this.stopped) return;
      const result = this.db.exec(code);
      const table = this._sqlToTable(result);
      this.lastRuntimeResult = createSqlRuntimeResult({
        phase: 'execution',
        value: result,
        table,
      });
      await this.onSuccess(result, table);
    }
    catch (error) {
      await this.onError(createSqlRuntimeError({
        phase: 'execution',
        message: error?.message ?? String(error),
      }));
    }
    finally {
      this.runtime?.codeContainer?.hideLoadingSpinner?.();
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
    const message = formatSqlRuntimeError(error);
    this.runtime.onError?.(message);
  }

  /**
   * Prepares the SQLite database.
   * @returns {Promise<void>}
   * @private
   */
  async _prepareDatabase() {
    if (this.db) return;

    if (typeof this.options?.getDatabaseOptions === 'function') {
      const resolvedOptions = await this.options.getDatabaseOptions();
      this.dbFile = resolvedOptions?.dbFile ?? this.dbFile;
      this.sqlFile = resolvedOptions?.sqlFile ?? this.sqlFile;
      this.cleanMySQLDump = resolvedOptions?.cleanMySQLDump ?? this.cleanMySQLDump;
      this.sqlPrepare = resolvedOptions?.sqlPrepare ?? this.sqlPrepare;
      this.solutionPrepare = resolvedOptions?.solutionPrepare ?? this.solutionPrepare;
    }

    if (this.dbFile) {
      const response = await fetch(this.dbFile);
      if (!response.ok) {
        throw new Error(`Failed to load database file (${response.status}) from ${this.dbFile}`);
      }

      const contentType = response.headers?.get?.('content-type') || '';
      if (/text\/html/i.test(contentType)) {
        throw new Error(`Database URL returned HTML instead of SQLite binary: ${this.dbFile}`);
      }

      const buffer = await response.arrayBuffer();
      this.db = new this.SQL.Database(new Uint8Array(buffer));
    }
    else {
      this.db = new this.SQL.Database();
      if (this.sqlFile) {
        this.sqlPrepare = await this._loadSQLFile(this.sqlFile);
      }
      if (this.sqlPrepare) {
        this.db.run(this.sqlPrepare);
      }
    }
  }

  /**
   * Loads an SQL import file.
   * @param {string} sqlFile - URL of the uploaded SQL file.
   * @returns {Promise<string>} SQL code.
   * @private
   */
  async _loadSQLFile(sqlFile) {
    const response = await fetch(sqlFile);
    if (!response.ok) {
      throw new Error(`Failed to load SQL file (${response.status}) from ${sqlFile}`);
    }

    let sql = await response.text();
    if (this.cleanMySQLDump) {
      sql = this.cleanMySQLDumpSQL(sql);
    }

    return sql;
  }

  /**
   * Removes common MySQL dump syntax that SQLite cannot execute.
   * @param {string} sql - SQL dump content.
   * @returns {string} SQL suitable for sqlite import.
   */
  cleanMySQLDumpSQL(sql) {
    return String(sql ?? '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\/\*![\s\S]*?\*\//g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(--|#|DELIMITER\b)/i.test(line))
      .filter((line) => !/^\s*(SET|LOCK TABLES|UNLOCK TABLES|CREATE DATABASE|DROP DATABASE|USE)\b/i.test(line))
      .filter((line) => !/^\s*;\s*$/.test(line))
      .join('\n')
      .replace(/\bAUTO_INCREMENT\b/gi, '')
      .replace(/\bUNSIGNED\b/gi, '')
      .replace(/\bCHARACTER SET\s+\w+/gi, '')
      .replace(/\bCOLLATE\s+\w+/gi, '')
      .replace(/\s+ON UPDATE\s+CURRENT_TIMESTAMP(?:\(\))?/gi, '')
      .replace(/\)\s*ENGINE\s*=\s*\w+[^;]*;/gi, ');')
      .replace(/,\s*(?:KEY|INDEX|UNIQUE KEY|FULLTEXT KEY)\s+`?[\w-]+`?\s*\([^)]+\)/gi, '')
      .replace(/\bTINYINT\s*\(\s*\d+\s*\)/gi, 'INTEGER')
      .replace(/\b(?:SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\s*\(\s*\d+\s*\)/gi, 'INTEGER')
      .replace(/\b(?:VARCHAR|CHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT)\s*(?:\(\s*\d+\s*\))?/gi, 'TEXT')
      .replace(/\b(?:DATETIME|TIMESTAMP|DATE|TIME)\b/gi, 'TEXT')
      .replace(/\b(?:DOUBLE|FLOAT|DECIMAL|NUMERIC)\s*(?:\(\s*\d+\s*(?:,\s*\d+\s*)?\))?/gi, 'REAL')
      .replace(/\bENUM\s*\((?:[^'()]|'[^']*')*\)/gi, 'TEXT')
      .replace(/\bCOMMENT\s+'(?:[^']|'')*'/gi, '')
      .replace(/`/g, '"')
      .trim();
  }

  /**
   * Quotes a SQLite identifier such as a table name.
   * @param {string} identifier - Identifier to quote.
   * @returns {string} Quoted identifier.
   */
  quoteIdentifier(identifier) {
    return `"${String(identifier).replace(/"/g, '""')}"`;
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
      table += `\n${this.getTruncatedRowsLabel(values.length, sqlResult[0].values.length)}`;
    }

    return table;
  }

  /**
   * Returns a localized label for truncated SQL result sets.
   * @param {number} shownRows - Number of displayed rows.
   * @param {number} totalRows - Total number of rows.
   * @returns {string} Localized message.
   */
  getTruncatedRowsLabel(shownRows, totalRows) {
    return tSQLQuestion(this.options.l10n, 'sqlRowsDisplayed', {
      shown: shownRows,
      total: totalRows,
    });
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
      const rows = this.db.exec(`SELECT * FROM ${this.quoteIdentifier(name)}`);
      return [name, rows[0]];
    });
  }
}

SQLRunner.sharedSQL = null;
SQLRunner.sharedSetupPromise = null;
