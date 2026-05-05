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

    if (!this._consoleManager && typeof this.createConsoleManager === 'function') {
      this._consoleManager = this.createConsoleManager();
    }

    // Initialize SQLRunner if not already present
    this.runner = this.getRunner();
  }

  /**
   * Returns a console manager if one is available.
   * @returns {object|null} Console manager instance.
   */
  getConsoleManagerSafe() {
    return this._consoleManager
      ?? this.codeContainer?.getConsoleManager?.()
      ?? null;
  }

  /**
   * Writes to console manager only if it exists.
   * @param {string} text - Text to print.
   * @param {string} [title] - Optional title.
   */
  writeConsoleSafe(text, title) {
    this.getConsoleManagerSafe()?.write?.(text, title);
  }

  /**
   * Creates the runner configuration without mutating the shared runtime options.
   * @returns {object} SQL runner options.
   */
  getRunnerOptions() {
    const runtimeOptions = this.options ?? {};

    return {
      ...runtimeOptions,
      tableFormat: runtimeOptions.tableFormat ?? 'markdown',
    };
  }

  /**
   * Returns the SQLRunner instance for this runtime.
   * Creates a new one if it doesn't exist yet.
   * @returns {SQLRunner} The SQLRunner instance.
   */
  getRunner() {
    if (!this.runner) {
      this.runner = new SQLRunner(this, this.getRunnerOptions());
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
