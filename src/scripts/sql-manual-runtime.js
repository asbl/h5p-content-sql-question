import SQLRuntime from './sql-runtime';

export default class SQLManualRuntime extends SQLRuntime {
  constructor(question, code, editor, options) {
    super(question, code, options);
    this.editor = editor;
    this.isTest = false;
  }

  async run() {
    this.setupEnvironment();
    this._run();
  }

  onSuccess(_resultObject, resultTable) {
    this.editor.getConsole().value = resultTable;
  }
  

}