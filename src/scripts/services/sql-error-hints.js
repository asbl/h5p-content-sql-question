import { findClosestIdentifier, SQL_RESERVED_WORDS } from './sql-guidance';

const MAIN_KEYWORDS = Array.from(SQL_RESERVED_WORDS)
  .filter((word) => word.length >= 3 && !['top', 'all', 'set', 'add'].includes(word));

/**
 * Finds the keyword a token was most likely meant to be. Letter swaps such as
 * FORM/FROM count as one typo, which plain edit distance would not.
 * @param {string} token Token from the error message.
 * @returns {string|null} Keyword or null.
 */
function findClosestKeyword(token) {
  const word = token.toLowerCase();
  const sorted = (value) => value.split('').sort().join('');
  const swapped = MAIN_KEYWORDS.find((keyword) => keyword !== word
    && keyword.length === word.length
    && word.length >= 4
    && sorted(keyword) === sorted(word)
    && Array.from(keyword).filter((letter, index) => letter !== word[index]).length === 2);

  return swapped ?? findClosestIdentifier(word, MAIN_KEYWORDS);
}

/**
 * Picks the explanation for a raw SQLite error message.
 * @param {string} text Raw message.
 * @param {object|null} schema Schema built by buildSQLSchema.
 * @param {Function} translate Called as translate(key, replacements).
 * @returns {string|null} Explanation or null if no pattern matches.
 */
function getExplanation(text, schema, translate) {
  let match = text.match(/near "([^"]*)": syntax error/i);
  if (match) {
    const token = match[1];
    const suggestion = /^[A-Za-z_]+$/.test(token)
      ? findClosestKeyword(token)
      : null;

    if (suggestion && suggestion.toLowerCase() !== token.toLowerCase()) {
      return translate('sqlErrorSyntaxKeyword', { token, suggestion: suggestion.toUpperCase() });
    }

    return translate('sqlErrorSyntax', { token });
  }

  if (/incomplete input/i.test(text)) {
    return translate('sqlErrorIncomplete');
  }

  match = text.match(/no such column:\s*(.+)$/i);
  if (match) {
    const name = match[1].trim();
    const bare = name.includes('.') ? name.split('.').pop() : name;
    const suggestion = findClosestIdentifier(bare, schema?.allColumns ?? []);

    return suggestion
      ? translate('sqlErrorNoColumnSuggestion', { name, suggestion })
      : translate('sqlErrorNoColumn', { name });
  }

  match = text.match(/no such table:\s*(.+)$/i);
  if (match) {
    const name = match[1].trim();
    const suggestion = findClosestIdentifier(name, schema?.tableNames ?? []);

    return suggestion
      ? translate('sqlErrorNoTableSuggestion', { name, suggestion })
      : translate('sqlErrorNoTable', { name });
  }

  match = text.match(/ambiguous column name:\s*(.+)$/i);
  if (match) {
    return translate('sqlErrorAmbiguous', { name: match[1].trim() });
  }

  if (/misuse of aggregate/i.test(text)) {
    return translate('sqlErrorAggregate');
  }

  match = text.match(/unrecognized token:\s*"?([^"]*)"?/i);
  if (match) {
    return translate('sqlErrorToken', { token: match[1] });
  }

  match = text.match(/no such function:\s*(.+)$/i);
  if (match) {
    return translate('sqlErrorFunction', { name: match[1].trim() });
  }

  return null;
}

/**
 * Translates a raw SQLite error message into a learner-friendly explanation
 * with a concrete tip. Returns the original text if no pattern matches.
 * @param {string} message Raw error message.
 * @param {object} [options] Options.
 * @param {object} [options.schema] Schema built by buildSQLSchema.
 * @param {Function} [options.translate] Called as translate(key, replacements) and returns text.
 * @returns {string} Explanation followed by the original message (if an explanation exists).
 */
export function explainSQLError(message = '', { schema = null, translate = null } = {}) {
  const raw = String(message ?? '').trim();
  if (raw === '' || typeof translate !== 'function') {
    return raw;
  }

  const explanation = getExplanation(raw.replace(/^(?:Error:\s*)+/i, ''), schema, translate);
  return explanation ? `${explanation}\n${raw}` : raw;
}
