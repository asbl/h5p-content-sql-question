/**
 * Relational-Algebra virtual keyboard layout for MathLive.
 *
 * Provides keycaps for all operators supported by the translator. Each keycap
 * is a LaTeX fragment that MathLive inserts verbatim, including placeholder
 * tokens (#?) for arguments the learner is expected to fill.
 *
 * Categories follow the conventional grouping used in database courses:
 *   - Selection / Projection / Rename (unary operators with subscript)
 *   - Joins and set operations (binary operators)
 *   - Conditions (comparison + logic operators)
 */

const UNARY_KEYCAPS = [
  { latex: '\\sigma_{#?}(#0)', aside: 'σ Selektion' },
  { latex: '\\pi_{#?}(#0)', aside: 'π Projektion' },
  { latex: '\\rho_{#?}(#0)', aside: 'ρ Umbenennung' },
];

const BINARY_KEYCAPS = [
  '\\bowtie',
  '\\times',
  '\\cup',
  '\\cap',
  '-',
];

const CONDITION_KEYCAPS = [
  '=',
  '\\ne',
  '\\le',
  '\\ge',
  '<',
  '>',
  '\\land',
  '\\lor',
  '\\lnot',
];

/**
 * Builds a MathLive virtual keyboard layout for relational algebra.
 *
 * Combines the RA operator rows with a numeric row so learners can type
 * complete expressions from the on-screen keyboard alone.
 *
 * @returns {object} MathLive layout object suitable for `mathVirtualKeyboard.layouts`.
 */
export function buildRelationalAlgebraKeyboardLayout() {
  return {
    label: 'Relationale Algebra',
    tooltip: 'Operatoren der relationalen Algebra',
    rows: [
      UNARY_KEYCAPS.map(toKeycap),
      BINARY_KEYCAPS.map(toKeycap),
      CONDITION_KEYCAPS.map(toKeycap),
      ['[7]', '[8]', '[9]', '[+]'],
      ['[4]', '[5]', '[6]', '[-]'],
      ['[1]', '[2]', '[3]', '\\cdot'],
      [{ label: '[0]', width: 2 }, '[.]', '[(]', '[)]', '[backspace]'],
    ],
  };
}

function toKeycap(entry) {
  if (typeof entry === 'string') {
    return { latex: entry, class: 'small' };
  }
  return entry;
}
