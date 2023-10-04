/**
 * Draws ace-editor Widget on a div
 */
export default class SQLRuntime extends H5P.Runtime {

  constructor(question, options) {
    super(question);
    this.isTest = true;
    this.testCaseNumber = -1;
    this.test = options.test;
    this.testNumber = options.testNumber;
    this.options = options || {};
    this.dbFile = options.dbFile;
    this.sqlPrepare = options.sqlPrepare;
    this.console = options.console || null;
  }

  async prepare() {
    const sqlPromise = await initSqlJs({
      // Required to load the wasm binary asynchronously. 
      // Loads ../lib/sql-asm.wasm
      locateFile: (file) => {
        '../lib/' + file;  
      }
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

  async runTest(code) {
    this.isTest = true;
    this.codeTester.reset();
    this.testCaseNumber = this.testCaseNumber + 1;
    this._run(code);
  }

  async _run(code) {
    const db = await this.prepare();
    const myPromise = new Promise((resolve, reject) => {
      try {
        const selectResult = db.exec(code);
        this.codeTester.addOutput(selectResult);
        resolve();
      }
      catch (error) {
        this.errorMessage = error.message;
        reject(this.errorMessage);
      }
    });
    return myPromise.then(() => {
      this.onSuccess(); 
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
    if (this.isTest === true) {
      this.codeTester.onError(errorMessage);
      this.notifyError(errorMessage);
    }
    else {
      this.editor.getConsole().value = errorMessage;
      this.editor.getConsole().style.display = 'block';
    }

  }


  /**
   * Called, wehen user performed a manual run.
   */
  onSuccessManualRun() {
    let tableHTML = '';
    const table = this.codeTester.getTable();
    tableHTML = table.toString();
    const editorConsole = this.editor.getConsole();
    editorConsole.parentElement.style.display = 'block';
    editorConsole.innerHTML = '';
    editorConsole.innerHTML += tableHTML;
  }


}
