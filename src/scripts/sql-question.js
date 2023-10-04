import SQLQuestionFactory from './sql-factory';

export default class SQLQuestion extends H5P.CodeQuestion {
  /**
   * @class
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);
    this.question = this;
    this.allTables = null;
    this.tables = null;
    this.dbFile = params.databaseSettings;
    this.dbFilePath = H5P.getPath(this.dbFile.path, contentId);
    this.hasCheckButton = true;
    this.hasStopButton = false;
    this.hasAssets = true;

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




