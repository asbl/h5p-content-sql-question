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
import {
  getExternalLibraryUrl,
  normalizeEditorMode,
  normalizePlainObject,
  parseExternalLibraryUrlsYaml,
} from '../../../H5P.LibCodeTools-6.0/src/scripts/services/code-question-config';

const SUPPORTED_SQL_EDITOR_MODES = ['code', 'blocks', 'both', 'fill-blanks'];
const DEFAULT_DATABASE_REPOSITORY_URL = 'https://raw.githubusercontent.com/asbl/SQLQuestionDatabases/main/manifest.json';

function normalizeSQLEditorMode(mode) {
  return normalizeEditorMode(mode, SUPPORTED_SQL_EDITOR_MODES);
}

export { parseExternalLibraryUrlsYaml };

function getAdvancedLibraryUrl(advancedOptions, optionName) {
  const yamlUrls = parseExternalLibraryUrlsYaml(advancedOptions?.externalLibraryUrls);
  return getExternalLibraryUrl({ yamlUrls, advancedOptions, optionName });
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
      sqlFile: params.databaseSettings?.sqlFile
        ? H5P.getPath(params?.databaseSettings?.sqlFile.path, contentId)
        : null,
      cleanMySQLDump: false,
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
      const uploadType = this.params.databaseSettings?.uploadType ?? 'db_file';
      const repositoryOptions = selectDb === 'from_repository'
        ? await this.getRepositoryDatabaseOptions(this.params.databaseSettings)
        : {};

      this.databaseOptions = {
        ...this.databaseOptions,
        dbFile: selectDb === 'from_file' && uploadType === 'db_file'
          ? (this.databaseOptions.dbFile || null)
          : null,
        sqlFile: selectDb === 'from_file' && uploadType === 'sql_file'
          ? (this.databaseOptions.sqlFile || null)
          : null,
        cleanMySQLDump: selectDb === 'from_file' &&
          uploadType === 'sql_file' &&
          this.params.databaseSettings?.sqlImportOptions?.cleanMySQLDump === true,
        sqlPrepare: selectDb === 'from_defaults'
          ? this._getSQLPrepare(this.params)
          : null,
        ...repositoryOptions,
        solutionPrepare: this.params.gradingSettings?.gradingMethod === 'bySolution'
          ? this.getDecodedCode(this.params.gradingSettings.solution)
          : null,
      };
      this.hasInitializedDatabaseOptions = true;
    }

    return this.databaseOptions;
  }

  /**
   * Resolves a database preset from an external repository manifest.
   * @param {object} databaseSettings Database settings.
   * @returns {Promise<object>} Database runner options.
   */
  async getRepositoryDatabaseOptions(databaseSettings = {}) {
    const manifestUrl = String(
      databaseSettings.repositoryUrl || DEFAULT_DATABASE_REPOSITORY_URL
    ).trim();
    const databaseId = String(databaseSettings.repositoryDatabase || '').trim();

    if (!manifestUrl) {
      throw new Error('Missing database repository manifest URL.');
    }

    if (!databaseId) {
      throw new Error('Missing repository database name.');
    }

    const manifest = await this.loadDatabaseRepositoryManifest(manifestUrl);
    const preset = this.findDatabaseRepositoryPreset(manifest, databaseId);

    if (!preset) {
      throw new Error(`Database repository preset not found: ${databaseId}`);
    }

    return this.repositoryPresetToDatabaseOptions(preset, manifestUrl);
  }

  /**
   * Loads a repository manifest.
   * @param {string} manifestUrl Manifest URL.
   * @returns {Promise<object>} Parsed manifest.
   */
  async loadDatabaseRepositoryManifest(manifestUrl) {
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`Failed to load database repository (${response.status}) from ${manifestUrl}`);
    }

    return response.json();
  }

  /**
   * Finds a preset by id/name in supported manifest shapes.
   * @param {object} manifest Repository manifest.
   * @param {string} databaseId Database id.
   * @returns {object|null} Preset entry.
   */
  findDatabaseRepositoryPreset(manifest, databaseId) {
    if (Array.isArray(manifest?.databases)) {
      return manifest.databases.find((database) => (
        database?.id === databaseId || database?.name === databaseId
      )) ?? null;
    }

    return manifest?.databases?.[databaseId] ?? null;
  }

  /**
   * Converts a repository preset into SQLRunner options.
   * @param {object} preset Repository preset.
   * @param {string} manifestUrl Manifest URL for resolving relative files.
   * @returns {object} Database runner options.
   */
  repositoryPresetToDatabaseOptions(preset, manifestUrl) {
    const type = String(preset.type || '').toLowerCase();
    const resolvedUrl = preset.url
      ? new URL(preset.url, manifestUrl).toString()
      : null;

    if (['sqlite_file', 'db_file', 'sqlite'].includes(type)) {
      if (!resolvedUrl) {
        throw new Error(`Missing URL for repository database: ${preset.id ?? preset.name ?? type}`);
      }

      return {
        dbFile: resolvedUrl,
        sqlFile: null,
        sqlPrepare: null,
        cleanMySQLDump: false,
      };
    }

    if (['sql_file', 'sql'].includes(type)) {
      if (!resolvedUrl) {
        throw new Error(`Missing URL for repository database: ${preset.id ?? preset.name ?? type}`);
      }

      return {
        dbFile: null,
        sqlFile: resolvedUrl,
        sqlPrepare: null,
        cleanMySQLDump: preset.cleanMySQLDump === true,
      };
    }

    if (['inline_sql', 'sql_inline'].includes(type)) {
      return {
        dbFile: null,
        sqlFile: null,
        sqlPrepare: preset.sql ?? '',
        cleanMySQLDump: preset.cleanMySQLDump === true,
      };
    }

    throw new Error(`Unsupported repository database type: ${preset.type}`);
  }

  /**
   * Returns inherited options as a plain object.
   * @param {unknown} options - Options returned by a parent implementation.
   * @returns {object} Normalized option object.
   */
  normalizeInheritedOptions(options) {
    return normalizePlainObject(options);
  }

  /**
   * Returns additional SQL-specific container options.
   * @returns {object} Container options.
   */
  getCodeContainerOptions(contentParams = null) {
    const inheritedOptions = this.normalizeInheritedOptions(
      super.getCodeContainerOptions(contentParams),
    );
    const advancedOptions = this.params.advancedOptions || {};
    const editorParams = contentParams !== null
      ? {
        ...(contentParams || {}),
        ...(contentParams?.options || {}),
      }
      : this.params.editorSettings || {};

    return {
      ...inheritedOptions,
      getDatabaseOptions: () => this.getDatabaseOptions(),
      entryFileName: 'query.sql',
      downloadFilename: 'query.sql',
      projectDownloadFilename: 'sql-project.zip',
      projectBundleType: 'h5p-sql-question-project',
      editorMode: normalizeSQLEditorMode(editorParams.editorMode),
      blocklyCategories: editorParams.blocklyCategories || null,
      blocklyWorkspaceState: editorParams.blocklyWorkspaceState || null,
      blocklyPackages: [],
      blocklyCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'blocklyCdnUrl'),
      codeMirrorCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'codeMirrorCdnUrl'),
      markdownCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'markdownCdnUrl'),
      fontAwesomeCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'fontAwesomeCdnUrl'),
      sweetAlertCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'sweetAlertCdnUrl'),
      jsZipCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'jsZipCdnUrl'),
      sqlJsUrl: getAdvancedLibraryUrl(advancedOptions, 'sqlJsUrl'),
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
    const advancedOptions = this.params.advancedOptions || {};

    return {
      ...super.getRuntimeOptions(),
      ...this.databaseOptions,
      getDatabaseOptions: () => this.getDatabaseOptions(),
      sweetAlertCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'sweetAlertCdnUrl'),
      sqlJsUrl: getAdvancedLibraryUrl(advancedOptions, 'sqlJsUrl'),
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
