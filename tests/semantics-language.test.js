import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(resolve(__dirname, file), 'utf-8'));

const semantics = read('../semantics.json');
const library = read('../library.json');

/**
 * Mirrors h5p-cli's removeUntranslatables logic: keep label, description,
 * entity, example, non-empty string defaults of non-select fields and
 * option labels; recurse into groups and list item templates.
 * @param {object} field Semantics field.
 * @returns {object} Translatable shape.
 */
function translatableShape(field) {
  const result = {};

  ['label', 'description', 'entity', 'example'].forEach((key) => {
    if (key in field) result[key] = field[key];
  });

  if (typeof field.default === 'string' && field.default !== '' && field.type !== 'select') {
    result.default = field.default;
  }

  if (field.type === 'select' && Array.isArray(field.options)) {
    result.options = field.options.map((option) => ({ label: option.label }));
  }

  if (Array.isArray(field.fields)) result.fields = field.fields.map(translatableShape);
  if ('field' in field) result.field = translatableShape(field.field);

  return result;
}

function structuralSkeleton(value) {
  if (typeof value === 'string') return '';
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(structuralSkeleton);

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, structuralSkeleton(entry)]));
}

function findField(name, fields = semantics) {
  return fields.find((field) => field.name === name);
}

describe('language files', () => {
  ['en', 'de'].forEach((language) => {
    it(`language/${language}.json matches the structure of semantics.json`, () => {
      const translation = read(`../language/${language}.json`);

      expect(structuralSkeleton(translation.semantics))
        .toEqual(structuralSkeleton(semantics.map(translatableShape)));
    });
  });
});

describe('grading semantics', () => {
  const grading = findField('gradingSettings');

  it('offers result comparison, query requirements, partial credit and test cases for solution grading', () => {
    ['comparisonOptions', 'queryConstraints', 'partialCredit', 'testCases'].forEach((name) => {
      const field = findField(name, grading.fields);

      expect(field, name).toBeDefined();
      expect(field.showWhen.rules[0]).toEqual({ field: 'gradingMethod', equals: 'bySolution' });
    });
  });

  it('keeps the historic comparison behavior as the default', () => {
    const options = findField('comparisonOptions', grading.fields).fields;

    expect(findField('rowOrder', options).default).toBe('ignore');
    expect(findField('columnComparison', options).default).toBe('exact');
    expect(findField('ignoreCase', options).default).toBe(false);
    expect(findField('numericTolerance', options).default).toBe(0);
  });

  it('describes SQL test cases with the same fields as Python test cases', () => {
    const testCase = findField('testCases', grading.fields).field.fields.map((field) => field.name);

    expect(testCase).toEqual(['name', 'learningGoal', 'failureHint', 'weight', 'hidden', 'setupSql']);
  });

  it('provides hints, worked example and due date like PythonQuestion', () => {
    expect(findField('hintSettings')).toBeDefined();
    expect(findField('workedExampleSettings')).toBeDefined();
    expect(findField('dueDateGroup', grading.fields)).toBeDefined();
    expect(library.editorDependencies.map((dependency) => dependency.machineName))
      .toContain('H5PEditor.DateTime');
  });

  it('does not contain the former spelling mistakes', () => {
    const text = JSON.stringify(semantics);

    expect(text).not.toMatch(/Assigmnent/i);
    expect(text).not.toContain('StartingCode');
  });
});
