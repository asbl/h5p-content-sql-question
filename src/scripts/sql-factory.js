import SQLSolutionRuntime from './sql-solutionruntime';

export default class SQLQuestionFactory extends H5P.CodeQuestionFactory {
  /**
   * Returns Ace-Editor-Instance
   * @param {HTMLElement} parent parentDiv-Element
   * @param {string} code code as String (optional)
   * @param {boolean} isAssignment is the editor a coding assignment-editor?
   * @returns {H5P.SQLAce} The generated Editor
   */
  createEditor(parent, code, isAssignment = false) {
    if (isAssignment) {
      return new H5P.SQLAce(parent, {
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
        question: this.question,
        isAssignment: true
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
        question: this.question,
        isAssignment: false
      });
    }
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
   * @param editor
   * @returns  {H5P.SQLTestRuntime} The generated Runtime
   */
  createManualRuntime(editor) {
    return new H5P.SQLManualRuntime(this.question, editor, {
      dbFile: this.question.dbFilePath,
      sqlPrepare: this.question.getDecodedCode(this.question.sqlPrepare),
      saveOutput: true,
    });
  }

  /**
   * Creates a new Tables-Runtime
   * @returns  {H5P.SQLTestRuntime} The generated Runtime
   */
  createTablesRuntime() {
    return new H5P.SQLTablesRuntime(this.question, {
      dbFile: this.question.dbFilePath,
      sqlPrepare: this.question.getDecodedCode(this.question.sqlPrepare),
      saveOutput: true,
    });
  }

  /**
   * Creates a new Solution-Runtime
   * @param {string} code Code to execute
   * @param codeTester A CodeTester Instance
   * @returns {SQLSolutionRuntime} A SolutionRuntime to generate the solution code
   */
  createSolutionuntime(codeTester, code) {
    return new H5P.SQLSolutionRuntime(this.question, code, codeTester, {
      dbFile: this.question.dbFilePath,
      sqlPrepare: this.question.getDecodedCode(this.question.sqlPrepare),
      saveOutput: true,
      solutionPrepare: this.question.getDecodedCode(this.question.solutionPrepare)
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