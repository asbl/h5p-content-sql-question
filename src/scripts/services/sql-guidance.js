const SQL_RESERVED_WORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'avg', 'between', 'by', 'case',
  'count', 'create', 'cross', 'delete', 'desc', 'distinct', 'drop', 'else',
  'end', 'exists', 'false', 'from', 'group', 'having', 'if', 'in', 'inner',
  'insert', 'into', 'is', 'join', 'left', 'length', 'like', 'limit', 'lower',
  'max', 'min', 'natural', 'not', 'null', 'offset', 'on', 'or', 'order',
  'outer', 'over', 'partition', 'pragma', 'references', 'right', 'round',
  'row_number', 'select', 'set', 'substr', 'sum', 'table', 'then', 'top',
  'true', 'union', 'update', 'upper', 'values', 'view', 'when', 'where',
  'with',
]);

const CLAUSE_PATTERNS = [
  /\bselect\b([\s\S]*?)\bfrom\b/gi,
  /\bwhere\b([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\blimit\b|\boffset\b|$)/gi,
  /\bgroup\s+by\b([\s\S]*?)(?=\border\s+by\b|\blimit\b|\boffset\b|$)/gi,
  /\border\s+by\b([\s\S]*?)(?=\blimit\b|\boffset\b|$)/gi,
];

function normalizeIdentifier(value = '') {
  return String(value || '').trim().replace(/^"|"$/g, '').toLowerCase();
}

function getTablePayload(tableResult) {
  if (Array.isArray(tableResult)) {
    return tableResult[0] || null;
  }

  return tableResult || null;
}

function levenshteinDistance(left = '', right = '') {
  const source = left.toLowerCase();
  const target = right.toLowerCase();

  if (source === target) {
    return 0;
  }

  if (source.length === 0) {
    return target.length;
  }

  if (target.length === 0) {
    return source.length;
  }

  const matrix = Array.from({ length: source.length + 1 }, () => new Array(target.length + 1).fill(0));

  for (let row = 0; row <= source.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= target.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return matrix[source.length][target.length];
}

function findClosestIdentifier(identifier, candidates = []) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  let bestCandidate = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate) => {
    const distance = levenshteinDistance(normalizedIdentifier, normalizeIdentifier(candidate));

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = candidate;
    }
  });

  if (!bestCandidate) {
    return null;
  }

  const threshold = Math.max(1, Math.min(3, Math.floor(bestCandidate.length / 3)));
  return bestDistance <= threshold ? bestCandidate : null;
}

function previousWord(text = '', index = 0) {
  const before = text.slice(0, index).trimEnd();
  const match = before.match(/([A-Za-z_][\w]*)$/);
  return normalizeIdentifier(match?.[1] || '');
}

function nextNonWhitespace(text = '', index = 0) {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (!/\s/.test(char)) {
      return char;
    }
  }

  return '';
}

function pushDiagnostic(target, diagnostic) {
  if (!diagnostic || typeof diagnostic.from !== 'number' || typeof diagnostic.to !== 'number') {
    return;
  }

  const exists = target.some((entry) => entry.from === diagnostic.from && entry.to === diagnostic.to);
  if (!exists) {
    target.push(diagnostic);
  }
}

export function buildSQLSchema(tableResults = new Map()) {
  const tables = {};
  const allColumns = new Set();

  if (!(tableResults instanceof Map)) {
    return {
      tables,
      tableNames: [],
      allColumns: [],
    };
  }

  tableResults.forEach((tableResult, tableName) => {
    const payload = getTablePayload(tableResult);
    const columns = Array.isArray(payload?.columns) ? payload.columns : [];
    const normalizedTableName = normalizeIdentifier(tableName);

    tables[normalizedTableName] = {
      name: tableName,
      columns,
      normalizedColumns: columns.map((column) => normalizeIdentifier(column)),
    };

    columns.forEach((column) => allColumns.add(column));
  });

  return {
    tables,
    tableNames: Object.values(tables).map((table) => table.name),
    allColumns: Array.from(allColumns),
  };
}

export function analyzeSQLHints(code = '', schema = { tables: {}, tableNames: [], allColumns: [] }) {
  const diagnostics = [];
  const tableNames = Array.isArray(schema.tableNames) ? schema.tableNames : [];
  const allColumns = Array.isArray(schema.allColumns) ? schema.allColumns : [];
  const normalizedTables = schema.tables || {};

  const tablePattern = /\b(from|join|update|into|table)\s+([A-Za-z_][\w]*)\b/gi;
  let match;

  while ((match = tablePattern.exec(code)) !== null) {
    const [, , tableName] = match;
    const normalizedName = normalizeIdentifier(tableName);

    if (normalizedTables[normalizedName]) {
      continue;
    }

    const offset = match.index + match[0].lastIndexOf(tableName);
    pushDiagnostic(diagnostics, {
      type: 'unknown-table',
      identifier: tableName,
      suggestion: findClosestIdentifier(tableName, tableNames),
      from: offset,
      to: offset + tableName.length,
      severity: 'warning',
    });
  }

  const qualifiedColumnPattern = /\b([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)\b/g;
  while ((match = qualifiedColumnPattern.exec(code)) !== null) {
    const [, tableName, columnName] = match;
    const normalizedTableName = normalizeIdentifier(tableName);
    const table = normalizedTables[normalizedTableName];

    if (!table) {
      continue;
    }

    if (table.normalizedColumns.includes(normalizeIdentifier(columnName))) {
      continue;
    }

    const offset = match.index + tableName.length + 1;
    pushDiagnostic(diagnostics, {
      type: 'unknown-column',
      identifier: columnName,
      tableName: table.name,
      suggestion: findClosestIdentifier(columnName, table.columns),
      from: offset,
      to: offset + columnName.length,
      severity: 'warning',
    });
  }

  CLAUSE_PATTERNS.forEach((pattern) => {
    while ((match = pattern.exec(code)) !== null) {
      const clauseText = match[1] || '';
      const clauseOffset = match.index + match[0].indexOf(clauseText);
      const identifierPattern = /\b([A-Za-z_][\w]*)\b/g;
      let identifierMatch;

      while ((identifierMatch = identifierPattern.exec(clauseText)) !== null) {
        const identifier = identifierMatch[1];
        const normalizedIdentifier = normalizeIdentifier(identifier);
        const previous = previousWord(clauseText, identifierMatch.index);
        const nextCharacter = nextNonWhitespace(clauseText, identifierMatch.index + identifier.length);

        if (
          SQL_RESERVED_WORDS.has(normalizedIdentifier)
          || normalizedTables[normalizedIdentifier]
          || allColumns.some((column) => normalizeIdentifier(column) === normalizedIdentifier)
          || previous === 'as'
          || clauseText[identifierMatch.index - 1] === '.'
          || nextCharacter === '.'
          || nextCharacter === '('
        ) {
          continue;
        }

        const from = clauseOffset + identifierMatch.index;
        pushDiagnostic(diagnostics, {
          type: 'unknown-column',
          identifier,
          suggestion: findClosestIdentifier(identifier, allColumns),
          from,
          to: from + identifier.length,
          severity: 'warning',
        });
      }
    }
  });

  return diagnostics.sort((left, right) => left.from - right.from);
}