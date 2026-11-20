/**
 * Structural checks of a learner's SQL text.
 *
 * The checks work on a sanitized copy of the query in which comments, string
 * literals and quoted identifiers are removed, so that e.g. the string
 * 'JOIN' or a column called "group" does not satisfy or violate a rule.
 */

/**
 * Splits an author-entered keyword list into normalized entries.
 * @param {*} value Comma, semicolon or line separated list.
 * @returns {string[]} Upper-case keywords with collapsed whitespace.
 */
export function parseKeywordList(value) {
  return String(value ?? '')
    .split(/[,;\n]/)
    .map((entry) => entry.trim().replace(/\s+/g, ' ').toUpperCase())
    .filter(Boolean);
}

/**
 * Removes comments, string literals and quoted identifiers.
 * @param {string} sql SQL text.
 * @returns {string} Upper-case SQL with collapsed whitespace.
 */
export function sanitizeSql(sql) {
  return String(sql ?? '')
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, ' \'\' ')
    .replace(/"(?:[^"]|"")*"/g, ' "" ')
    .replace(/`[^`]*`/g, ' `` ')
    .replace(/\[[^\]\n]*\]/g, ' [] ')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .trim();
}

/**
 *
 * @param text
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a whole-word pattern for a possibly multi-word keyword.
 * @param {string} keyword Upper-case keyword, e.g. "GROUP BY".
 * @returns {RegExp} Pattern matching the keyword in sanitized SQL.
 */
function keywordPattern(keyword) {
  const body = keyword.split(' ').map(escapeRegExp).join('\\s+');
  const left = /^\w/.test(keyword) ? '\\b' : '';
  const right = /\w$/.test(keyword) ? '\\b' : '';
  return new RegExp(`${left}${body}${right}`);
}

/**
 * Tells whether the sanitized SQL contains a nested SELECT.
 * @param {string} sanitized Sanitized SQL.
 * @returns {boolean} True if a subquery is used.
 */
export function hasSubquery(sanitized) {
  return /\(\s*SELECT\b/.test(sanitized);
}

/**
 * Tells whether the sanitized SQL selects all columns with "*".
 * COUNT(*) and multiplications are not reported.
 * @param {string} sanitized Sanitized SQL.
 * @returns {boolean} True if "SELECT *" (or "t.*") is used.
 */
export function usesSelectStar(sanitized) {
  return /\bSELECT\s+(?:ALL\s+|DISTINCT\s+)?(?:[\w]+\.)?\*/.test(sanitized)
    || /,\s*(?:[\w]+\.)?\*\s*(?:,|\bFROM\b)/.test(sanitized);
}

/**
 * Normalizes the authored query requirements.
 * @param {object} [config] Raw `queryConstraints` params.
 * @returns {{required: string[], forbidden: string[], forbidSubqueries: boolean, forbidSelectStar: boolean}}
 *   Normalized configuration.
 */
export function normalizeQueryConstraints(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    required: parseKeywordList(source.requiredKeywords),
    forbidden: parseKeywordList(source.forbiddenKeywords),
    forbidSubqueries: source.forbidSubqueries === true,
    forbidSelectStar: source.forbidSelectStar === true,
  };
}

/**
 * Tells whether any requirement is configured.
 * @param {object} [config] Raw `queryConstraints` params.
 * @returns {boolean} True if at least one rule is active.
 */
export function hasQueryConstraints(config) {
  const normalized = normalizeQueryConstraints(config);
  return normalized.required.length > 0
    || normalized.forbidden.length > 0
    || normalized.forbidSubqueries
    || normalized.forbidSelectStar;
}

/**
 * Checks a learner query against the authored requirements.
 * @param {string} sql Learner SQL.
 * @param {object} config Raw `queryConstraints` params.
 * @param {(key: string, replacements?: object) => string} translate Message formatter.
 * @returns {{passed: boolean, violations: string[], checks: Array<{passed: boolean, message: string}>}}
 *   Per-rule result; `checks` only lists configured rules.
 */
export function checkQueryConstraints(sql, config, translate) {
  const rules = normalizeQueryConstraints(config);
  const sanitized = sanitizeSql(sql);
  const checks = [];

  rules.required.forEach((keyword) => {
    checks.push({
      passed: keywordPattern(keyword).test(sanitized),
      message: translate('sqlConstraintRequired', { value: keyword }),
    });
  });

  rules.forbidden.forEach((keyword) => {
    checks.push({
      passed: !keywordPattern(keyword).test(sanitized),
      message: translate('sqlConstraintForbidden', { value: keyword }),
    });
  });

  if (rules.forbidSubqueries) {
    checks.push({
      passed: !hasSubquery(sanitized),
      message: translate('sqlConstraintNoSubquery'),
    });
  }

  if (rules.forbidSelectStar) {
    checks.push({
      passed: !usesSelectStar(sanitized),
      message: translate('sqlConstraintNoSelectStar'),
    });
  }

  const violations = checks.filter((check) => !check.passed).map((check) => check.message);
  return { passed: violations.length === 0, violations, checks };
}
