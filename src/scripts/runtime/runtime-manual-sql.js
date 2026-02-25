import SQLRuntime from './runtime-sql';

export default class SQLManualRuntime extends H5P.ManualRuntimeMixin(SQLRuntime) {

  onSuccess(_resultObject, resultTable) {
    super.onSuccess();
    const formattedTable = new H5P.Markdown(resultTable).getHTML();
    this.codeContainer.getPageManager().setContent('sql_result', formattedTable);
    this.codeContainer.getButtonManager().showButton('showCodeButton');
    this.codeContainer.getPageManager().showPage('sql_result');
  }
}
