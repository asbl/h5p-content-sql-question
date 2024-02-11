import SQLRuntime from './sql-runtime';

/**
 * This runtime gets all Tables in the database.
 */
export default class SQLTablesRuntime extends SQLRuntime {

  constructor(question, options) {
    let code = 'SELECT name FROM sqlite_schema WHERE name NOT LIKE \'sqlite_%\'';
    super(question, code, options);
    this.tables = null;
    this.tablesMap = new Map();
  }

  /* Gets all Tables of the SQlite Database
  */
  onSuccess(results) {
    this.tables = results;
    const promises = [];
    results[0].values.forEach((table) => {
      promises.push(new Promise((resolve, reject) => {
        let code = `SELECT * FROM ${table[0]}`;
        this.prepare().then((db) => {
          const selectResult = db.exec(code);
          this.tablesMap.set(table[0], selectResult);
          resolve([table[0], selectResult[0]]);
        }).catch(reject);
      })); // end of new promise
    }); // end of forEach
    return Promise.all(promises);
  }
    
}
    

  
