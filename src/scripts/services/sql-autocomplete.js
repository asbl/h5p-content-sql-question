const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'ON',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'AS',
  'AND',
  'OR',
  'NOT',
  'IN',
  'LIKE',
  'BETWEEN',
  'COUNT',
  'AVG',
  'SUM',
  'MIN',
  'MAX',
  'ROUND',
  'LENGTH',
  'LOWER',
  'UPPER',
  'SUBSTR',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'UPDATE',
  'SET',
  'INSERT INTO',
  'VALUES',
  'DELETE',
  'CREATE TABLE',
];

const POST_TABLE_KEYWORDS = new Set([
  'WHERE',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
]);

function normalizeIdentifier(value = '') {
  return String(value || '').trim().replace(/^"|"$/g, '').toLowerCase();
}

function getKeywordCompletions() {
  return SQL_KEYWORDS.map((label) => ({
    label,
    type: 'keyword',
    apply: label,
  }));
}

function getColumnIndex(schema = { tables: {} }) {
  const columnIndex = new Map();

  Object.values(schema.tables || {}).forEach((table) => {
    table.columns.forEach((column) => {
      const normalizedColumn = normalizeIdentifier(column);
      const existing = columnIndex.get(normalizedColumn) || {
        label: column,
        tables: new Set(),
      };

      existing.tables.add(table.name);
      columnIndex.set(normalizedColumn, existing);
    });
  });

  return columnIndex;
}

function extractAliases(code = '', schema = { tables: {} }) {
  const aliases = new Map();
  const aliasPattern = /\b(from|join|update|into)\s+([A-Za-z_][\w]*)\s+(?:as\s+)?([A-Za-z_][\w]*)\b/gi;
  let match;

  while ((match = aliasPattern.exec(code)) !== null) {
    const tableName = match[2];
    const aliasName = match[3];
    const normalizedTableName = normalizeIdentifier(tableName);
    const normalizedAliasName = normalizeIdentifier(aliasName);

    if (!schema.tables?.[normalizedTableName] || normalizedAliasName === normalizedTableName) {
      continue;
    }

    aliases.set(normalizedAliasName, {
      name: aliasName,
      tableName: schema.tables[normalizedTableName].name,
      columns: schema.tables[normalizedTableName].columns,
    });
  }

  return aliases;
}

function getClauseContext(beforeCursor = '') {
  if (!beforeCursor.trim()) {
    return 'keyword';
  }

  const clausePattern = /\b(select|from|join|where|having|on|update|into|set|group\s+by|order\s+by)\b/gi;
  let match;
  let lastClause = 'default';
  let lastClauseIndex = -1;
  let lastClauseText = '';

  while ((match = clausePattern.exec(beforeCursor)) !== null) {
    lastClause = normalizeIdentifier(match[1]).replace(/\s+/g, ' ');
    lastClauseIndex = match.index;
    lastClauseText = match[0];
  }

  const clauseTail = lastClauseIndex >= 0
    ? beforeCursor.slice(lastClauseIndex + lastClauseText.length)
    : beforeCursor;
  const trimmedClauseTail = clauseTail.trim();
  const endsInWhitespace = /\s$/.test(beforeCursor);

  if (['from', 'join', 'update', 'into'].includes(lastClause)) {
    const tailWords = trimmedClauseTail.split(/\s+/).filter(Boolean);
    const trailingWord = tailWords[tailWords.length - 1] || '';
    const matchesClauseKeywordPrefix = trailingWord
      ? SQL_KEYWORDS.some((keyword) => keyword.startsWith(trailingWord.toUpperCase()))
      : false;

    if (tailWords.length >= 2 && matchesClauseKeywordPrefix) {
      return 'post-table';
    }

    if (
      trimmedClauseTail
      && endsInWhitespace
      && /^[A-Za-z_][\w]*(?:\s+(?:as\s+)?[A-Za-z_][\w]*)?$/i.test(trimmedClauseTail)
    ) {
      return 'post-table';
    }

    return 'table';
  }

  if (['select', 'where', 'having', 'on', 'set', 'group by', 'order by'].includes(lastClause)) {
    return 'column';
  }

  return 'keyword';
}

function getCompletionAnchor(context) {
  const word = context.matchBefore(/[A-Za-z_][\w]*/);
  if (word) {
    return {
      from: word.from,
      prefix: word.text,
    };
  }

  return {
    from: context.pos,
    prefix: '',
  };
}

function matchesPrefix(label, prefix) {
  if (!prefix) {
    return true;
  }

  return String(label || '').toLowerCase().startsWith(prefix.toLowerCase());
}

