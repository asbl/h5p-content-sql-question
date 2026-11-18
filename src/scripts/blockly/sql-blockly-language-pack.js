// Colors matching nicolaipoehner/blocklysql reference
const CLAUSE_COLOUR = '#8007f2';
const DATA_COLOUR = '#f1bf06';
const COMPARE_COLOUR = '#3ED9D9';
const LOGIC_COLOUR = '#5270DE';
const AGGREGATE_COLOUR = '#C440C4';
const VALUE_COLOUR = '#FC4758';
const ALIAS_COLOUR = '#0ddb69';
const MATH_COLOUR = '#5BE5E5';

// ── Code generation helpers ────────────────────────────────────────────────

function sqlFromInput(block, inputName) {
  const target = block.getInput?.(inputName)?.connection?.targetBlock?.();
  return target ? sqlFromBlock(target) : null;
}

function sqlFromBlock(block) {
  if (!block) return null;
  switch (block.type) {
    case 'sql_star':
      return '*';

    case 'sql_column': {
      const name = (block.getFieldValue('NAME') || '').trim();
      return name || null;
    }

    case 'sql_number':
      return String(block.getFieldValue('NUM') ?? '');

    case 'sql_string': {
      const raw = (block.getFieldValue('TEXT') || '').replace(/'/g, '\'\'');
      return `'${raw}'`;
    }

    case 'sql_column_list': {
      const left = sqlFromInput(block, 'LEFT');
      const right = sqlFromInput(block, 'RIGHT');
      return [left, right].filter(Boolean).join(', ') || null;
    }

    case 'sql_as': {
      const expr = sqlFromInput(block, 'EXPR');
      const alias = (block.getFieldValue('ALIAS') || '').trim();
      return expr && alias ? `${expr} AS ${alias}` : null;
    }

    case 'sql_math': {
      const left = sqlFromInput(block, 'LEFT');
      const right = sqlFromInput(block, 'RIGHT');
      const op = block.getFieldValue('OP') || '+';
      return left && right ? `(${left} ${op} ${right})` : null;
    }

    case 'sql_compare': {
      const left = sqlFromInput(block, 'LEFT');
      const right = sqlFromInput(block, 'RIGHT');
      const op = block.getFieldValue('OP') || '=';
      return left && right ? `${left} ${op} ${right}` : null;
    }

    case 'sql_and': {
      const left = sqlFromInput(block, 'LEFT');
      const right = sqlFromInput(block, 'RIGHT');
      return left && right ? `(${left} AND ${right})` : null;
    }

    case 'sql_or': {
      const left = sqlFromInput(block, 'LEFT');
      const right = sqlFromInput(block, 'RIGHT');
      return left && right ? `(${left} OR ${right})` : null;
    }

    case 'sql_not': {
      const cond = sqlFromInput(block, 'COND');
      return cond ? `NOT ${cond}` : null;
    }

    case 'sql_between': {
      const expr = sqlFromInput(block, 'EXPR');
      const low = sqlFromInput(block, 'LOW');
      const high = sqlFromInput(block, 'HIGH');
      return expr && low !== null && high !== null
        ? `${expr} BETWEEN ${low} AND ${high}`
        : null;
    }

    case 'sql_is_null': {
      const expr = sqlFromInput(block, 'EXPR');
      const not = block.getFieldValue('NOT') === 'NOT' ? 'NOT ' : '';
      return expr ? `${expr} IS ${not}NULL` : null;
    }

    case 'sql_count_star':
      return 'COUNT(*)';

    case 'sql_count': {
      const expr = sqlFromInput(block, 'EXPR') || '*';
      return `COUNT(${expr})`;
    }

    case 'sql_min': {
      const expr = sqlFromInput(block, 'EXPR');
      return expr ? `MIN(${expr})` : null;
    }

    case 'sql_max': {
      const expr = sqlFromInput(block, 'EXPR');
      return expr ? `MAX(${expr})` : null;
    }

    case 'sql_avg': {
      const expr = sqlFromInput(block, 'EXPR');
      return expr ? `AVG(${expr})` : null;
    }

    case 'sql_sum': {
      const expr = sqlFromInput(block, 'EXPR');
      return expr ? `SUM(${expr})` : null;
    }

    default:
      return null;
  }
}

