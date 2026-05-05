import SQLCodeContainer from './container/container-sql';
import SQLTestRuntime from './runtime/runtime-test-sql';
import SQLManualRuntime from './runtime/runtime-manual-sql';
import { tSQLQuestion } from './services/sqlquestion-l10n';
import worldSql from './databases/world.js';
import world23Sql from './databases/world23.js';
import world23v2Sql from './databases/world23v2.js';
import busSql from './databases/bus.js';
import teachersSql from './databases/teachers.js';
import nobelSql from './databases/nobel.js';
import movieSql from './databases/movie.js';
import euro2012Sql from './databases/euro2012.js';

const SUPPORTED_SQL_EDITOR_MODES = ['code'];

function normalizeSQLEditorMode(mode) {
  return SUPPORTED_SQL_EDITOR_MODES.includes(mode) ? mode : 'code';
}

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
    this.hasInitializedDatabaseOptions = false;
  }

  /**
   * Resolve database preparation SQL based on editor settings
   * @private
   */
  async getDatabaseOptions() {
    if (!this.hasInitializedDatabaseOptions) {
      const selectDb = this.params.databaseSettings?.select_db;
      this.databaseOptions = {
        ...this.databaseOptions,
        dbFile: selectDb === 'from_file'
          ? (this.databaseOptions.dbFile || null)
          : null,
        sqlPrepare: selectDb === 'from_defaults'
          ? this._getSQLPrepare(this.params)
          : null,
        solutionPrepare: this.params.gradingSettings?.gradingMethod === 'bySolution'
          ? this.getDecodedCode(this.params.gradingSettings.solution)
          : null,
      };
      this.hasInitializedDatabaseOptions = true;
    }

    return this.databaseOptions;
  }

  /**
   * Returns inherited options as a plain object.
   * @param {unknown} options - Options returned by a parent implementation.
   * @returns {object} Normalized option object.
   */
  normalizeInheritedOptions(options) {
    if (!options || Array.isArray(options)) {
      return {};
    }

    return options;
  }

  /**
   * Returns additional SQL-specific container options.
   * @returns {object} Container options.
   */
  getCodeContainerOptions() {
    const inheritedOptions = this.normalizeInheritedOptions(
      super.getCodeContainerOptions(),
    );

    return {
      ...inheritedOptions,
      getDatabaseOptions: () => this.getDatabaseOptions(),
      editorMode: normalizeSQLEditorMode(this.params.editorSettings?.editorMode),
      blocklyCdnUrl: String(this.params.advancedOptions?.blocklyCdnUrl || '').trim(),
      codeMirrorCdnUrl: String(this.params.advancedOptions?.codeMirrorCdnUrl || '').trim(),
      markdownCdnUrl: String(this.params.advancedOptions?.markdownCdnUrl || '').trim(),
      fontAwesomeCdnUrl: String(this.params.advancedOptions?.fontAwesomeCdnUrl || '').trim(),
      sweetAlertCdnUrl: String(this.params.advancedOptions?.sweetAlertCdnUrl || '').trim(),
      jsZipCdnUrl: String(this.params.advancedOptions?.jsZipCdnUrl || '').trim(),
      sqlJsUrl: String(this.params.advancedOptions?.sqlJsUrl || '').trim(),
    };
  }

  _getSQLPrepare(params) {
    const dbMap = {
      world: worldSql,
      world23: world23Sql,
      world23v2: world23v2Sql,
      bus: busSql,
      teachers: teachersSql,
      nobel: nobelSql,
      movie: movieSql,
      euro2012: euro2012Sql,
    };

    return dbMap[params.databaseSettings?.selectDatabase] ?? null;
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
    return {
      ...super.getRuntimeOptions(),
      ...this.databaseOptions,
      getDatabaseOptions: () => this.getDatabaseOptions(),
      sweetAlertCdnUrl: String(this.params.advancedOptions?.sweetAlertCdnUrl || '').trim(),
      sqlJsUrl: String(this.params.advancedOptions?.sqlJsUrl || '').trim(),
    };
  }

  getFeedbackText() {
    const comparison = this.codeTester?.lastComparison;

    if (!comparison) {
      return super.getFeedbackText();
    }

    if (comparison.identical) {
      return tSQLQuestion(this.contentL10n, 'sqlFeedbackSuccess');
    }

    return tSQLQuestion(this.contentL10n, 'sqlFeedbackFailure', {
      rows: comparison.nonMatchingRows,
      cols: comparison.nonMatchingCols,
    });
  }

  getContainerClass() {
    return SQLCodeContainer;
  }
}
