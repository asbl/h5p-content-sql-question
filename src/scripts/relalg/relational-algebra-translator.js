/**
 * Relational-Algebra → SQL translator.
 *
 * Consumes the normalised output that MathLive produces via
 * `convertLatexToAsciiMath(laTeX)`:
 *
 *   "\\sigma_{x=1}(R)"           ->  "sigma_(x=1)(R)"
 *   "\\pi_{a,b}(R)"              ->  "pi_(a,b)(R)"
 *   "\\pi_{a}(R)"                ->  "pi_a(R)"          (single arg, no parens)
 *   "R \\bowtie S"               ->  "R|><|S"
 *   "R \\bowtie_{a=b} S"         ->  "R|><|_(a=b)S"
 *   "R \\cup S"                  ->  "R\u222aS"        (UNION)
 *   "R \\cap S"                  ->  "R\u2229S"        (INTERSECT)
 *   "R - S"                      ->  "R-S"             (EXCEPT)
 *   "R \\times S"                ->  "RxxS"            (CROSS JOIN)
 *   "\\rho_{T(a,b)}(R)"          ->  "rho_(T(a,b))(R)"
 *
 * The input is first run through a small lexer, then a recursive-descent
 * parser builds an AST which is finally rendered to a SQLite-compatible
 * SELECT statement.
 */

// ── Operator tables ───────────────────────────────────────────────────────

const UNARY_OP_NAMES = new Set(['sigma', 'pi', 'rho']);

const OP_TO_NODE = {
  sigma: 'select',
  pi: 'project',
  rho: 'rename',
  '\u222a': 'union', // ∪
  '\u2229': 'intersect', // ∩
  '\u2212': 'difference', // − (U+2212 math minus)
  '-': 'difference', // ASCII minus as set difference
  '|><|': 'join',
  '|><': 'join',
  '><': 'cross',
  'xx': 'cross',
};

const BINARY_OPS = new Set([
  '\u222a', '\u2229', '\u2212', '-', '|><|', '|><', '><', 'xx',
]);

const JOIN_OPS = new Set(['|><|', '|><']);

const CONDITION_UNICODE = {
  '\u2264': '<=',
  '\u2265': '>=',
  '\u2260': '!=',
  '\u2227': 'and', // ∧
  '\u2228': 'or', // ∨
  '\u00ac': 'not', // ¬
};

// ── Tokenizer ─────────────────────────────────────────────────────────────
//
// Note: `_` is NOT an identifier character here. In the AsciiMath output it
// marks a subscript (sigma_(...), pi_a) and must remain its own token so the
// parser can consume it.

function tokenize(input) {
  const tokens = [];
  let i = 0;
  const src = String(input ?? '');

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      tokens.push({ type: 'space', value: ch, pos: i });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, pos: i });
      i += 1;
      continue;
    }

    // Subscript marker.
    if (ch === '_') {
      tokens.push({ type: 'char', value: ch, pos: i });
      i += 1;
      continue;
    }

    // Join operators |><| and |><
    if (src.startsWith('|><|', i)) {
      tokens.push({ type: 'op', value: '|><|', pos: i });
      i += 4;
      continue;
    }
    if (src.startsWith('|><', i)) {
      tokens.push({ type: 'op', value: '|><', pos: i });
      i += 3;
      continue;
    }

    // Cross product `><` (checked before identifiers since `>`/`<` are plain chars).
    if (src.startsWith('><', i)) {
      tokens.push({ type: 'op', value: '><', pos: i });
      i += 2;
      continue;
    }

    // Cross product `xx` (AsciiMath for \times). Must be checked before the
    // word-operator and identifier branches, otherwise it is swallowed.
    if (src.startsWith('xx', i)) {
      tokens.push({ type: 'op', value: 'xx', pos: i });
      i += 2;
      continue;
    }

    // Word operators: sigma, pi, rho
    const wordOp = readWordOperator(src, i);
    if (wordOp) {
      tokens.push({ type: 'op', value: wordOp.value, pos: i });
      i = wordOp.end;
      continue;
    }

    // Single-char set operators (union ∪, intersect ∩, math minus −, ASCII minus)
    if (OP_TO_NODE[ch] && !UNARY_OP_NAMES.has(String(ch).toLowerCase())) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i += 1;
      continue;
    }

    // Relation name or condition fragment
    const ident = readIdentifier(src, i);
    if (ident) {
      tokens.push({ type: 'ident', value: ident.value, pos: i });
      i = ident.end;
      continue;
    }

    // Any other character inside a subscript condition.
    tokens.push({ type: 'char', value: ch, pos: i });
    i += 1;
  }

  return tokens;
}