function generateClauseSQL(block) {
  switch (block.type) {
    case 'sql_select': {
      const distinct = block.getFieldValue('DISTINCT') === 'DISTINCT' ? 'DISTINCT ' : '';
      const cols = sqlFromInput(block, 'COLUMNS') || '*';
      return `SELECT ${distinct}${cols}`;
    }

    case 'sql_from': {
      const table = sqlFromInput(block, 'TABLE') || 'table_name';
      return `FROM ${table}`;
    }

    case 'sql_join': {
      const type = block.getFieldValue('JOIN_TYPE') || 'INNER';
      const table = sqlFromInput(block, 'TABLE') || 'table_name';
      const on = sqlFromInput(block, 'ON');
      const keyword = type === 'INNER' ? 'JOIN' : `${type} JOIN`;
      return on ? `${keyword} ${table} ON ${on}` : `${keyword} ${table}`;
    }

    case 'sql_where': {
      const cond = sqlFromInput(block, 'COND');
      return cond ? `WHERE ${cond}` : null;
    }

    case 'sql_group_by': {
      const expr = sqlFromInput(block, 'EXPR');
      return expr ? `GROUP BY ${expr}` : null;
    }

    case 'sql_having': {
      const cond = sqlFromInput(block, 'COND');
      return cond ? `HAVING ${cond}` : null;
    }

    case 'sql_order_by': {
      const expr = sqlFromInput(block, 'EXPR');
      if (!expr) return null;
      const dir = block.getFieldValue('DIR') || '';
      return `ORDER BY ${expr}${dir ? ` ${dir}` : ''}`;
    }

    case 'sql_limit': {
      const n = block.getFieldValue('NUM') ?? 10;
      return `LIMIT ${n}`;
    }

    default:
      return null;
  }
}

function generateQueryFromChain(selectBlock) {
  const clauses = [];
  let block = selectBlock;
  while (block) {
    const clause = generateClauseSQL(block);
    if (clause) clauses.push(clause);
    block = block.getNextBlock?.();
  }
  return clauses.length ? `${clauses.join('\n')};` : '';
}

export function generateSqlFromBlocklyWorkspace(workspace) {
  const topBlocks = workspace?.getTopBlocks?.(true) || [];
  return topBlocks
    .filter((b) => b.type === 'sql_select' && !b.outputConnection)
    .map(generateQueryFromChain)
    .filter(Boolean)
    .join('\n\n');
}

// ── Workspace-state helpers ────────────────────────────────────────────────

