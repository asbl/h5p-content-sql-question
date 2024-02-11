import AsciiTable from 'ascii-table';

export default class SQLAce extends H5P.AceEditor {

  async setup() {
    await super.setup();
    this.getContainer().classList.add('sql-editor');
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
      const runtime = this.question.factory.createTablesRuntime();
      await runtime.run();
      this.tables = runtime.tables;
      this.tablesMap = runtime.tablesMap;
      if (this.tables === undefined) {
        return;
      }
      let tableContent = '';
      for (const [table, tableData] of this.tablesMap) {
        tableContent = AsciiTable.factory({
          heading: tableData[0].columns,
          rows: tableData[0].values,
        });
        this.addPage(
          table,
          '<pre class="h5p sql-question db-table">' + tableContent.toString() + '</pre>',
          'sql-table'
        );
        this.buttons.push({
          identifier: table,
          label: table,
          name: table,
          class: table,
          page: table,
          additionalClass: 'sql-table-button',
        });
        this.pages.push({ name: table });
      }
    }
    catch (error) {
      console.error('Error fetching tables:', error);
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
        this.showPage('code');
        this.runAction();
      });
    }
  }

  runAction() {
    if (this.isCodingAssignment) {
      const runtime = this.question.factory.createTestRuntime(this.question.codeTester, this.getCode());
      runtime.reset();
      runtime.run(this.getCode());
    }
    else {
      const runtime = this.question.factory.createManualRuntime(this);
      runtime.reset();
      runtime.run(this.getCode());
      this.showConsole();
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