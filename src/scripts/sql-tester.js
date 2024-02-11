export default class SQLTester extends H5P.CodeTester {

  /**
   * Logic for testing sql questions
   * 
   * The code is compared to `this.targetTable` which could'be be
   * generated manually by `questiontestCases` or by solution (via SolutionRuntime) 
   * 
   * @param {*} codeQuestion 
   * @param {*} testSuite 
   */
  constructor(codeQuestion, testSuite) {
    super(codeQuestion, testSuite);
    this.question = codeQuestion;
    this.solution = null;
    this.targetTable = (this.question.params.gradingSettings.testCases !== undefined && this.question.params.gradingSettings.testCases[0][0] !== undefined) ? this.question.getDecodedCode(this.question.params.gradingSettings.testCases[0][0]) : '-';
    this.solution = codeQuestion.solution;
    this.solution = codeQuestion.solution;
    this.sqlConsoleID = `sql-console-${H5P.createUUID()}`;
    this.copyID = `copy_${H5P.createUUID()}`;
    this.resultsTableID = `h5p_output_table_${H5P.createUUID()}`;
    this.resultsTable = '';

  }

  getScore() {
    if (this.checkTestCase(0)) {
      return 1;
    }
    else {
      return 0;
    }
  }
  
  setTargetTable(table) {
    this.targetTable = table;
  }
  /**
   * Adds output to outputArray
   * @param {*} sqlResult Result of a sql query
   * @param {string} sqlAsciiTable
   */
  addOutput(sqlResult, sqlAsciiTable) {
    this.outputArray[this.testCaseCounter].push(sqlResult[0]);
    this.resultsTable = sqlAsciiTable;
  }

  updateTestCaseTable() {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    let outputDiv = document.createElement('div');
    outputDiv.classList.add('console-column');
    let html = '';
    html = `<h4>${this.l10n.testCase}</h4>`;
    html += `<pre id="${this.resultsTableTableID}"class="h5p sql-question output-table">` + this.resultsTable + '</pre>';
    if (this.resultsTable !== '') {
      // add copy button
      html += `<button id="${this.copyID}">${this.l10n.copy}</button`;
    }
    // Add copy-button Listener
    outputDiv.innerHTML = html;
    let expectedDiv = document.createElement('div');
    expectedDiv.classList.add('console-column');
    let successClass = '';
    const success = this.checkTestCase(0);
    html = `<h4>${this.l10n.expectedOutput}</h4>`;
    if (success) {
      successClass = 'match';
    }
    else {
      successClass = 'no-match';
    }
    html += `<pre class="h5p ${successClass} sql-question db-table">` + this.targetTable + '</pre>';
    if (success) {
      html += '\n ✓';
    }
    expectedDiv.innerHTML = html;
    sqlConsole.innerHTML = '';
    sqlConsole.appendChild(outputDiv);
    sqlConsole.appendChild(expectedDiv);
    const copybutton = document.getElementById(this.copyID);
    if (copybutton) {
      copybutton.onclick = () => {
        let tableCopy = this.resultsTable;
        navigator.clipboard.writeText(tableCopy).then(
          () => {
            alert(this.l10n.copySuccess); // success 
          });
      };
    }

  }
      
  generateTestCasesArea() {
    const testCasesArea = super.generateTestCasesArea();
    testCasesArea.classList.add('testCasesTable');
    const html = `<div id="${this.sqlConsoleID}" class="sql-console"></div>`;
    testCasesArea.innerHTML = html;
    return testCasesArea;
  }

  checkTestCase(testCaseNumber = -1) {
    return this.resultsTable === this.targetTable.trim();
  }

}