function splitOutside(value, separator) {
  const parts = [];
  let current = '';
  let quote = null;
  let depth = 0;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    const next = value[index + 1];

    if (quote) {
      current += char;
      if (char === quote && next === quote) {
        current += next;
        index++;
      }
      else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function block(type, options = {}) {
  const result = { type };
  if (options.fields && Object.keys(options.fields).length > 0) {
    result.fields = options.fields;
  }
  if (options.inputs && Object.keys(options.inputs).length > 0) {
    result.inputs = options.inputs;
  }
  if (options.next) {
    result.next = { block: options.next };
  }
  if (options.x !== undefined) result.x = options.x;
  if (options.y !== undefined) result.y = options.y;
  return result;
}

function inputFromBlock(child) {
  return child ? { block: child } : undefined;
}

function parseValueExpression(expression) {
  const value = String(expression || '').trim();
  if (!value) return null;

  const aliasMatch = value.match(/^(.+?)\s+AS\s+([A-Za-z_][\w$]*)$/i);
  if (aliasMatch) {
    return block('sql_as', {
      fields: { ALIAS: aliasMatch[2] },
      inputs: { EXPR: inputFromBlock(parseValueExpression(aliasMatch[1])) },
    });
  }

  const aggregateMatch = value.match(/^(COUNT|MIN|MAX|AVG|SUM)\s*\((.*)\)$/i);
  if (aggregateMatch) {
    const fn = aggregateMatch[1].toLowerCase();
    const inner = aggregateMatch[2].trim();
    if (fn === 'count' && inner === '*') {
      return block('sql_count_star');
    }
    return block(`sql_${fn}`, {
      inputs: { EXPR: inputFromBlock(parseValueExpression(inner || '*')) },
    });
  }

  const mathMatch = value.match(/^\((.+)\s+([+\-*/])\s+(.+)\)$/);
  if (mathMatch) {
    return block('sql_math', {
      fields: { OP: mathMatch[2] },
      inputs: {
        LEFT: inputFromBlock(parseValueExpression(mathMatch[1])),
        RIGHT: inputFromBlock(parseValueExpression(mathMatch[3])),
      },
    });
  }

  if (value === '*') return block('sql_star');
  if (/^-?\d+(\.\d+)?$/.test(value)) return block('sql_number', { fields: { NUM: Number(value) } });

  const stringMatch = value.match(/^'(.*)'$/s);
  if (stringMatch) {
    return block('sql_string', { fields: { TEXT: stringMatch[1].replace(/''/g, '\'') } });
  }

  return block('sql_column', { fields: { NAME: value.replace(/^"|"$/g, '') } });
}

function parseColumnList(value) {
  const columns = splitOutside(String(value || '*'), ',').map(parseValueExpression).filter(Boolean);
  if (columns.length === 0) return block('sql_star');

  return columns.reduceRight((right, left) => {
    if (!right) return left;
    return block('sql_column_list', {
      inputs: {
        LEFT: inputFromBlock(left),
        RIGHT: inputFromBlock(right),
      },
    });
  }, null);
}

function parseCondition(value) {
  const condition = String(value || '').trim();
  if (!condition) return null;

  const betweenMatch = condition.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
  if (betweenMatch) {
    return block('sql_between', {
      inputs: {
        EXPR: inputFromBlock(parseValueExpression(betweenMatch[1])),
        LOW: inputFromBlock(parseValueExpression(betweenMatch[2])),
        HIGH: inputFromBlock(parseValueExpression(betweenMatch[3])),
      },
    });
  }

  const nullMatch = condition.match(/^(.+?)\s+IS\s+(NOT\s+)?NULL$/i);
  if (nullMatch) {
    return block('sql_is_null', {
      fields: { NOT: nullMatch[2] ? 'NOT' : '' },
      inputs: { EXPR: inputFromBlock(parseValueExpression(nullMatch[1])) },
    });
  }

  const compareMatch = condition.match(/^(.+?)\s*(<=|>=|<>|!=|=|<|>|LIKE)\s*(.+)$/i);
  if (compareMatch) {
    return block('sql_compare', {
      fields: { OP: compareMatch[2] === '<>' ? '!=' : compareMatch[2].toUpperCase() },
      inputs: {
        LEFT: inputFromBlock(parseValueExpression(compareMatch[1])),
        RIGHT: inputFromBlock(parseValueExpression(compareMatch[3])),
      },
    });
  }

  return parseValueExpression(condition);
}

function appendClause(previous, next) {
  if (!previous) return next;
  previous.next = { block: next };
  return next;
}

function parseSelectSql(sql) {
  const compact = String(sql || '')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .replace(/;+\s*$/, '')
    .trim();
  if (!compact) return null;

  const match = compact.match(
    /^SELECT\s+(DISTINCT\s+)?(.+?)\s+FROM\s+([^\s]+)(?:\s+(?:(LEFT|RIGHT|CROSS|INNER)\s+)?JOIN\s+([^\s]+)\s+ON\s+(.+?))?(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+HAVING\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i,
  );
  if (!match) return null;

  const [
    ,
    distinct,
    columns,
    table,
    joinType,
    joinTable,
    joinOn,
    where,
    groupBy,
    having,
    orderBy,
    limit,
  ] = match;

  const select = block('sql_select', {
    x: 20,
    y: 20,
    fields: { DISTINCT: distinct ? 'DISTINCT' : '' },
    inputs: { COLUMNS: inputFromBlock(parseColumnList(columns)) },
  });
  let tail = select;

  tail = appendClause(tail, block('sql_from', {
    inputs: { TABLE: inputFromBlock(parseValueExpression(table)) },
  }));

  if (joinTable) {
    tail = appendClause(tail, block('sql_join', {
      fields: { JOIN_TYPE: (joinType || 'INNER').toUpperCase() },
      inputs: {
        TABLE: inputFromBlock(parseValueExpression(joinTable)),
        ON: inputFromBlock(parseCondition(joinOn)),
      },
    }));
  }

  if (where) {
    tail = appendClause(tail, block('sql_where', {
      inputs: { COND: inputFromBlock(parseCondition(where)) },
    }));
  }

  if (groupBy) {
    tail = appendClause(tail, block('sql_group_by', {
      inputs: { EXPR: inputFromBlock(parseValueExpression(groupBy)) },
    }));
  }

  if (having) {
    tail = appendClause(tail, block('sql_having', {
      inputs: { COND: inputFromBlock(parseCondition(having)) },
    }));
  }

  if (orderBy) {
    const orderMatch = orderBy.match(/^(.+?)(?:\s+(ASC|DESC))?$/i);
    tail = appendClause(tail, block('sql_order_by', {
      fields: { DIR: orderMatch?.[2]?.toUpperCase() || '' },
      inputs: { EXPR: inputFromBlock(parseValueExpression(orderMatch?.[1] || orderBy)) },
    }));
  }

  if (limit) {
    appendClause(tail, block('sql_limit', {
      fields: { NUM: Number(limit) },
    }));
  }

  return select;
}

export function createSqlWorkspaceStateFromCode(code) {
  const queries = String(code || '')
    .split(/;\s*(?=SELECT\s+)/i)
    .map(parseSelectSql)
    .filter(Boolean)
    .map((query, index) => ({ ...query, x: 20, y: 20 + index * 40 }));

  return queries.length > 0
    ? { blocks: { languageVersion: 0, blocks: queries } }
    : null;
}

function stateFromLegacySqlBlock(legacyBlock) {
  const fields = legacyBlock?.fields || {};
  if (legacyBlock?.type === 'sql_count_query') {
    const alias = fields.ALIAS ? ` AS ${fields.ALIAS}` : '';
    return parseSelectSql([
      `SELECT COUNT(*)${alias}`,
      `FROM ${fields.TABLE || 'world'}`,
      fields.WHERE ? `WHERE ${fields.WHERE}` : '',
    ].filter(Boolean).join(' '));
  }

  if (legacyBlock?.type === 'sql_join_query') {
    return parseSelectSql([
      `SELECT ${fields.COLUMNS || '*'}`,
      `FROM ${fields.LEFT_TABLE || 'table_name'}`,
      `JOIN ${fields.RIGHT_TABLE || 'table_name'} ON ${fields.ON || '1 = 1'}`,
      fields.WHERE ? `WHERE ${fields.WHERE}` : '',
      fields.ORDER_BY ? `ORDER BY ${fields.ORDER_BY}` : '',
    ].filter(Boolean).join(' '));
  }

  if (legacyBlock?.type === 'sql_select_query') {
    return parseSelectSql([
      `SELECT ${fields.COLUMNS || '*'}`,
      `FROM ${fields.TABLE || 'world'}`,
      fields.WHERE ? `WHERE ${fields.WHERE}` : '',
      fields.ORDER_BY ? `ORDER BY ${fields.ORDER_BY}` : '',
      fields.LIMIT ? `LIMIT ${fields.LIMIT}` : '',
    ].filter(Boolean).join(' '));
  }

  return legacyBlock;
}

export function migrateSqlWorkspaceState(state) {
  const blocks = state?.blocks?.blocks;
  if (!Array.isArray(blocks)) return state;

  const migratedBlocks = blocks
    .map(stateFromLegacySqlBlock)
    .filter(Boolean)
    .map((item, index) => ({ ...item, x: item.x ?? 20, y: item.y ?? 20 + index * 40 }));

  return {
    ...state,
    blocks: {
      ...state.blocks,
      blocks: migratedBlocks,
    },
  };
}

// ── Block registration ─────────────────────────────────────────────────────

export function registerSqlBlocks(Blockly) {
  if (!Blockly?.Blocks) return;

  // Clause blocks – stack vertically (SELECT → FROM → JOIN* → WHERE → …)

  if (!Blockly.Blocks.sql_select) {
    Blockly.Blocks.sql_select = {
      init() {
        this.appendValueInput('COLUMNS')
          .appendField('SELECT')
          .appendField(
            new Blockly.FieldDropdown([[' ', ''], ['DISTINCT', 'DISTINCT']]),
            'DISTINCT',
          )
          .setCheck('SQL_EXPR');
        this.setNextStatement(true, 'SQL_FROM');
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Wählt Spalten aus einer Tabelle aus');
      },
    };
  }

  if (!Blockly.Blocks.sql_from) {
    Blockly.Blocks.sql_from = {
      init() {
        this.appendValueInput('TABLE')
          .appendField('FROM')
          .setCheck('SQL_EXPR');
        this.setPreviousStatement(true, 'SQL_FROM');
        this.setNextStatement(true, ['SQL_JOIN', 'SQL_WHERE', 'SQL_GROUP_BY', 'SQL_ORDER_BY', 'SQL_LIMIT']);
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Gibt die Quelltabelle an');
      },
    };
  }

  if (!Blockly.Blocks.sql_join) {
    Blockly.Blocks.sql_join = {
      init() {
        this.appendValueInput('TABLE')
          .appendField(
            new Blockly.FieldDropdown([
              ['JOIN', 'INNER'],
              ['LEFT JOIN', 'LEFT'],
              ['RIGHT JOIN', 'RIGHT'],
              ['CROSS JOIN', 'CROSS'],
            ]),
            'JOIN_TYPE',
          )
          .setCheck('SQL_EXPR');
        this.appendValueInput('ON')
          .appendField('ON')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.setPreviousStatement(true, 'SQL_JOIN');
        this.setNextStatement(true, ['SQL_JOIN', 'SQL_WHERE', 'SQL_GROUP_BY', 'SQL_ORDER_BY', 'SQL_LIMIT']);
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Verknüpft eine weitere Tabelle');
      },
    };
  }

  if (!Blockly.Blocks.sql_where) {
    Blockly.Blocks.sql_where = {
      init() {
        this.appendValueInput('COND')
          .appendField('WHERE')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.setPreviousStatement(true, 'SQL_WHERE');
        this.setNextStatement(true, ['SQL_GROUP_BY', 'SQL_ORDER_BY', 'SQL_LIMIT']);
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Filtert Zeilen nach einer Bedingung');
      },
    };
  }

  if (!Blockly.Blocks.sql_group_by) {
    Blockly.Blocks.sql_group_by = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('GROUP BY')
          .setCheck('SQL_EXPR');
        this.setPreviousStatement(true, 'SQL_GROUP_BY');
        this.setNextStatement(true, ['SQL_HAVING', 'SQL_ORDER_BY', 'SQL_LIMIT']);
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Gruppiert Ergebniszeilen');
      },
    };
  }

  if (!Blockly.Blocks.sql_having) {
    Blockly.Blocks.sql_having = {
      init() {
        this.appendValueInput('COND')
          .appendField('HAVING')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.setPreviousStatement(true, 'SQL_HAVING');
        this.setNextStatement(true, ['SQL_ORDER_BY', 'SQL_LIMIT']);
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Filtert Gruppen nach einer Bedingung');
      },
    };
  }

  if (!Blockly.Blocks.sql_order_by) {
    Blockly.Blocks.sql_order_by = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('ORDER BY')
          .appendField(
            new Blockly.FieldDropdown([[' ', ''], ['ASC', 'ASC'], ['DESC', 'DESC']]),
            'DIR',
          )
          .setCheck('SQL_EXPR');
        this.setPreviousStatement(true, 'SQL_ORDER_BY');
        this.setNextStatement(true, 'SQL_LIMIT');
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Sortiert die Ergebnisse');
      },
    };
  }

  if (!Blockly.Blocks.sql_limit) {
    Blockly.Blocks.sql_limit = {
      init() {
        this.appendDummyInput()
          .appendField('LIMIT')
          .appendField(new Blockly.FieldNumber(10, 1), 'NUM');
        this.setPreviousStatement(true, 'SQL_LIMIT');
        this.setNextStatement(false);
        this.setColour(CLAUSE_COLOUR);
        this.setTooltip('Begrenzt die Anzahl der Ergebniszeilen');
      },
    };
  }

  // Data reference blocks

  if (!Blockly.Blocks.sql_column) {
    Blockly.Blocks.sql_column = {
      init() {
        this.appendDummyInput()
          .appendField(new Blockly.FieldTextInput('spalte'), 'NAME');
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(DATA_COLOUR);
        this.setTooltip('Spalten- oder Tabellenname (z. B. name oder welt.name)');
      },
    };
  }

  if (!Blockly.Blocks.sql_star) {
    Blockly.Blocks.sql_star = {
      init() {
        this.appendDummyInput()
          .appendField('*');
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(DATA_COLOUR);
        this.setTooltip('Alle Spalten auswählen');
      },
    };
  }

  if (!Blockly.Blocks.sql_column_list) {
    Blockly.Blocks.sql_column_list = {
      init() {
        this.appendValueInput('LEFT')
          .setCheck('SQL_EXPR');
        this.appendValueInput('RIGHT')
          .appendField(',')
          .setCheck('SQL_EXPR');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(DATA_COLOUR);
        this.setTooltip('Mehrere Ausdrücke durch Komma trennen');
      },
    };
  }

  if (!Blockly.Blocks.sql_as) {
    Blockly.Blocks.sql_as = {
      init() {
        this.appendValueInput('EXPR')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField('AS')
          .appendField(new Blockly.FieldTextInput('alias'), 'ALIAS');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(ALIAS_COLOUR);
        this.setTooltip('Gibt einem Ausdruck einen Alias');
      },
    };
  }

  // Condition blocks

  if (!Blockly.Blocks.sql_compare) {
    Blockly.Blocks.sql_compare = {
      init() {
        this.appendValueInput('LEFT')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(
            new Blockly.FieldDropdown([
              ['=', '='],
              ['≠', '!='],
              ['<', '<'],
              ['≤', '<='],
              ['>', '>'],
              ['≥', '>='],
              ['LIKE', 'LIKE'],
            ]),
            'OP',
          );
        this.appendValueInput('RIGHT')
          .setCheck('SQL_EXPR');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_COND');
        this.setColour(COMPARE_COLOUR);
        this.setTooltip('Vergleicht zwei Werte');
      },
    };
  }

  if (!Blockly.Blocks.sql_and) {
    Blockly.Blocks.sql_and = {
      init() {
        this.appendValueInput('LEFT')
          .appendField('AND')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.appendValueInput('RIGHT')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_COND');
        this.setColour(LOGIC_COLOUR);
        this.setTooltip('Beide Bedingungen müssen erfüllt sein');
      },
    };
  }

  if (!Blockly.Blocks.sql_or) {
    Blockly.Blocks.sql_or = {
      init() {
        this.appendValueInput('LEFT')
          .appendField('OR')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.appendValueInput('RIGHT')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_COND');
        this.setColour(LOGIC_COLOUR);
        this.setTooltip('Mindestens eine Bedingung muss erfüllt sein');
      },
    };
  }

  if (!Blockly.Blocks.sql_not) {
    Blockly.Blocks.sql_not = {
      init() {
        this.appendValueInput('COND')
          .appendField('NOT')
          .setCheck(['SQL_COND', 'SQL_EXPR']);
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_COND');
        this.setColour(LOGIC_COLOUR);
        this.setTooltip('Kehrt eine Bedingung um');
      },
    };
  }

  if (!Blockly.Blocks.sql_between) {
    Blockly.Blocks.sql_between = {
      init() {
        this.appendValueInput('EXPR')
          .setCheck('SQL_EXPR');
        this.appendValueInput('LOW')
          .appendField('BETWEEN')
          .setCheck('SQL_EXPR');
        this.appendValueInput('HIGH')
          .appendField('AND')
          .setCheck('SQL_EXPR');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_COND');
        this.setColour(LOGIC_COLOUR);
        this.setTooltip('Prüft ob ein Wert in einem Bereich liegt');
      },
    };
  }

  if (!Blockly.Blocks.sql_is_null) {
    Blockly.Blocks.sql_is_null = {
      init() {
        this.appendValueInput('EXPR')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField('IS')
          .appendField(
            new Blockly.FieldDropdown([[' ', ''], ['NOT', 'NOT']]),
            'NOT',
          )
          .appendField('NULL');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_COND');
        this.setColour(LOGIC_COLOUR);
        this.setTooltip('Prüft ob ein Wert NULL ist');
      },
    };
  }

  // Aggregate function blocks

  if (!Blockly.Blocks.sql_count_star) {
    Blockly.Blocks.sql_count_star = {
      init() {
        this.appendDummyInput()
          .appendField('COUNT(*)');
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(AGGREGATE_COLOUR);
        this.setTooltip('Zählt alle Zeilen');
      },
    };
  }

  if (!Blockly.Blocks.sql_count) {
    Blockly.Blocks.sql_count = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('COUNT(')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(')');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(AGGREGATE_COLOUR);
        this.setTooltip('Zählt nicht-NULL-Werte einer Spalte');
      },
    };
  }

  if (!Blockly.Blocks.sql_min) {
    Blockly.Blocks.sql_min = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('MIN(')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(')');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(AGGREGATE_COLOUR);
        this.setTooltip('Kleinster Wert');
      },
    };
  }

  if (!Blockly.Blocks.sql_max) {
    Blockly.Blocks.sql_max = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('MAX(')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(')');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(AGGREGATE_COLOUR);
        this.setTooltip('Größter Wert');
      },
    };
  }

  if (!Blockly.Blocks.sql_avg) {
    Blockly.Blocks.sql_avg = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('AVG(')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(')');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(AGGREGATE_COLOUR);
        this.setTooltip('Durchschnittswert');
      },
    };
  }

  if (!Blockly.Blocks.sql_sum) {
    Blockly.Blocks.sql_sum = {
      init() {
        this.appendValueInput('EXPR')
          .appendField('SUM(')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(')');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(AGGREGATE_COLOUR);
        this.setTooltip('Summe aller Werte');
      },
    };
  }

  // Value/literal blocks

  if (!Blockly.Blocks.sql_number) {
    Blockly.Blocks.sql_number = {
      init() {
        this.appendDummyInput()
          .appendField(new Blockly.FieldNumber(0), 'NUM');
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(VALUE_COLOUR);
        this.setTooltip('Zahlenwert');
      },
    };
  }

  if (!Blockly.Blocks.sql_string) {
    Blockly.Blocks.sql_string = {
      init() {
        this.appendDummyInput()
          .appendField('“')
          .appendField(new Blockly.FieldTextInput(''), 'TEXT')
          .appendField('”');
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(VALUE_COLOUR);
        this.setTooltip('Textwert (wird in Anführungszeichen gesetzt)');
      },
    };
  }

  if (!Blockly.Blocks.sql_math) {
    Blockly.Blocks.sql_math = {
      init() {
        this.appendValueInput('LEFT')
          .setCheck('SQL_EXPR');
        this.appendDummyInput()
          .appendField(
            new Blockly.FieldDropdown([
              ['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'],
            ]),
            'OP',
          );
        this.appendValueInput('RIGHT')
          .setCheck('SQL_EXPR');
        this.setInputsInline(true);
        this.setOutput(true, 'SQL_EXPR');
        this.setColour(MATH_COLOUR);
        this.setTooltip('Arithmetischer Ausdruck');
      },
    };
  }
}