function readWordOperator(src, start) {
  let end = start;
  while (end < src.length && /[A-Za-z]/.test(src[end])) end += 1;
  const name = src.slice(start, end).toLowerCase();

  if (!UNARY_OP_NAMES.has(name)) {
    return null;
  }

  return { value: name, end };
}

function isIdentStart(ch) {
  if (!ch) return false;
  return /[A-Za-z"\u00c0-\u024f]/.test(ch);
}

function isIdentChar(ch) {
  if (!ch) return false;
  return /[A-Za-z0-9"\u00c0-\u024f]/.test(ch);
}

function isDigit(ch) {
  return /[0-9]/.test(ch);
}

function readIdentifier(src, start) {
  const ch = src[start];
  if (!(isIdentStart(ch) || isDigit(ch))) return null;

  let end = start;

  if (ch === '"') {
    end = start + 1;
    while (end < src.length && src[end] !== '"') end += 1;
    end += 1; // closing quote
    return { value: src.slice(start, end), end };
  }

  while (end < src.length) {
    const remaining = src.slice(end);
    // Stop at binary operator sequences so `RxxS` splits into R, xx, S.
    if (remaining.startsWith('xx') || remaining.startsWith('><') || remaining.startsWith('|><')) {
      break;
    }
    if (!isIdentChar(src[end])) break;
    end += 1;
  }

  if (end === start) return null;
  return { value: src.slice(start, end), end };
}

// ── Condition normalisation ───────────────────────────────────────────────

function normaliseCondition(raw) {
  let out = String(raw ?? '').trim();
  for (const [uni, sql] of Object.entries(CONDITION_UNICODE)) {
    out = out.split(uni).join(` ${sql} `);
  }
  out = out.replace(/ not \s+/gi, ' NOT ');
  out = out.replace(/\band\b/gi, 'AND');
  out = out.replace(/\bor\b/gi, 'OR');
  out = quoteBarewordStringLiterals(out);
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Quotes bareword operands on the right-hand side of a comparison operator.
 *
 * MathLive renders both `\sigma_{c=Europe}(R)` and `\sigma_{c=5}(R)` with
 * the right operand as a bareword identifier (Europe, 5). SQL distinguishes
 * string literals from identifiers/numbers, so a bareword like `Europe` would
 * be interpreted as a column name and fail. Since relational algebra in
 * teaching conventionally treats the right side of `=` as a value, we quote
 * barewords that are neither numeric nor already quoted.
 */
function quoteBarewordStringLiterals(condition) {
  // Match `left OP right` triples, preserving surrounding whitespace.
  // Left must start with a word char (column/identifier); right is the value.
  return condition.replace(
    /(\b[A-Za-z_][\w.]*\b\s*)(<=|>=|!=|<|>|=)(\s*)(?!'|-?\d)([A-Za-z_][\w.]*)\b/g,
    (_m, left, op, sp, right) => `${left}${op}${sp}'${right}'`,
  );
}

// ── Parser ────────────────────────────────────────────────────────────────

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos] ?? null;
  }

  next() {
    return this.tokens[this.pos++] ?? null;
  }

  expect(type) {
    const tok = this.next();
    if (!tok || tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok ? tok.type : 'EOF'} at ${tok?.pos ?? this.pos}`);
    }
    return tok;
  }

  parse() {
    const node = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token after expression: ${JSON.stringify(this.tokens[this.pos])}`);
    }
    return node;
  }

  parseExpression() {
    const left = this.parsePrimary();

    let node = left;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      this.skipSpace();
      const tok = this.peek();
      if (!tok || tok.type !== 'op' || !BINARY_OPS.has(tok.value)) break;

      this.next();

      let condition = null;
      if (JOIN_OPS.has(tok.value)) {
        condition = this.tryReadJoinSubscript();
      }

      const right = this.parsePrimary();
      node = { type: OP_TO_NODE[tok.value], left: node, right, condition };
    }

    return node;
  }

  parsePrimary() {
    this.skipSpace();
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of input');

    // Unary operators: sigma_(...)(R), pi_a(R), rho_(...)(R)
    if (tok.type === 'op' && UNARY_OP_NAMES.has(tok.value)) {
      this.next();
      const args = this.tryReadUnarySubscript();
      if (args === null) {
        throw new Error(`Operator "${tok.value}" requires a subscript`);
      }
      const operand = this.parsePrimary();
      return { type: OP_TO_NODE[tok.value], args, operand };
    }

    if (tok.type === 'lparen') {
      this.next();
      const inner = this.parseExpression();
      this.expect('rparen');
      return inner;
    }

    if (tok.type === 'ident') {
      this.next();
      return { type: 'relation', name: tok.value };
    }

    throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
  }

  /**
   * Reads a unary-operator subscript. MathLive emits it parenthesised
   * (`sigma_(a>1)`) or, for single bare arguments, without parentheses
   * (`pi_a(R)`). Both forms are accepted.
   */
  tryReadUnarySubscript() {
    this.skipSpace();
    // The AsciiMath subscript marker `_` is optional; some forms omit it.
    if (this.peek()?.type === 'char' && this.peek()?.value === '_') {
      this.next();
    }

    this.skipSpace();
    const after = this.peek();

    if (after?.type === 'lparen') {
      return this.readParenthesisedText();
    }

    // Bare single-argument subscript (e.g. pi_a(R)).
    if (after?.type === 'ident') {
      this.next();
      return after.value;
    }

    return null;
  }

  /**
   * Reads an optional theta-join subscript: the `_` marker plus a
   * parenthesised condition, e.g. `_(a=b)`. Returns null when absent
   * (plain natural join).
   */
  tryReadJoinSubscript() {
    this.skipSpace();
    const tok = this.peek();
    if (!tok || tok.type !== 'char' || tok.value !== '_') return null;
    this.next();

    this.skipSpace();
    const after = this.peek();
    if (after?.type === 'lparen') {
      return this.readParenthesisedText();
    }

    if (after?.type === 'ident') {
      this.next();
      return after.value;
    }

    return null;
  }

  /**
   * Collects a balanced `(...)` group as raw text. Assumes the current token
   * is `lparen`.
   */
  readParenthesisedText() {
    this.next(); // consume lparen
    let depth = 1;
    const start = this.pos;
    while (this.pos < this.tokens.length && depth > 0) {
      const t = this.tokens[this.pos];
      if (t.type === 'lparen') depth += 1;
      else if (t.type === 'rparen') {
        depth -= 1;
        if (depth === 0) break;
      }
      this.pos += 1;
    }
    const end = this.pos;
    this.expect('rparen');
    return this.tokens.slice(start, end).map(tokenText).join('').trim();
  }

  skipSpace() {
    while (this.pos < this.tokens.length && this.tokens[this.pos].type === 'space') {
      this.pos += 1;
    }
  }
}

