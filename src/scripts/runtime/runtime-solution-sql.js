import SQLRuntime from './runtime-sql';

/**
 * Test runtime for executing SQL student code against reference solutions.
 *
 * Combines:
 * - SQLRuntime (language-specific execution via SQLRunner)
 * - TestRuntimeMixin (test orchestration and lifecycle)
 */
export default class SQLSolutionRuntime extends H5P.SolutionRuntimeMixin(SQLRuntime) {


  outputHandler(resultObject, resultTable) {
    this.codeTester.setTargetTable(resultObject, resultTable);

    const testCaseIndex = this.codeTester.session.testCaseIndex;
    const testCaseLabel = this.codeTester.l10n.testCase;

    this.writeConsoleSafe(resultTable, `${testCaseLabel} ${testCaseIndex + 1}`);
  }

  /**
   * Sets up the runtime for test execution.
   * Initializes console and marks the runtime as test mode.
   * @param {object} codeContainer - Container holding code and output elements
   */
  setup(codeContainer) {
    super.setup(codeContainer);
    this.runner = this.getRunner();
    this.isTest = true;
  }


  /**
   * Called when the SQL runtime completes successfully.
   * @param {Array} resultObject - Raw SQL.js result array
   * @param {string} resultTable - Formatted ASCII table string
   */
  async onSuccess(resultObject, resultTable) {
    this.outputHandler(resultObject, resultTable);
    this.codeContainer?.hideConsole?.();
    await super.onSuccess();
    this.resizeActionHandler?.();
  }

  /**
   * Called when the SQL runtime encounters an error.
   * @param {string} errorMessage - Error message string
   */
  onError(errorMessage) {
    super.onError(errorMessage);
    this.codeContainer?.getConsoleManager?.()?.showConsole?.();
  }
}