// ── Toolbox ────────────────────────────────────────────────────────────────

const SQL_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Klauseln',
      colour: CLAUSE_COLOUR,
      contents: [
        { kind: 'block', type: 'sql_select' },
        { kind: 'block', type: 'sql_from' },
        { kind: 'block', type: 'sql_join' },
        { kind: 'block', type: 'sql_where' },
        { kind: 'block', type: 'sql_group_by' },
        { kind: 'block', type: 'sql_having' },
        { kind: 'block', type: 'sql_order_by' },
        { kind: 'block', type: 'sql_limit' },
      ],
    },
    {
      kind: 'category',
      name: 'Spalten & Tabellen',
      colour: DATA_COLOUR,
      contents: [
        { kind: 'block', type: 'sql_column' },
        { kind: 'block', type: 'sql_star' },
        { kind: 'block', type: 'sql_column_list' },
        { kind: 'block', type: 'sql_as' },
      ],
    },
    {
      kind: 'category',
      name: 'Bedingungen',
      colour: COMPARE_COLOUR,
      contents: [
        { kind: 'block', type: 'sql_compare' },
        { kind: 'block', type: 'sql_and' },
        { kind: 'block', type: 'sql_or' },
        { kind: 'block', type: 'sql_not' },
        { kind: 'block', type: 'sql_between' },
        { kind: 'block', type: 'sql_is_null' },
      ],
    },
    {
      kind: 'category',
      name: 'Aggregatfunktionen',
      colour: AGGREGATE_COLOUR,
      contents: [
        { kind: 'block', type: 'sql_count_star' },
        { kind: 'block', type: 'sql_count' },
        { kind: 'block', type: 'sql_min' },
        { kind: 'block', type: 'sql_max' },
        { kind: 'block', type: 'sql_avg' },
        { kind: 'block', type: 'sql_sum' },
      ],
    },
    {
      kind: 'category',
      name: 'Werte',
      colour: VALUE_COLOUR,
      contents: [
        { kind: 'block', type: 'sql_number' },
        { kind: 'block', type: 'sql_string' },
        { kind: 'block', type: 'sql_math' },
      ],
    },
  ],
};

// ── Language pack export ───────────────────────────────────────────────────

export const SQL_BLOCKLY_LANGUAGE_PACK = {
  toolbox: SQL_TOOLBOX,
  categoryFieldMap: {},
  generate: generateSqlFromBlocklyWorkspace,
  registerBlocks: registerSqlBlocks,
  createWorkspaceStateFromCode: createSqlWorkspaceStateFromCode,
  migrateWorkspaceState: migrateSqlWorkspaceState,
  supported: true,
};

export function registerSqlBlocklyLanguagePack() {
  H5P.registerBlocklyLanguagePack('sql', SQL_BLOCKLY_LANGUAGE_PACK);
}
