import initSqlJs from 'sql.js';
import AsciiTable from 'ascii-table';

const sqlWasm = new URL('sql.js/dist/sql-wasm.wasm', import.meta.url);

/**
 * Draws ace-editor Widget on a div
 */
export default class SQLRuntime extends H5P.Runtime {

  constructor(question, code, options) {
    super(question);
    this.code = code;
    this.dbFile = options.dbFile;
    this.sqlPrepare = options.sqlPrepare; // String with sql commands to prepare database
    this.solutionPrepare = options.solutionPrepare; // String with sql commands to generate output Table
  }

  async prepare() {
    const sqlPromise = await initSqlJs({
      // Required to load the wasm binary asynchronously. 
      // Loads ../lib/sql-asm.wasm
      locateFile: () => sqlWasm.href
      
    });
    let db = null;
    if (this.dbFile) {
      const dataPromise = fetch(this.dbFile).then((res) => res.arrayBuffer());
      let [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
      db = new SQL.Database(new Uint8Array(buf));
    }
    else {
      let SQL = await Promise.resolve(sqlPromise);
      db = new SQL.Database();
      if (this.sqlPrepare) {
        db.run(this.sqlPrepare);
      }
    }
    return db;
  }

  async run() {
    this.setupEnvironment();
    await this._run();
  }

  setupEnvironment() {
  }

  async _run() {
    console.info('run,', this.code);
    const db = await this.prepare();
    const myPromise = new Promise((resolve, reject) => {
      try {
        const selectResult = db.exec(this.code);
        resolve(selectResult);
      }
      catch (error) {
        this.errorMessage = error.message;
        reject(this.errorMessage);
      }
    });
    return myPromise.then((result) => {
      this.onSuccess(result, this._sqlToTable(result)); 
    }).catch((error) => {
      this.onError(error);
    }).finally(() => {
      this.question.trigger('resize');
    });
  }

  /* Gets all Tables of the SQlite Database
  */
  async getAllTables() {
    let code = 'SELECT name FROM sqlite_schema WHERE name NOT LIKE \'sqlite_%\'';
    const db = await this.prepare();
    const selectPromise = new Promise((resolve, reject) => {
      try {
        const selectResult = db.exec(code);
        resolve(selectResult);
      }
      catch (error) {
        this.errorMessage = error.message;
        reject();
      }
    });
    
    let allTablesPromise = selectPromise.then((results) => {
      let promises = [];
      if (results[0] === undefined) {
        return;
      }
      results[0].values.forEach((table) => {
        promises.push(new Promise((resolve, reject) => {
          let code = `SELECT * FROM ${table[0]}`;
          this.prepare().then((db) => {
            const selectResult = db.exec(code);
            resolve([table[0], selectResult[0]]);
          }).catch(reject);
        }));
      });
      return Promise.all(promises);
    });
    return allTablesPromise;
  }
  
  /**
   * Called when runtime Promise has an error.
   * @param {string} errorMessage The error
   */
  onError(errorMessage) {
    try {
      const editorConsole = this.editor.getConsole();
      editorConsole.parentElement.style.display = 'block';
      editorConsole.innerHTML = errorMessage;
    }
    catch {
      console.info(errorMessage);
    }
  }

  onSuccess(_result) {
  }

  _sqlToTable(sqlResult) {
    if (sqlResult[0] === undefined) {
      return '';
    }
    else {
      const table = AsciiTable.factory({
        heading: sqlResult[0].columns
        , rows: sqlResult[0].values
      });
      return table.toString().trim();    
    }
  }

}

