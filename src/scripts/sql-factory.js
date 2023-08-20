export default class SQLQuestionFactory extends H5P.CodeQuestionFactory {
  /**
   * Returns Ace-Editor-Instance
   * @param {HTMLElement} parent parentDiv-Element
   * @param {string} code code as String (optional)
   * @returns {H5P.SQLAce} The generated Editor
   */
  createEditor(parent, code) {
    if (!code) {
      return new H5P.SQLAce(this.question.editorParent, {
        code: this.question.defaultCode,
        hasButtons: true,
        hasConsole: false,
        height: 5,
        preCode: null,
        postCode: null,
        consoleType: 'div',
        language: 'sql',
        modifyEditor: this.modifyEditor
      });
    }
    else {
      return new H5P.SQLAce(parent, {
        code: code,
        fixedSize : false,
        consoleHidden : true,
        hasButtons: true,
        evaluation: false,
      });
    }
  }
    
  /**
   * Creates a new Runtime
   * @returns  {H5P.SQLRuntime} The generated Runtime
   */
  createRuntime() {
    const path = this.question.dbFilePath;   
    return new H5P.SQLRuntime(this.question, {
      dbFile: path,
      saveOutput: true,
    });
  }
  /**
   * Creates a Tester-object
   * @param {string} areaID The area of the testCases
   * @param {Array} testSuite An array with all testCases
   * @returns {H5P.PythonTester} The PythonTester-Object
   */
  createCodeTester(areaID, testSuite) {
    const targetTable = (this.question.params.gradingSettings.testCases[0][0] !== undefined) ? this.question.getDecodedCode(this.question.params.gradingSettings.testCases[0][0]) : 'empty';
    return new H5P.SQLTester(areaID, testSuite, targetTable);
  }

  createEditorWithRuntime(parentDiv, code) {
    const runtimeEditor = super.createEditorWithRuntime(parentDiv, code);
    const editor = runtimeEditor[0];
    const runtime = runtimeEditor[1];
    runtime.isTest = false;
    return [editor, runtime];
    
  }

}