function getMatchStrength(label, prefix) {
  if (!prefix) {
    return 0;
  }

  const normalizedLabel = String(label || '').toLowerCase();
  const normalizedPrefix = String(prefix || '').toLowerCase();

  if (normalizedLabel === normalizedPrefix) {
    return 60;
  }

  if (normalizedLabel.startsWith(normalizedPrefix)) {
    return 40;
  }

  return 0;
}

function uniqueCompletions(completions = []) {
  const byKey = new Map();

  completions.forEach((completion) => {
    const key = `${completion.label}::${completion.type || ''}`;
    const existing = byKey.get(key);

    if (!existing || (completion.boost || 0) > (existing.boost || 0)) {
      byKey.set(key, completion);
    }
  });

  return Array.from(byKey.values());
}

function buildTableCompletions(schema, clauseContext) {
  return Object.values(schema.tables || {}).map((table) => ({
    label: table.name,
    type: 'type',
    detail: 'table',
    boost: clauseContext === 'table' ? 200 : 25,
  }));
}

function buildAliasCompletions(aliases, clauseContext) {
  return Array.from(aliases.values()).map((alias) => ({
    label: alias.name,
    type: 'variable',
    detail: `alias for ${alias.tableName}`,
    boost: clauseContext === 'column' ? 120 : 40,
  }));
}

function buildColumnCompletions(schema, aliases, clauseContext) {
  const columnIndex = getColumnIndex(schema);

  return Array.from(columnIndex.values()).map((column) => ({
    label: column.label,
    type: 'property',
    detail: Array.from(column.tables).join(', '),
    boost: clauseContext === 'column' ? 220 : 50,
  }));
}

function buildQualifiedColumnCompletions(qualifier, schema, aliases) {
  const normalizedQualifier = normalizeIdentifier(qualifier);
  const aliasMatch = aliases.get(normalizedQualifier);
  const tableMatch = aliasMatch
    ? schema.tables?.[normalizeIdentifier(aliasMatch.tableName)]
    : schema.tables?.[normalizedQualifier];

  if (!tableMatch) {
    return [];
  }

  return tableMatch.columns.map((column) => ({
    label: column,
    type: 'property',
    detail: aliasMatch ? `${aliasMatch.name} -> ${tableMatch.name}` : tableMatch.name,
    boost: 180,
  }));
}

function buildKeywordCompletions(clauseContext) {
  return getKeywordCompletions().map((completion) => {
    let boost = 90;

    if (clauseContext === 'keyword') {
      boost = 220;
    }
    else if (clauseContext === 'post-table') {
      boost = POST_TABLE_KEYWORDS.has(completion.label) ? 260 : 70;
    }
    else if (clauseContext === 'table') {
      boost = completion.label === 'FROM' || completion.label.endsWith('JOIN') ? 80 : 25;
    }
    else if (clauseContext === 'column') {
      boost = completion.label === 'WHERE' ? 140 : 60;
    }

    return {
      ...completion,
      boost,
    };
  });
}

export function createSQLCompletionSource(schema = { tables: {}, tableNames: [], allColumns: [] }) {
  return (context) => {
    const code = context.state.doc.toString();
    const beforeCursor = code.slice(0, context.pos);
    const qualifiedMatch = beforeCursor.match(/([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)?$/);
    const aliases = extractAliases(code, schema);
    const clauseContext = qualifiedMatch ? 'qualified-column' : getClauseContext(beforeCursor);
    const anchor = getCompletionAnchor(context);
    const prefix = qualifiedMatch ? (qualifiedMatch[2] || '') : anchor.prefix;
    const from = qualifiedMatch ? context.pos - prefix.length : anchor.from;

    if (!context.explicit && !prefix && !qualifiedMatch) {
      return null;
    }

    const completions = qualifiedMatch
      ? buildQualifiedColumnCompletions(qualifiedMatch[1], schema, aliases)
      : [
        ...buildColumnCompletions(schema, aliases, clauseContext),
        ...buildTableCompletions(schema, clauseContext),
        ...buildAliasCompletions(aliases, clauseContext),
        ...buildKeywordCompletions(clauseContext),
      ];

    const options = uniqueCompletions(completions)
      .filter((completion) => matchesPrefix(completion.label, prefix))
      .sort((left, right) => {
        const boostDelta = ((right.boost || 0) + getMatchStrength(right.label, prefix))
          - ((left.boost || 0) + getMatchStrength(left.label, prefix));

        return boostDelta || left.label.localeCompare(right.label);
      });

    if (options.length === 0) {
      return null;
    }

    return {
      from,
      options,
      filter: false,
      validFor: /^[A-Za-z_\w]*$/,
    };
  };
}

export function extractSQLAliases(code = '', schema = { tables: {} }) {
  return extractAliases(code, schema);
}

export function detectSQLClauseContext(code = '', cursorPos = code.length) {
  return getClauseContext(String(code || '').slice(0, cursorPos));
}