import '../styles/h5p-sql-question.css';
import SQLQuestion from '../scripts/sql-question';
import RelationalAlgebraEditorInstance from '../scripts/relalg/relational-algebra-editor-instance';
import { registerSqlBlocklyLanguagePack } from '../scripts/blockly/sql-blockly-language-pack';
import { registerCodeEditorFactory } from '@libcodetools/scripts/editor/code-editor-factories';
// Load library
H5P.SQLQuestion = SQLQuestion;
registerSqlBlocklyLanguagePack();
registerCodeEditorFactory('relalg', RelationalAlgebraEditorInstance);
