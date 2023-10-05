/**
 * Draws ace-editor Widget on a div
 */
export default class SQLRuntime extends H5P.Runtime {

  constructor(question, options) {
    super(question);
    this.isTest = true;
    this.dbFile = options.dbFile;
    this.sqlPrepare = options.sqlPrepare; // String with sql commands to prepare database
    this.solutionPrepare = options.solutionPrepare; // String with sql commands to generate output Table
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
    console.info('prepare solution', this.solutionPrepare);
    if (this.solutionPrepare) {
      this.codeTester.generateTargetTable(db.exec(this.solutionPrepare));
    }
    return db;
  }

  async runTest(code) {
    this.isTest = true;
    this.codeTester.reset();
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
    const outputHTML = this.codeTester.getOutput();
    const editorConsole = this.editor.getConsole();
    editorConsole.parentElement.style.display = 'block';
    editorConsole.innerHTML = outputHTML;
  }


}