function tokenText(tok) {
  if (tok.type === 'space') return ' ';
  if (tok.type === 'comma') return ', ';
  if (tok.type === 'ident') return tok.value;
  if (tok.type === 'char') return tok.value;
  if (tok.type === 'op') return ` ${tok.value} `;
  return tok.value;
}

// ── AST → SQL ─────────────────────────────────────────────────────────────

let aliasCounter = 0;

function resetAliasCounter() {
  aliasCounter = 0;
}

function nextAlias() {
  aliasCounter += 1;
  return `ra${aliasCounter}`;
}

function toSelect(node) {
  const query = toQuery(node);
  if (query) {
    return {
      sql: renderQuery(query),
      alias: query.alias,
    };
  }

  switch (node.type) {
    case 'rename':
      return applyRename(node);
    case 'cross':
      return applyCross(node);
    case 'join':
      return applyJoin(node);
    case 'union':
      return applySetOp(node, 'UNION');
    case 'intersect':
      return applySetOp(node, 'INTERSECT');
    case 'difference':
      return applySetOp(node, 'EXCEPT');
    default:
      throw new Error(`Unknown AST node type: ${node.type}`);
  }
}

function toQuery(node) {
  switch (node.type) {
    case 'relation':
      return relationToQuery(node);
    case 'select':
      return applySelectToQuery(node);
    case 'project':
      return applyProjectToQuery(node);
    default:
      return null;
  }
}

