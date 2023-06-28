import '../styles/h5p-sql-question.css';
import SQLRuntime from '../scripts/sql-runtime';
import SQLAce from '../scripts/sql-ace';
import SQLQuestion from '../scripts/sql-question';
import SQLQuestionFactory from '../scripts/sql-factory';
import SQLTester from '../scripts/sql-tester';
// Load library
H5P.SQLQuestionFactory = SQLQuestionFactory;
H5P.SQLTester = SQLTester;
H5P.SQLRuntime = SQLRuntime;
H5P.SQLAce = SQLAce;
H5P.SQLQuestion = SQLQuestion;
