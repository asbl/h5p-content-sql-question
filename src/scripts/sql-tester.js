export default class SQLTester extends H5P.CodeTester {

  constructor(areaID, testSuite, targetTable) {
    super(areaID, testSuite);
    this.targetTable = targetTable;
    this.sqlConsoleID = `sql-console-${H5P.createUUID()}`;
    this.outputTableTableID = `h5p_output_table_${H5P.createUUID()}`;
    this.copyID = `copy_${H5P.createUUID()}`;
    this.l10n = {
      outputTableHeader: 'SQL Table',
      expectedTableHeader: 'Expected Table',
      copy: 'Copy'
    };
  }

  resultsToTable(outputArray) {
    let html = '';
    const table = AsciiTable.factory({
      heading: outputArray[0].columns
      , rows: outputArray[0].values
    });
    html = table.toString();
    return html;
  }
    
  updateTestCaseTable(testCaseNumber, outputArray) {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    let outputTable = this.resultsToTable(outputArray);
    let outputDiv = document.createElement('div');
    outputDiv.classList.add('console-column');
    let html = '';
    html = `<h4>${this.l10n.outputTableHeader}</h4>`;
    html += `<pre id="${this.outputTableTableID}"class="h5p sql-question output-table">` + outputTable + '</pre>';
    html += `<button id="${this.copyID}">${this.l10n.copy}</button`;
    // Add copy-button Listener
    outputDiv.innerHTML = html;
    let expectedDiv = document.createElement('div');
    expectedDiv.classList.add('console-column');
    let successClass = '';
    const success = this.checkTest(0, 0, outputArray);
    html = `<h4>${this.l10n.expectedTableHeader}</h4>`;
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
        function () {
          alert('Table copied to clipboard'); // success 
        })
        .catch(
          function () {
            alert('Error when copying the table to the clipboard.'); // error
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

  checkTest(testCaseNumber, testNumber, outputArray) {
    return (this.resultsToTable(outputArray).trim() === this.targetTable.trim());
  }

  onError(_errorMessage, _errorInstance) {
    let sqlConsole = document.getElementById(this.sqlConsoleID);
    sqlConsole.innerHTML = `<div class="error">ERROR: ${_errorMessage}</div>`;
  }

}