function relationToQuery(node) {
  const name = unquote(node.name);
  const alias = nextAlias();
  return {
    columns: '*',
    from: quoteIdent(name),
    where: [],
    alias,
  };
}

function applySelectToQuery(node) {
  const inner = toQuery(node.operand);
  if (!inner) return null;

  const condition = normaliseCondition(node.args);
  return {
    ...inner,
    where: [...inner.where, condition],
    alias: inner.alias,
  };
}

function applyProjectToQuery(node) {
  const inner = toQuery(node.operand);
  if (!inner) return null;

  const columns = normaliseProjection(node.args);
  return {
    ...inner,
    columns,
    alias: inner.alias,
  };
}

function renderQuery(query) {
  const where = query.where.length ? ` WHERE ${query.where.join(' AND ')}` : '';
  return `SELECT ${query.columns} FROM ${query.from}${where}`;
}

function applyRename(node) {
  // rho_{NewName}(R): rename the relation. Per-column rename would need
  // schema introspection and is not applied statically.
  const inner = toSelect(node.operand);
  const spec = String(node.args ?? '').trim();
  const match = spec.match(/^([A-Za-z_][\w]*)\s*(?:\(([^)]*)\))?$/);
  if (!match) {
    throw new Error(`Unsupported rename spec: "${spec}"`);
  }
  const newName = match[1];
  return {
    sql: `SELECT * FROM (${inner.sql}) AS ${newName}`,
    alias: newName,
  };
}

function applyCross(node) {
  const left = toSelect(node.left);
  const right = toSelect(node.right);
  const alias = nextAlias();
  return {
    sql: `SELECT * FROM (${left.sql}) AS ${left.alias} CROSS JOIN (${right.sql}) AS ${right.alias}`,
    alias,
  };
}

function applyJoin(node) {
  const left = toSelect(node.left);
  const right = toSelect(node.right);
  const alias = nextAlias();

  if (node.condition) {
    const on = normaliseCondition(node.condition);
    return {
      sql: `SELECT * FROM (${left.sql}) AS ${left.alias} JOIN (${right.sql}) AS ${right.alias} ON ${on}`,
      alias,
    };
  }

  // Natural join needs schema knowledge (USING). Fall back to cross join;
  // callers wanting join semantics use an explicit theta condition.
  return {
    sql: `SELECT * FROM (${left.sql}) AS ${left.alias} CROSS JOIN (${right.sql}) AS ${right.alias}`,
    alias,
  };
}

function applySetOp(node, op) {
  const left = toSelect(node.left);
  const right = toSelect(node.right);
  const alias = nextAlias();
  return {
    sql: `SELECT * FROM (${left.sql} ${op} ${right.sql}) AS ${alias}`,
    alias,
  };
}

