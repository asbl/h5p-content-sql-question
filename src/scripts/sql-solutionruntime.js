import SQLRuntime from './sql-runtime';

export default class SQLSolutionRuntime extends SQLRuntime {
  constructor(question, code, codeTester, options) {
    super(question, code, options);
    this.codeTester = codeTester;
    this.isTest = true;
  }

  async run() {
    this.setupEnvironment();
    await this._run();
  }
  // @TODO: Is this needed? Difference to parent: this._run isn't run with await.

  onSuccess(_resultObject, resultTable ) {
    super.onSuccess();
    this.codeTester.setTargetTable(resultTable);
    this.codeTester.updateTestCaseTable();
  }

  /**
   * Called when runtime Promise has an error.
   * @param {string} errorMessage The error
   */
  onError(errorMessage) {
    super.onError();
    try {
      const editorConsole = this.editor.getConsole();
      editorConsole.parentElement.style.display = 'block';
      editorConsole.innerHTML = errorMessage;
    }
    catch {
      console.info('error in solution', errorMessage);
    }
  }
  

}