import defaultLanguage from './default-language.json';
import defaultLanguageDe from './default-language.de.json';

const SQLQUESTION_LIBRARY = 'H5P.SQLQuestion';
const H5P_MISSING_TRANSLATION_PREFIX = '[Missing translation';

function getPreferredLocale() {
  const documentLanguage = globalThis.document?.documentElement?.lang;
  const navigatorLanguage = Array.isArray(globalThis.navigator?.languages)
    ? globalThis.navigator.languages[0]
    : globalThis.navigator?.language;

  return String(documentLanguage || navigatorLanguage || '').toLowerCase();
}

function getDefaultLibraryStrings() {
  return getPreferredLocale().startsWith('de')
    ? (defaultLanguageDe?.libraryStrings ?? defaultLanguage?.libraryStrings ?? {})
    : (defaultLanguage?.libraryStrings ?? {});
}

const DEFAULT_LIBRARY_STRINGS = getDefaultLibraryStrings();

function isMissingTranslation(message) {
  return typeof message === 'string' && message.startsWith(H5P_MISSING_TRANSLATION_PREFIX);
}

function getLibraryString(key) {
  const message = typeof globalThis.H5P?.t === 'function'
    ? globalThis.H5P.t(key, undefined, SQLQUESTION_LIBRARY)
    : undefined;

  if (typeof message === 'string' && message !== '' && !isMissingTranslation(message)) {
    return message;
  }

  const fallback = DEFAULT_LIBRARY_STRINGS[key];
  if (typeof fallback === 'string' && fallback !== '') {
    return fallback;
  }

  throw new Error(`Missing SQLQuestion language key: ${key}`);
}

/**
 * Get a required SQLQuestion string.
 * @param {object} l10n - Localization map.
 * @param {string} key - Localization key.
 * @returns {string} Localized string.
 */
export function getSQLQuestionL10nValue(l10n = {}, key) {
  const hasOwnOverride = typeof l10n === 'object'
    && l10n !== null
    && Object.prototype.hasOwnProperty.call(l10n, key);

  const ownValue = hasOwnOverride ? l10n[key] : undefined;
  const value = typeof ownValue === 'string' && ownValue !== ''
    ? ownValue
    : getLibraryString(key);

  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing SQLQuestion language key: ${key}`);
  }

  return value;
}

/**
 * Format a localized SQLQuestion string with placeholder replacements.
 * @param {object} l10n - Localization map.
 * @param {string} key - Localization key.
 * @param {object} replacements - Placeholder replacements.
 * @returns {string} Formatted localized string.
 */
export function tSQLQuestion(l10n = {}, key, replacements = {}) {
  let message = getSQLQuestionL10nValue(l10n, key);

  Object.keys(replacements).forEach((replacementKey) => {
    message = message.replace(
      new RegExp(`\\{${replacementKey}\\}`, 'g'),
      replacements[replacementKey],
    );
  });

  return message;
}