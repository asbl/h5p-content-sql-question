import SQLTablesAllRuntime from '../runtime/runtime-tables-all.sql';

export default class SQLCodeContainer extends H5P.CodeQuestionContainer {

  async setup() {
    await super.setup();
    this.getButtonManager().addButton({
      identifier: 'run_spinner',
      label: '...',
      class: 'run_spinner',
      weight: -1
    });
    this.getButtonManager().hideButton('run_spinner');
    this.getButtonManager().addButton({
      identifier: 'tables_button',
      label: 'Tables',
      class: 'tables',
    });
    this.getButtonManager().addButton({
      identifier: 'sql_result_button',
      name: 'sql_result_button',
      label: 'Result',
      class: 'sql-result',
    });

    this.getPageManager().addPage('tables', '', 'tables', false, true);
    this.getPageManager().addPage('sql_result', '', 'sql_result', false, false);
    this.registerDOM();

    this.getObserverManager().unregister('state:run:showStopButton');
    this.getObserverManager().unregister('state:run:hideStopButton');
    this.getObserverManager().unregister('state:stop:showRunButton');

    this.getObserverManager().register(
      'button:tables',
      new H5P.ButtonClickedObserver(
        this.getButtonManager().getButton('tables_button'),
        () => this.getPageManager().showPage('tables')
      )
    );

    this.getObserverManager().register(
      'button:result',
      new H5P.ButtonClickedObserver(
        this.getButtonManager().getButton('sql_result_button'),
        () => this.getPageManager().showPage('sql_result')
      )
    );


    this.getObserverManager().register(
      'state:run:showSpinner',
      new H5P.StateRunObserver(
        this.getStateManager(),
        () => {
          this.getButtonManager().showButton('run_spinner');
        },
      )
    );

    this.getObserverManager().register(
      'state:run:hideSpinner',
      new H5P.StateStopObserver(
        this.getStateManager(),
        () => this.getButtonManager().hideButton('run_spinner'),
      )
    );

    this.getObserverManager().register(
      'page:hide:code',
      new H5P.PageHideObserver(
        this.getPageManager().getPage('code'),
        () => {
          this.getButtonManager().hideButton('runButton');
        },
      )
    );

    this.getObserverManager().register(
      'page:show:code',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('code'),
        () => {
          this.getButtonManager().showButton('runButton');
        },
      )
    );

    this.getObserverManager().register(
      'page:show:results',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('sql_result'),
        () => {
          this.getButtonManager().setActive('sql_result_button');
          this.registerDOM();
        },
      )
    );

    this.getObserverManager().register(
      'page:show:tables',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('tables'),
        () => {
          this.getButtonManager().setActive('tables_button');
          this.registerDOM();
        },
      )
    );

    this.getObserverManager().register(
      'page:hide:sqlresults',
      new H5P.PageHideObserver(
        this.getPageManager().getPage('sql_result'),
        () => {
          if (!this.getPageManager().isEmpty('sql_result')) {
            this.getButtonManager().showButton('sql_result_button');
            this.registerDOM();
          }
        },
      )
    );

    this.getObserverManager().register(
      'page:show:sqlresults',
      new H5P.PageShowObserver(
        this.getPageManager().getPage('sql_result'),
        () => {
          this.getButtonManager().showButton('sql_result_button');
          this.getButtonManager().setActive('sql_result_button');
          this.registerDOM();
        },
      )
    );

    this.getConsoleManager().hideConsole();

    const databaseOptions = await this.options.getDatabaseOptions();
    const tablesRuntime = new SQLTablesAllRuntime(() => this.resizeActionHandler(), this, databaseOptions);
    tablesRuntime.setup();
    tablesRuntime.prepareForRun();
    await tablesRuntime.run();
    this.databaseTables = tablesRuntime.resultTables;
    this.databaseTables.forEach((value, key) => {
      let formattedTable = new H5P.Markdown(value).getHTML();
      this.getPageManager().addContent('tables', '<h3>Table: ' + key + '</h3>');
      this.getPageManager().addContent('tables', formattedTable);
    });


  }


  /**
   * Return mode for SQL
   * @returns {string} String: 'sql'
   */
  getMode() {
    return 'sql';
  }

}
