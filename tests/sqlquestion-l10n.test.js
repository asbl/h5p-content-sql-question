import { beforeEach, describe, expect, it } from 'vitest';

import {
  getSQLQuestionL10nValue,
  tSQLQuestion,
} from '../src/scripts/services/sqlquestion-l10n.js';

describe('SQLQuestion localization', () => {
  beforeEach(() => {
    H5P.t.mockImplementation((key, _params, library) => `[Missing translation ${library}:${key}]`);
  });

  it('prefers explicit content overrides', () => {
    expect(getSQLQuestionL10nValue({ sqlTables: 'Datenbanken' }, 'sqlTables')).toBe('Datenbanken');
    expect(H5P.t).not.toHaveBeenCalled();
  });

  it('uses runtime translations when H5P provides them', () => {
    H5P.t.mockImplementation((key, _params, library) => (
      key === 'sqlResult'
        ? 'Abfrageergebnis'
        : `[Missing translation ${library}:${key}]`
    ));

    expect(getSQLQuestionL10nValue({}, 'sqlResult')).toBe('Abfrageergebnis');
  });

  it('falls back to bundled defaults when H5P reports missing translations', () => {
    expect(getSQLQuestionL10nValue({}, 'sqlResult')).toBe('Result');
  });

  it('formats placeholders in localized SQL strings', () => {
    expect(tSQLQuestion({}, 'sqlTableHeading', { name: 'users' })).toBe('Table: users');
  });
});