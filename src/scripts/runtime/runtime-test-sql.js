import SQLSolutionRuntime from './runtime-solution-sql';
import SQLRuntime from './runtime-sql';
import { checkQueryConstraints, hasQueryConstraints } from '../services/sql-query-constraints';
import { tSQLQuestion } from '../services/sqlquestion-l10n';

/**
 * Test runtime for executing SQL student code against reference solutions.
 *
 * Combines:
 * - SQLRuntime (language-specific execution via SQLRunner)
 * - TestRuntimeMixin (test orchestration and lifecycle)
 */
export default class SQLTestRuntime extends H5P.TestRuntimeMixin(SQLRuntime) {

  /**
   * Creates a SQL runtime for executing the reference solution.
   * @returns {SQLSolutionRuntime} A new SQLSolutionRuntime
   */
  createSolutionRuntime() {
    return new SQLSolutionRuntime(
      this.resizeActionHandler,
      this.solutionCode,
      this.codeTester,
      this.options
    );
  }

  outputHandler(resultObject, resultTable) {
    this.codeTester.addOutput(resultObject, resultTable);
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
    this.checkQueryConstraints();
    this.codeContainer?.hideConsole?.();
    await super.onSuccess();
    this.resizeActionHandler?.();
  }

  /**
   * Checks the learner query against the authored structural requirements
   * (required/forbidden keywords, no subqueries, ...) and hands the result to
   * the tester, which applies it to every test case.
   */
  checkQueryConstraints() {
    const config = this.options?.queryConstraints;
    if (!hasQueryConstraints(config) || typeof this.codeTester?.setQueryConstraintResult !== 'function') {
      return;
    }

    this.codeTester.setQueryConstraintResult(checkQueryConstraints(
      this.getCode(),
      config,
      (key, replacements) => tSQLQuestion(this.options?.l10n, key, replacements),
    ));
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
