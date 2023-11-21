import SQLRuntime from './sql-runtime';

export default class SQLTestRuntime extends SQLRuntime {
  constructor(question, code, codeTester, options) {
    super(question, code, options);
    this.codeTester = codeTester;
    this.isTest = true;
  }

  async prepare() {
    const db = await super.prepare();
    if (this.solutionPrepare) {
      this.codeTester.setTargetTable(this._sqlToTable(db.exec(this.solutionPrepare)));
    }
    return db;
  }

  async run() {
    this.codeTester.startTest();
    this.setupEnvironment();
    this._run();
  }

  onSuccess(resultObject, resultTable ) {
    this.codeTester.addOutput(resultObject, resultTable);
    this.codeTester.updateTestCaseTable();
  }
  

}