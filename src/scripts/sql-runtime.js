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
    const dataPromise = fetch(this.dbFile).then((res) => res.arrayBuffer());
    const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
    const db = new SQL.Database(new Uint8Array(buf));
    return db;
  }

  async runTest(code) {
    this.isTest = true;
    this.testCaseNumber = this.testCaseNumber + 1;
    this._run(code);
  }

  async _run(code) {
    const db = await this.prepare();
    const myPromise = new Promise((resolve, reject) => {
      try {
        const selectResult = db.exec(code);
        this.outputArray = selectResult;
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
    const table = AsciiTable.factory({
      heading: this.outputArray[0].columns
      , rows: this.outputArray[0].values
    });
    tableHTML = table.toString();
    const editorConsole = this.editor.getConsole();
    editorConsole.parentElement.style.display = 'block';
    editorConsole.innerHTML = '';
    editorConsole.innerHTML += tableHTML;
  }


}
