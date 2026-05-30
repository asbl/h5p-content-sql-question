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
      const raw = (block.getFieldValue('TEXT') || '').replace(/'/g, "''");
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
  supported: true,
};

export function registerSqlBlocklyLanguagePack() {
  H5P.registerBlocklyLanguagePack('sql', SQL_BLOCKLY_LANGUAGE_PACK);
}
