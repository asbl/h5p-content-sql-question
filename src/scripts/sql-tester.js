export default class SQLTester extends H5P.CodeTester {

  constructor(codeQuestion, testSuite) {
    super(codeQuestion, testSuite);
    this.targetTable = '';
    this.solution = null;
    if (this.gradingMethod === 'ioTestCases') {
      this.targetTable = (this.question.params.gradingSettings.testCases !== undefined && this.question.params.gradingSettings.testCases[0][0] !== undefined) ? this.question.getDecodedCode(this.question.params.gradingSettings.testCases[0][0]) : '-';
    }
    this.solution = codeQuestion.solution;
    this.sqlConsoleID = `sql-console-${H5P.createUUID()}`;
    this.copyID = `copy_${H5P.createUUID()}`;
    this.resultsTableID = `h5p_output_table_${H5P.createUUID()}`;
    this.resultsTable = '';
  }

  _sqlToTable(sqlResult) {
    if (sqlResult[0] === undefined) {
      return '';
    }
    else {
      const table = AsciiTable.factory({
        heading: sqlResult[0].columns
        , rows: sqlResult[0].values
      });
      return table.toString().trim();    
    }
  }
  /**
   * Adds output to outputArray
   * @param {*} outputText 
   * @param sqlResult
   */
  addOutput(sqlResult) {
    this.outputArray[this.testCaseCounter].push(sqlResult[0]);
    this.resultsTable = this._sqlToTable(sqlResult);
  }

  generateTargetTable(sqlResult) {
    this.targetTable = this._sqlToTable(sqlResult);
  }

  updateTestCaseTable() {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    let outputDiv = document.createElement('div');
    outputDiv.classList.add('console-column');
    let html = '';
    html = `<h4>${this.l10n.testCase}</h4>`;
    html += `<pre id="${this.resultsTableTableID}"class="h5p sql-question output-table">` + this.resultsTable + '</pre>';
    html += `<button id="${this.copyID}">${this.l10n.copy}</button`;
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
    copybutton.onclick = () => {
      let tableCopy = this.resultsTable;
      navigator.clipboard.writeText(tableCopy).then(
        () => {
          alert(this.l10n.copySuccess); // success 
        });
    };
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

  onError(_errorMessage, _errorInstance) {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    sqlConsole.innerHTML = `<div class="error">ERROR: ${_errorMessage}</div>`;
  }



}