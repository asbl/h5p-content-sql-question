import SQLRuntime from './runtime-sql';

export default class SQLManualRuntime extends H5P.ManualRuntimeMixin(SQLRuntime) {

  async onSuccess(resultObject, resultTable) {
    await super.onSuccess();
    this.codeContainer.renderSQLResult?.(resultObject, resultTable, {
      rowsModified: this.runner?.lastRowsModified ?? 0,
    });
    this.codeContainer.enforceSQLToolbarState?.();
    this.resizeActionHandler?.();
  }
}
