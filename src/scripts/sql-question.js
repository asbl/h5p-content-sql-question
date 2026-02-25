import SQLCodeContainer from './container/container-sql';
import SQLTestRuntime from './runtime/runtime-test-sql';
import SQLManualRuntime from './runtime/runtime-manual-sql';
import SQLTablesRuntime from './runtime/runtime-tables-all.sql.js';
import SQLTablesAllRuntime from './runtime/runtime-tables-all.sql.js';

export default class SQLQuestion extends H5P.CodeQuestion {

  /**
   * @param {object} params Parameters passed by the editor
   * @param {number} contentId Content id
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);
    this.params = params;
    this.hasCheckButton = true;
    this.hasStopButton = false;
    this.hasAssets = true;
    this.language = 'sql';

    this.databaseOptions = {
      dbFile: params.databaseSettings?.dbFile
        ? H5P.getPath(params?.databaseSettings?.dbFile.path, contentId)
        : null,
      sqlPrepare: null,
      solutionPrepare: null
    };
    this.initdatabaseOptions = false;
    this.params = params;
  }

  /**
   * Resolve database preparation SQL based on editor settings
   * @private
   */
  async getDatabaseOptions() {
    if (!this.initdatabaseOptions) {
      console.log("sql prepare", this.params)
      this.databaseOptions.sqlPrepare = await this._getSQLPrepare(this.params);
      if (this.params.gradingSettings?.gradingMethod === 'bySolution') {
        this.databaseOptions.solutionPrepare =
          this.getDecodedCode(this.params.gradingSettings.solution);
      }
      this.initdatabaseOptions = true;
    }
    return this.databaseOptions;
  }

  getCodeContainerOptions() {
    return {
      getDatabaseOptions: () => this.getDatabaseOptions(),
    };
  }

  /**
   * Select SQL prepare code based on selected database
   * @private
   * @param {object} params
   * @returns {Promise<string|null>}
   */
  async _getSQLPrepare(params) {

    const dbMap = {
      world: () => import('./databases/world.js'),
      world23: () => import('./databases/world23.js'),
      world23v2: () => import('./databases/world23v2.js'),
      bus: () => import('./databases/bus.js'),
      teachers: () => import('./databases/teachers.js'),
      nobel: () => import('./databases/nobel.js'),
      movie: () => import('./databases/movie.js'),
    };
    const key = params.databaseSettings?.selectDatabase;
    const loader = dbMap[key];
    console.log("loader?", loader, key, dbMap[key])
    if (!loader) return null;

    const module = await loader();
    console.log("loader", module)
    return module.default;

  }

  /**
   * CSS class name
   * @returns {string}
   */
  getQuestionName() {
    return 'h5p-sql-question';
  }

  getCodingLanguage() {
    return 'sql';
  }

  getTestRuntimeClass() {
    return SQLTestRuntime;
  }

  getManualRuntimeClass() {
    return SQLManualRuntime;
  }

  getRuntimeOptions() {
    return this.databaseOptions;
  }

  getContainerClass() {
    return SQLCodeContainer;
  }
}
