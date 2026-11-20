import SQLCodeContainer from './container/container-sql';
import SQLTestRuntime from './runtime/runtime-test-sql';
import SQLManualRuntime from './runtime/runtime-manual-sql';
import RelationalAlgebraEditorInstance from './relalg/relational-algebra-editor-instance';
import { tSQLQuestion } from './services/sqlquestion-l10n';
import { hasQueryConstraints } from './services/sql-query-constraints';
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
} from '@libcodetools/scripts/services/code-question-config';

const SUPPORTED_SQL_EDITOR_MODES = ['code', 'blocks', 'both', 'fill-blanks', 'relalg'];
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
      editorFactories: {
        relalg: RelationalAlgebraEditorInstance,
      },
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
    const queryConstraints = this.params.gradingSettings?.queryConstraints;

    return {
      ...super.getRuntimeOptions(),
      ...this.databaseOptions,
      getDatabaseOptions: () => this.getDatabaseOptions(),
      sweetAlertCdnUrl: getAdvancedLibraryUrl(advancedOptions, 'sweetAlertCdnUrl'),
      sqlJsUrl: getAdvancedLibraryUrl(advancedOptions, 'sqlJsUrl'),
      ...(hasQueryConstraints(queryConstraints) ? { queryConstraints } : {}),
    };
  }

  /**
   * Builds the test cases of the table comparison.
   *
   * The first test case always runs the learner query on the authored
   * database. Authored test cases follow as data variants: each extends the
   * database with its own setup SQL before the reference solution and the
   * learner query run, so that hard-coded answers are detected.
   * @returns {object[]} Test cases handed to the tester.
   */
  getTesterTestCases() {
    const authored = Array.isArray(this.params?.gradingSettings?.testCases)
      ? this.params.gradingSettings.testCases
      : [];

    return [
      {
        name: tSQLQuestion(this.contentL10n, 'sqlBaseTestName'),
        weight: 1,
        setupSql: '',
      },
      ...authored.map((testCase) => ({
        ...testCase,
        setupSql: this.getDecodedCode(testCase?.setupSql ?? ''),
      })),
    ];
  }

  /**
   * Passes the authored result comparison options to the tester.
   * @returns {object} Tester options.
   */
  getTesterOptions() {
    return { comparison: this.params?.gradingSettings?.comparisonOptions || {} };
  }

  /**
   * SQL tasks support weighted partial credit across their test cases.
   * @returns {boolean} True when partial credit is enabled and graded.
   */
  usesPartialCredit() {
    return this.gradingMethod === 'bySolution'
      && this.params?.gradingSettings?.partialCredit === true
      && !!this.codeTester?.results;
  }

  /**
   * A table comparison only counts as solved when every test case passed,
   * even though weighted partial credit may already award some points.
   * @returns {boolean} True when the learner solved the task.
   */
  success() {
    if (this.gradingMethod === 'bySolution' && this.codeTester?.results) {
      return this.codeTester.results.getFullCompletedScore() === 1;
    }

    return super.success();
  }

  getFeedbackText() {
    const tester = this.codeTester;
    const failure = typeof tester?.getFirstFailure === 'function' && tester.comparisons?.length
      ? tester.getFirstFailure()
      : undefined;

    if (failure === null) {
      return tSQLQuestion(this.contentL10n, 'sqlFeedbackSuccess');
    }

    if (failure?.type === 'incomplete') {
      return super.getFeedbackText();
    }

    if (failure?.type === 'queryConstraintMismatch') {
      return tSQLQuestion(this.contentL10n, 'sqlFeedbackConstraint', {
        violations: failure.violations.join(', '),
      });
    }

    if (failure?.type === 'tableMismatch') {
      const testCase = tester.testcases?.[failure.testIndex] || {};

      if (failure.testIndex > 0 && testCase.hidden === true) {
        return tSQLQuestion(this.contentL10n, 'sqlFeedbackFailureHidden');
      }

      if (failure.testIndex > 0 && testCase.name) {
        return tSQLQuestion(this.contentL10n, 'sqlFeedbackFailureVariant', { name: testCase.name });
      }

      const columnFeedback = this.getColumnFeedbackText(failure.comparison);
      if (columnFeedback) {
        return columnFeedback;
      }

      if (failure.comparison.rowOrderMismatch) {
        return tSQLQuestion(this.contentL10n, 'sqlFeedbackRowOrder');
      }

      return tSQLQuestion(this.contentL10n, 'sqlFeedbackFailure', {
        rows: failure.comparison.nonMatchingRows,
        cols: failure.comparison.nonMatchingCols,
      });
    }

    const comparison = tester?.lastComparison;

    if (!comparison) {
      return super.getFeedbackText();
    }

    if (comparison.identical) {
      return tSQLQuestion(this.contentL10n, 'sqlFeedbackSuccess');
    }

    return this.getColumnFeedbackText(comparison) ?? tSQLQuestion(this.contentL10n, 'sqlFeedbackFailure', {
      rows: comparison.nonMatchingRows,
      cols: comparison.nonMatchingCols,
    });
  }

  /**
   * Names the column mismatch as root cause, because row differences usually follow from it;
   * without column problems it names the missing/extra rows.
   * @param {object} comparison Table comparison result.
   * @returns {string|null} Feedback text or null if the columns are fine.
   */
  getColumnFeedbackText(comparison) {
    const missing = comparison?.missingColumns ?? [];
    const extra = comparison?.extraColumns ?? [];
    if (missing.length === 0 && extra.length === 0) {
      const missingRows = comparison?.missingRows?.length ?? 0;
      const extraRows = comparison?.extraRows?.length ?? 0;
      return missingRows + extraRows > 0
        ? tSQLQuestion(this.contentL10n, 'sqlFeedbackRows', { missing: missingRows, extra: extraRows })
        : null;
    }

    const details = [
      missing.length > 0
        ? tSQLQuestion(this.contentL10n, 'sqlFeedbackColumnsMissing', { columns: missing.join(', ') })
        : '',
      extra.length > 0
        ? tSQLQuestion(this.contentL10n, 'sqlFeedbackColumnsExtra', { columns: extra.join(', ') })
        : '',
    ].filter(Boolean).join(' ');

    return tSQLQuestion(this.contentL10n, 'sqlFeedbackColumns', { details });
  }

  getContainerClass() {
    return SQLCodeContainer;
  }
}
