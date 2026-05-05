import SQLCodeContainer from './container/container-sql';
import SQLTestRuntime from './runtime/runtime-test-sql';
import SQLManualRuntime from './runtime/runtime-manual-sql';
import { tSQLQuestion } from './services/sqlquestion-l10n';
import worldDbUrl from './databases/world.db';
import world23DbUrl from './databases/world23.db';
import world23v2DbUrl from './databases/world23v2.db';
import busDbUrl from './databases/bus.db';
import teachersDbUrl from './databases/teachers.db';
import nobelDbUrl from './databases/nobel.db';
import movieDbUrl from './databases/movie.db';
import euro2012DbUrl from './databases/euro2012.db';

const SUPPORTED_SQL_EDITOR_MODES = ['code'];

function normalizeSQLEditorMode(mode) {
  return SUPPORTED_SQL_EDITOR_MODES.includes(mode) ? mode : 'code';
}

function toBundledDbFileName(assetUrl) {
  return String(assetUrl || '').split('/').pop() || '';
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
      const presetDbUrl = this._getPresetDbUrl(this.params);
      this.databaseOptions = {
        ...this.databaseOptions,
        dbFile: this.databaseOptions.dbFile || presetDbUrl || null,
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

  /**
   * Returns the bundled .db asset URL for a named preset, or null.
   * @private
   * @param {object} params
   * @returns {string|null}
   */
  _getPresetDbUrl(params) {
    const dbMap = {
      world: worldDbUrl,
      world23: world23DbUrl,
      world23v2: world23v2DbUrl,
      bus: busDbUrl,
      teachers: teachersDbUrl,
      nobel: nobelDbUrl,
      movie: movieDbUrl,
      euro2012: euro2012DbUrl,
    };

    const assetUrl = dbMap[params.databaseSettings?.selectDatabase] ?? null;
    if (!assetUrl) {
      return null;
    }

    // Derive the final runtime URL from the active H5P library path.
    // This avoids relying on webpack publicPath auto-detection on LMS hosts.
    const fileName = toBundledDbFileName(assetUrl);
    if (fileName && typeof this.getLibraryFilePath === 'function') {
      return this.getLibraryFilePath(`dist/databases/${fileName}`);
    }

    return assetUrl;
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
