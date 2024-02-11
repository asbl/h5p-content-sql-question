import SQLRuntime from './sql-runtime';

export default class SQLManualRuntime extends SQLRuntime {
  constructor(question, editor, options) {
    const code = editor.getCode();
    super(question, code, options);
    this.editor = editor;
    this.isTest = false;
  }

  async run() {
    this.setupEnvironment();
    this._run();
  }

  onSuccess(_resultObject, resultTable) {
    super.onSuccess();
    this.editor.getConsole().value = resultTable;
    this.editor.showConsole();
  }
}