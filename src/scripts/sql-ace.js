export default class SQLAce extends H5P.AceEditor {

  async setup() {
    await super.setup();
    this.getContainer().classList.add('sql-editor');
  }

  setupRuntime() {
    const editorConsole = this.getConsole();
    this.runtime.setConsole(editorConsole);
    if (this.consoleHidden) {
      editorConsole.parentElement.style.display = 'none';
    }
  }

  getMode() {
    return 'ace/mode/sql';
  }

  /**
   * Show all SQL pages
   */
  async setupPages() {
    await super.setupPages();
    try {
      const result = await this.runtime.getAllTables();
      this.tables = result;
      if (this.tables === undefined) {
        return;
      }
      let tableContent = '';
      for (const table of this.tables) {
        tableContent = AsciiTable.factory({
          heading: table[1].columns,
          rows: table[1].values,
        });
        this.addPage(
          table[0],
          '<pre class="h5p sql-question db-table">' + tableContent.toString() + '</pre>',
          'sql-table'
        );
        this.buttons.push({
          identifier: table[0],
          label: table[0],
          name: table[0],
          class: table[0],
          page: table[0],
          additionalClass: 'sql-table-button',
        });
        this.pages.push({ name: table[0] });
      }
    }
    catch (error) {
      console.error('Error fetching tables:', error);
      // Handle the error if needed
    }
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
        // if (this.getCode() !== '') {
        this.showPage('code');
        this.runtime.runTest(this.getCode());
        // }
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