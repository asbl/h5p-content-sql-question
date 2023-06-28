export default class SQLQuestionFactory extends H5P.CodeQuestionFactory {
  /**
   * Returns Ace-Editor-Instance
   * @returns {H5P.SQLAce} The generated Editor
   */
  createEditor() {
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
    const targetTable = (this.question.params.testCases[0][0] !== undefined) ? this.question.getDecodedCode(this.question.params.testCases[0][0]) : 'empty';
    return new H5P.SQLTester(areaID, testSuite, targetTable);
  }
}