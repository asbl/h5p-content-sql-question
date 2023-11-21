export default class SQLQuestionFactory extends H5P.CodeQuestionFactory {
  /**
   * Returns Ace-Editor-Instance
   * @param {HTMLElement} parent parentDiv-Element
   * @param {string} code code as String (optional)
   * @param isAssignment
   * @returns {H5P.SQLAce} The generated Editor
   */
  createEditor(parent, code, isAssignment = false) {
    if (isAssignment) {
      return new H5P.SQLAce(this.question.editorParent, {
        code: code,
        hasButtons: true,
        hasConsole: false,
        height: 5,
        preCode: null,
        postCode: null,
        consoleType: 'div',
        language: 'sql',
        modifyEditor: this.modifyEditor,
        l10n : this.question.l10n,
        question: this.question
      });
    }
    else {
      return new H5P.SQLAce(parent, {
        code: code,
        fixedSize : false,
        consoleHidden : true,
        hasButtons: true,
        evaluation: false,
        l10n : this.question.l10n,
        question: this.question
      });
    }
  }
    
  /**
   * Creates a new Runtime
   * @param {string} code Code to execute
   * @returns  {H5P.SQLRuntime} The generated Runtime
   */
  createRuntime(code) {
    return new H5P.SQLRuntime(this.question, code, {
      dbFile: this.question.dbFilePath,
      sqlPrepare: this.question.getDecodedCode(this.question.sqlPrepare),
      saveOutput: true,
      solutionPrepare: this.question.getDecodedCode(this.question.solutionPrepare)
    });
  }

  /**
   * Creates a new Test-Runtime
   * @param codeTester
   * @param {string} code Code to execute
   * @returns  {H5P.SQLTestRuntime} The generated Runtime
   */
  createTestRuntime(codeTester, code) {
    return new H5P.SQLTestRuntime(this.question, code, codeTester, {
      dbFile: this.question.dbFilePath,
      sqlPrepare: this.question.getDecodedCode(this.question.sqlPrepare),
      saveOutput: true,
      solutionPrepare: this.question.getDecodedCode(this.question.solutionPrepare)
    });
  }

  /**
   * Creates a new Manual-Runtime
   * @param codeTester
   * @param {string} code Code to execute
   * @param editor
   * @returns  {H5P.SQLTestRuntime} The generated Runtime
   */
  createManualRuntime(code, editor) {
    return new H5P.SQLManualRuntime(this.question, code, editor, {
      dbFile: this.question.dbFilePath,
      sqlPrepare: this.question.getDecodedCode(this.question.sqlPrepare),
      saveOutput: true,
    });
  }


  /**
   * Creates a Tester-object
   * @param {Array} testSuite An array with all testCases
   * @returns {H5P.SQLTester} The SQLTester-Object
   */
  createCodeTester(testSuite) {
    return new H5P.SQLTester(this.question, testSuite);
  }

}