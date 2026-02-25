import SQLRuntime from './runtime-sql';

/**
 * Runtime that retrieves all tables from the database.
 * Extends SQLRuntime and provides both raw results and a Map of tables.
 */
export default class SQLTablesRuntimeSingle extends SQLRuntime {

  /**
   * @param resizeActionHandler
   * @param codeContainer
   * @param {object} options - Optional runtime configuration
   */
  constructor(resizeActionHandler, codeContainer, options) {
    // SQL to get all user-defined tables
    const code = 'SELECT * FROM ' + options.tableName;
    super(resizeActionHandler, code, options);

    this.code = code;
    /**
     * Array of table info results from SQL.js
     * @type {Array|null}
     */
    this.tables = null;

    /**
     * Map from table name -> table contents
     * @type {Map<string, object>}
     */
    this.tablesMap = new Map();

    this._codeContainer = codeContainer;
  }

  /**
   * Called when the runtime successfully retrieves the list of tables.
   * Populates this.tables and this.tablesMap with contents of each table.
   * @param {Array} results - SQL.js results array
   * @param resultTable
   * @returns {Promise<Array>} Resolves when all table queries are complete
   */
  onSuccess(results, resultTable) {
    this.resultTable = resultTable;

  }

  /**
   * Called when the runtime encounters an error.
   * @param {string} errorMessage - Error message string
   */
  onError(errorMessage) {
    console.error('SQLTablesRuntime error:', errorMessage);
  }
}
