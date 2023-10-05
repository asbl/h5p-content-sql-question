import SQLQuestionFactory from './sql-factory';
import WorldSQL from './databases/world.js';
import World23SQL from './databases/world23.js';

export default class SQLQuestion extends H5P.CodeQuestion {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);
    this.allTables = null;
    this.tables = null;
    if (params.databaseSettings.select_db === 'from_file' && params.databaseSettings.dbFile) {
      this.dbFile = params.databaseSettings.dbFile;
      this.dbFilePath = H5P.getPath(this.dbFile.path, contentId);
      this.sqlPrepare = null;
    }
    else if (params.databaseSettings.select_db === 'from_defaults' && params.databaseSettings.selectDatabase) {
      this.dbFile = null;
      this.dbFilePath = null;
      if (params.databaseSettings.selectDatabase === 'world') {
        this.sqlPrepare = new WorldSQL().sql;
      }
      else if (params.databaseSettings.selectDatabase === 'world23') {
        this.sqlPrepare = new World23SQL().sql;
      } 
    }
    else {
      this.dbFile = null;
      this.dbFilePath = null;
      this.sqlPrepare = null;
    }
    this.solutionPrepare = this.params.gradingSettings.gradingMethod === 'bySolution' ? this.params.gradingSettings.solution : null;
    this.hasCheckButton = true;
    this.hasStopButton = false;
    this.hasAssets = true;
    this.language = 'sql';
  } // end of constructor

  /**
    Used for css
    @returns {string} question name as string for css-class.
   */
  getQuestionName() {
    return 'h5p-sql-question';
  }

  getFactory() {
    return new SQLQuestionFactory(this);
  }

  getMaxScore() {
    return 1;
  }

} // end of class




