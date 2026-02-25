import SQLRunner from './sqlrunner';

/**
 * SQL Runtime for executing SQL code using SQLRunner.
 * Extends H5P.Runtime and internally uses SQLRunner for code execution.
 */
export default class SQLRuntime extends H5P.Runtime {
  /**
   * Sets up the runtime with a code container and runner.
   * @param {object} codeContainer - The code container that holds the SQL code.
   */
  setup(codeContainer) {
    super.setup(codeContainer);

    // Initialize SQLRunner if not already present
    this.runner = this.getRunner();
  }

  /**
   * Returns the SQLRunner instance for this runtime.
   * Creates a new one if it doesn't exist yet.
   * @returns {SQLRunner} The SQLRunner instance.
   */
  getRunner() {
    this.options.tableFormat = 'markdown';
    if (!this.runner) {
      this.runner = new SQLRunner(this, this.options,);
    }
    return this.runner;
  }

  /**
   * Executes SQL code via runner.
   * @param {string} code - The code to execute
   */
  async runCode(code) {
    this.resizeActionHandler();
    await this.runner.execute(code); // Tableformat:
  }

}
