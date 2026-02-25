import SQLRuntime from './runtime-sql';
import SQLTablesRuntimeSingle from './runtime-table-single';

/**
 * Runtime that retrieves all tables from the database.
 * Extends SQLRuntime and provides both raw results and a Map of tables.
 */
export default class SQLTablesAllRuntime extends SQLRuntime {

  /**
   * @param {object} question - H5P question instance
   * @param resizeActionHandler
   * @param codeContainer
   * @param {object} options - Optional runtime configuration
   */
  constructor(resizeActionHandler, codeContainer, options) {
    // SQL to get all user-defined tables
    const code = 'SELECT name FROM sqlite_schema WHERE name NOT LIKE \'sqlite_%\'';
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

    this.resultTables = new Map();

  }

  /**
   * Called when the runtime successfully retrieves the list of tables.
   * Populates this.tables and this.tablesMap with contents of each table.
   * @param {Array} results - SQL.js results array
   * @returns {Promise<Array>} Resolves when all table queries are complete
   */
  async onSuccess(results) {
    this.tables = results;
    const tablePromises = [];
    let options = this.options;
    if (!results[0] || !results[0].values) return Promise.resolve([]);

    for (const table of results[0].values) {
      const tableName = table[0];
      options.tableName = tableName;

      const tablesRuntime = new SQLTablesRuntimeSingle(
        () => this.resizeActionHandler(),
        this._codeContainer,
        options
      );

      tablesRuntime.setup();
      tablesRuntime.prepareForRun();
      await tablesRuntime.run();
      this.resultTables.set(tableName, tablesRuntime.resultTable);
    }


  }

  /**
   * Called when the runtime encounters an error.
   * @param {string} errorMessage - Error message string
   */
  onError(errorMessage) {
    super.onError(errorMessage);
    console.error('SQLTablesRuntime error:', errorMessage);
  }
}
