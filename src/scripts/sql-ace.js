export default class SQLAce extends H5P.CodeQuestionAce {

  getMode() {
    return 'ace/mode/sql';
  }

  /**
   * Show all SQL pages
   */
  setupPages() {
    this.runtime.getAllTables().then((result) => { 
      this.tables = result;
      let tableContent = '';
      this.tables.forEach((table) => {
        tableContent = AsciiTable.factory({
          heading: table[1].columns
          , rows: table[1].values
        });
        this.addPage(table[0], '<pre class="h5p sql-question db-table">' + tableContent.toString() + '</pre>', 'sql-table');
        this.buttons.push({
          identifier: table[0],
          label: table[0],
          name: table[0],
          class: table[0],
          page: table[0],
          additionalClass: 'sql-table-button',
        });
        this.pages.push({ name: table[0], });
      });
      this.reloadButtons(); 
    });
    this.showPage('code'); // Show code page; Hide other pages
  }

  /**
   * Add Listener for Run-Button - Always Run SQL Code as Test
   * @protected
   */
  _addRunListener() {
    const container = this.getContainer();
    const runButton = container.getElementsByClassName('run_code')[0];
    if (runButton && !runButton.isInitialized) {
      runButton.isInitialized = true;
      runButton.addEventListener('click', () => {
        this.showPage('code');
        this.runtime.resetTest();
        this.runtime.run_test(this.getCode());
      });
    }
  }

  onError() {
    let console = this.editor.getConsole();
    let html = '<div class="error"><h2>Error!</h2>';
    html += this.runtime.errorMessage;
    html += '</div>';
    console.innerHTML = html;
    this.setFeedback('You habe an error in line in your sql-syntax', this.getScore(), this.getMaxScore(), 'Score');
  }

  showPage(pageName) {
    super.showPage(pageName);
    const container = this.getContainer().parentElement.parentElement;
    const testCasesArea = container.getElementsByClassName('testcases-area')[0];
    if (testCasesArea) {
      if (pageName !== 'code') {
        testCasesArea.style.display = 'none';
      }
      else {
        testCasesArea.style.display = 'block';
      }
    }
    
  }
    
}