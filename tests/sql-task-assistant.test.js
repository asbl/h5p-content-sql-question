import { beforeAll, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';

import {
  SQL_TEMPLATE_NAMES,
  createSqlTaskTemplate,
  inspectSqlTask,
} from '../../H5PEditor.CodeWidget-6.0/src/scripts/services/sql-task-assistant.js';
import {
  checkQueryConstraints,
} from '../src/scripts/services/sql-query-constraints.js';
import worldSql from '../src/scripts/databases/world.js';
import teachersSql from '../src/scripts/databases/teachers.js';

const sqlJsWasmPath = new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname;
const databases = { world: worldSql, teachers: teachersSql };
let SQL;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => sqlJsWasmPath });
});

const identity = (key, replacements = {}) => replacements.value || key;

describe('SQL task templates', () => {
  it.each(SQL_TEMPLATE_NAMES)('%s: is consistent and passes the assistant check', (name) => {
    expect(inspectSqlTask(createSqlTaskTemplate(name))).toEqual([]);
  });

  it.each(SQL_TEMPLATE_NAMES)('%s: solution runs, matches its own rules and differs from the default data in the variant', (name) => {
    const template = createSqlTaskTemplate(name);
    const { solution, queryConstraints, testCases } = template.gradingSettings;
    const prepare = databases[template.databaseSettings.selectDatabase];

    const base = new SQL.Database();
    base.run(prepare);
    const baseResult = JSON.stringify(base.exec(solution));
    expect(baseResult).not.toBe('[]');

    expect(checkQueryConstraints(solution, queryConstraints, identity).passed).toBe(true);
    expect(checkQueryConstraints(template.editorSettings.startingCode, queryConstraints, identity).passed).toBe(false);

    const variant = new SQL.Database();
    variant.run(prepare);
    variant.run(testCases[0].setupSql);
    expect(JSON.stringify(variant.exec(solution))).not.toBe(baseResult);
  });

  it('returns independent copies', () => {
    createSqlTaskTemplate('select').gradingSettings.solution = 'changed';

    expect(createSqlTaskTemplate('select').gradingSettings.solution).toContain('SELECT name');
    expect(() => createSqlTaskTemplate('nope')).toThrow('Unknown task template');
  });
});

describe('inspectSqlTask', () => {
  const keys = (params) => inspectSqlTask(params).map((issue) => issue.key);

  it('reports a missing grading method, instructions and database', () => {
    expect(keys({})).toEqual(['assistantMissingInstructions', 'assistantSqlNoGrading']);

    const params = createSqlTaskTemplate('select');
    params.databaseSettings = { select_db: 'from_defaults' };
    params.editorSettings.instructions = '  ';
    expect(keys(params)).toEqual(['assistantMissingInstructions', 'assistantSqlNoDatabase']);
  });

  it('reports a database that is chosen but not provided', () => {
    const params = createSqlTaskTemplate('select');

    params.databaseSettings = { select_db: 'from_file', uploadType: 'db_file' };
    expect(keys(params)).toContain('assistantSqlNoDatabase');
    params.databaseSettings.dbFile = { path: 'x.sqlite' };
    expect(keys(params)).not.toContain('assistantSqlNoDatabase');

    params.databaseSettings = { select_db: 'from_repository' };
    expect(keys(params)).toContain('assistantSqlNoDatabase');
  });

  it('reports rule conflicts and a solution that violates its own rules', () => {
    const params = createSqlTaskTemplate('select');
    params.gradingSettings.queryConstraints.forbiddenKeywords = 'where';
    const issues = inspectSqlTask(params);

    expect(issues.map((issue) => issue.key)).toEqual(
      expect.arrayContaining(['assistantSqlConflictingKeywords', 'assistantSqlSolutionBreaksRules']),
    );
    expect(issues.find((issue) => issue.key === 'assistantSqlConflictingKeywords').value).toBe('WHERE');

    const star = createSqlTaskTemplate('select');
    star.gradingSettings.solution = 'SELECT * FROM world WHERE continent = 1 ORDER BY name';
    const breaking = inspectSqlTask(star).find((issue) => issue.key === 'assistantSqlSolutionBreaksRules');
    expect(breaking.path).toBe('gradingSettings/solution');
    expect(breaking.value).toContain('sqlConstraintNoSelectStar');
  });

  it('reports test case problems with their index and path', () => {
    const params = createSqlTaskTemplate('select');
    params.gradingSettings.testCases.push({ weight: 0, setupSql: ' ', hidden: true });
    const issues = inspectSqlTask(params);

    expect(issues.map((issue) => [issue.key, issue.index, issue.path])).toEqual([
      ['assistantInvalidWeight', 1, 'gradingSettings/testCases/1/weight'],
      ['assistantSqlEmptySetup', 1, 'gradingSettings/testCases/1/setupSql'],
    ]);

    params.gradingSettings.testCases = [{ hidden: true, setupSql: 'INSERT INTO t VALUES (1);' }];
    expect(keys(params)).toContain('assistantAllHidden');
  });

  it('reports a missing solution, negative tolerance and empty optional sections', () => {
    const params = createSqlTaskTemplate('select');
    params.gradingSettings.solution = '';
    params.gradingSettings.comparisonOptions.numericTolerance = -1;
    params.hintSettings = { enableHints: true, hints: [{ hint: '  ' }] };
    params.workedExampleSettings = { enable: true, code: '' };

    expect(keys(params)).toEqual([
      'assistantMissingSolution',
      'assistantSqlInvalidTolerance',
      'assistantSqlHintsEmpty',
      'assistantSqlWorkedExampleEmpty',
    ]);
  });

  it('requires a correct answer option for multiple choice', () => {
    const params = {
      editorSettings: { instructions: 'Frage' },
      gradingSettings: { gradingMethod: 'multipleChoice', multipleChoice: { choices: [{ correct: false }, { correct: false }] } },
    };

    expect(keys(params)).toEqual(['assistantSqlNoCorrectChoice']);
    params.gradingSettings.multipleChoice.choices[1].correct = true;
    expect(keys(params)).toEqual([]);
  });

describe('template hints', () => {
  it.each(SQL_TEMPLATE_NAMES)('%s: stores hints as plain texts like the semantics list', (name) => {
    const { hints } = createSqlTaskTemplate(name).hintSettings;

    expect(hints.length).toBeGreaterThan(0);
    hints.forEach((entry) => expect(typeof entry).toBe('string'));
  });
});
});
