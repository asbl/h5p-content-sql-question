export default class SQLTester extends H5P.CodeTester {

  constructor(codeQuestion, testSuite, targetTable) {
    super(codeQuestion, testSuite);
    this.targetTable = targetTable;
    this.sqlConsoleID = `sql-console-${H5P.createUUID()}`;
    this.outputTableTableID = `h5p_output_table_${H5P.createUUID()}`;
    this.copyID = `copy_${H5P.createUUID()}`;
    /*
    this.l10n = {
      outputTableHeader: 'SQL Table',
      expectedTableHeader: 'Expected Table',
      copy: 'Copy'
    };
    */
  }

  addOutput(outputText) {
    this.outputArray[this.testCaseCounter].push(outputText[0]);
  }

  resultsToTable(outputArray) {
    let html = '';
    const table = AsciiTable.factory({
      heading: outputArray[0][0].columns
      , rows: outputArray[0][0].values
    });
    html = table.toString();
    return html;
  }
    
  updateTestCaseTable() {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    let outputTable = this.resultsToTable(this.outputArray);
    let outputDiv = document.createElement('div');
    outputDiv.classList.add('console-column');
    let html = '';
    html = `<h4>${this.l10n.testCase}</h4>`;
    html += `<pre id="${this.outputTableTableID}"class="h5p sql-question output-table">` + outputTable + '</pre>';
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
      let tableCopy = outputTable;
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
    return (this.resultsToTable(this.outputArray).trim() === this.targetTable.trim());
  }

  onError(_errorMessage, _errorInstance) {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    sqlConsole.innerHTML = `<div class="error">ERROR: ${_errorMessage}</div>`;
  }

  getTable() {
    const table = AsciiTable.factory({
      heading: this.outputArray[0][0].columns
      , rows: this.outputArray[0][0].values
    });
    return table;
  }

}