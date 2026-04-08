import SQLRuntime from './runtime-sql';

export default class SQLManualRuntime extends H5P.ManualRuntimeMixin(SQLRuntime) {

  onSuccess(resultObject, resultTable) {
    super.onSuccess();
    this.codeContainer.renderSQLResult?.(resultObject, resultTable);
    this.codeContainer.getButtonManager().showButton('showCodeButton');
    this.codeContainer.getPageManager().showPage('sql_result');
  }
}
