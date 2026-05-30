import '../styles/h5p-sql-question.css';
import SQLQuestion from '../scripts/sql-question';
import { registerSqlBlocklyLanguagePack } from '../scripts/blockly/sql-blockly-language-pack';
// Load library
H5P.SQLQuestion = SQLQuestion;
registerSqlBlocklyLanguagePack();