function normaliseProjection(raw) {
  let out = String(raw ?? '').trim();
  out = out.replace(/,\s*/g, ', ');
  if (!out) return '*';
  return out;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function unquote(name) {
  const s = String(name ?? '').trim();
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/""/g, '"');
  }
  return s;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Translates a normalised relational-algebra expression (AsciiMath form as
 * produced by MathLive's `convertLatexToAsciiMath`) into a SQLite-compatible
 * SELECT statement.
 *
 * @param {string} raExpression Normalised RA expression, e.g. "sigma_(x=1)(R)".
 * @returns {string} SQL SELECT statement.
 */
export function translateToSQL(raExpression) {
  const tokens = tokenize(raExpression);
  if (tokens.length === 0) return '';

  const parser = new Parser(tokens);
  const ast = parser.parse();

  resetAliasCounter();
  const { sql } = toSelect(ast);
  return sql;
}

/**
 * Convenience wrapper: accepts raw MathLive LaTeX, converts it to the
 * normalised AsciiMath form via `convertLatexToAsciiMath`, then translates.
 * Requires the mathlive runtime to be available.
 *
 * @param {string} latex MathLive LaTeX string.
 * @returns {string} SQL SELECT statement.
 */
export function translateLaTeXToSQL(latex, { convertLatexToAsciiMath } = {}) {
  const convert = convertLatexToAsciiMath
    || globalThis.MathfieldElement?.convertLatexToAsciiMath
    || globalThis.convertLatexToAsciiMath;

  const normalized = typeof convert === 'function'
    ? convert(latex)
    : normalizeRelationalAlgebraLatex(latex);
  return translateToSQL(normalized);
}

function normalizeRelationalAlgebraLatex(latex) {
  let out = String(latex ?? '');

  out = out
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\sigma/g, 'sigma')
    .replace(/\\pi/g, 'pi')
    .replace(/\\rho/g, 'rho')
    .replace(/\\bowtie/g, '|><|')
    .replace(/\\times/g, 'xx')
    .replace(/\\cup/g, '\u222a')
    .replace(/\\cap/g, '\u2229')
    .replace(/\\land/g, '\u2227')
    .replace(/\\lor/g, '\u2228')
    .replace(/\\lnot/g, '\u00ac')
    .replace(/\\neg/g, '\u00ac')
    .replace(/\\leq?/g, '\u2264')
    .replace(/\\geq?/g, '\u2265')
    .replace(/\\neq?/g, '\u2260');

  out = unwrapLatexTextCommands(out);
  out = replaceBalancedGroups(out, '_{', '_(', ')');
  out = replaceBalancedGroups(out, '{', '(', ')');
  return joinSpacedIdentifierLetters(out);
}

function unwrapLatexTextCommands(input) {
  let out = String(input ?? '');
  for (const command of ['\\mathrm', '\\operatorname', '\\text']) {
    out = replaceBalancedGroups(out, `${command}{`, '', '');
  }
  return out;
}

function joinSpacedIdentifierLetters(input) {
  let previous = null;
  let current = String(input ?? '');

  while (current !== previous) {
    previous = current;
    current = current.replace(
      /(^|[^A-Za-z0-9"])((?:[A-Za-z]\s+)+[A-Za-z])(?=$|[^A-Za-z0-9"])/g,
      (_match, prefix, letters) => `${prefix}${letters.replace(/\s+/g, '')}`,
    );
  }

  return current;
}

function replaceBalancedGroups(input, opener, replacementOpen, replacementClose) {
  let out = '';
  let index = 0;

  while (index < input.length) {
    if (!input.startsWith(opener, index)) {
      out += input[index];
      index += 1;
      continue;
    }

    const groupStart = index + opener.length;
    let depth = 1;
    let cursor = groupStart;

    while (cursor < input.length && depth > 0) {
      const ch = input[cursor];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      if (depth > 0) cursor += 1;
    }

    if (depth !== 0) {
      out += opener;
      index = groupStart;
      continue;
    }

    const inner = input.slice(groupStart, cursor);
    out += `${replacementOpen}${replaceBalancedGroups(inner, opener, replacementOpen, replacementClose)}${replacementClose}`;
    index = cursor + 1;
  }

  return out;
}
