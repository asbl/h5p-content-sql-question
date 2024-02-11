import SQLRuntime from './sql-runtime';

export default class SQLTestRuntime extends SQLRuntime {
  constructor(question, code, codeTester, options) {
    super(question, code, options);
    this.codeTester = codeTester;
    this.isTest = true;
  }

  async run() {
    this.codeTester.startTest();
    await super.run()
  }

  onSuccess(resultObject, resultTable ) {
    super.onSuccess();
    this.codeTester.addOutput(resultObject, resultTable);
    this.codeTester.updateTestCaseTable();
    this.question.evaluate();
    this.editor.hideConsole();
  }

  onError(errorMessage) {
    super.onError(errorMessage);
    this.editor.showConsole();
  }
  

}