import { describe, expect, it } from 'vitest';
import {
  translateLaTeXToSQL,
  translateToSQL,
} from '../src/scripts/relalg/relational-algebra-translator';

describe('translateToSQL – basic operators', () => {
  it('translates a plain relation to SELECT *', () => {
    expect(translateToSQL('R')).toBe('SELECT * FROM "R"');
  });

  it('translates selection σ', () => {
    const sql = translateToSQL('sigma_(x=1)(R)');
    expect(sql).toBe('SELECT * FROM "R" WHERE x=1');
  });

  it('translates projection π', () => {
    const sql = translateToSQL('pi_(a,b)(R)');
    expect(sql).toBe('SELECT a, b FROM "R"');
  });

  it('translates cross product × (xx form)', () => {
    const sql = translateToSQL('RxxS');
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R") AS ra1 CROSS JOIN (SELECT * FROM "S") AS ra2');
  });

  it('translates natural join ⋈', () => {
    const sql = translateToSQL('R|><|S');
    // Natural join falls back to cross join (documented limitation).
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R") AS ra1 CROSS JOIN (SELECT * FROM "S") AS ra2');
  });

  it('translates theta-join ⋈_{cond}', () => {
    const sql = translateToSQL('R|><|_(a=b)S');
    // NOTE: Without schema context, the bareword-quoting heuristic treats the
    // right operand `b` as a string value. Join conditions comparing columns
    // require schema-aware quoting (handled by the container, not the translator).
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R") AS ra1 JOIN (SELECT * FROM "S") AS ra2 ON a=\'b\'');
  });

  it('translates union ∪', () => {
    const sql = translateToSQL('R\u222aS');
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R" UNION SELECT * FROM "S") AS ra3');
  });

  it('translates intersect ∩', () => {
    const sql = translateToSQL('R\u2229S');
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R" INTERSECT SELECT * FROM "S") AS ra3');
  });

  it('translates set difference − (ASCII)', () => {
    const sql = translateToSQL('R-S');
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R" EXCEPT SELECT * FROM "S") AS ra3');
  });
});

describe('translateToSQL – nesting', () => {
  it('handles projection over selection', () => {
    const sql = translateToSQL('pi_a(sigma_(b>5)(R))');
    expect(sql).toBe('SELECT a FROM "R" WHERE b>5');
  });

  it('handles selection with AND condition', () => {
    const sql = translateToSQL('sigma_(x=1 and y>2)(R)');
    expect(sql).toContain('WHERE x=1 AND y>2');
  });

  it('handles parenthesised sub-expression', () => {
    const sql = translateToSQL('pi_a((R))');
    expect(sql).toBe('SELECT a FROM "R"');
  });
});

describe('translateToSQL – conditions with Unicode', () => {
  it('normalises ≤ to <=', () => {
    expect(translateToSQL('sigma_(a\u22645)(R)')).toContain('a <= 5');
  });

  it('normalises ≥ to >=', () => {
    expect(translateToSQL('sigma_(a\u22655)(R)')).toContain('a >= 5');
  });

  it('normalises ≠ to != (numeric right operand)', () => {
    expect(translateToSQL('sigma_(a\u22605)(R)')).toContain('a != 5');
  });

  it('normalises ∨ (OR) and ∧ (AND)', () => {
    const sql = translateToSQL('sigma_(a=1 \u2228 b=2)(R)');
    expect(sql).toContain('a=1 OR b=2');
  });
});

describe('translateToSQL – string literals', () => {
  it('quotes a bareword right operand of =', () => {
    const sql = translateToSQL('sigma_(continent=Europe)(world)');
    expect(sql).toContain("continent='Europe'");
  });

  it('leaves numeric right operands untouched', () => {
    const sql = translateToSQL('sigma_(x=1)(R)');
    expect(sql).toContain('x=1');
  });

  it('leaves already-quoted strings untouched', () => {
    const sql = translateToSQL('sigma_(continent=\'Europe\')(world)');
    expect(sql).toContain("continent='Europe'");
  });
});

describe('translateToSQL – rename ρ', () => {
  it('renames a relation', () => {
    const sql = translateToSQL('rho_(T)(R)');
    expect(sql).toBe('SELECT * FROM (SELECT * FROM "R") AS T');
  });
});

describe('translateToSQL – edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(translateToSQL('')).toBe('');
    expect(translateToSQL(null)).toBe('');
    expect(translateToSQL(undefined)).toBe('');
  });

  it('throws on incomplete selection', () => {
    expect(() => translateToSQL('sigma_(R)')).toThrow();
  });

  it('throws on unexpected trailing token', () => {
    expect(() => translateToSQL('R S')).toThrow();
  });

  it('throws on unsupported extended operators', () => {
    expect(() => translateToSQL('gamma_(a)(R)')).toThrow();
  });
});

describe('translateLaTeXToSQL', () => {
  it('translates supported LaTeX without MathLive conversion support', () => {
    const previousMathfieldElement = globalThis.MathfieldElement;
    const previousConvert = globalThis.convertLatexToAsciiMath;
    delete globalThis.MathfieldElement;
    delete globalThis.convertLatexToAsciiMath;

    try {
      expect(
        translateLaTeXToSQL('\\pi_{name, continent}(\\sigma_{name=Germany}(world))'),
      ).toBe('SELECT name, continent FROM "world" WHERE name=\'Germany\'');
    }
    finally {
      globalThis.MathfieldElement = previousMathfieldElement;
      globalThis.convertLatexToAsciiMath = previousConvert;
    }
  });

  it('joins MathLive-spaced table and column names into identifiers', () => {
    const previousMathfieldElement = globalThis.MathfieldElement;
    const previousConvert = globalThis.convertLatexToAsciiMath;
    delete globalThis.MathfieldElement;
    delete globalThis.convertLatexToAsciiMath;

    try {
      expect(
        translateLaTeXToSQL('\\pi_{n a m e, c o n t i n e n t}(\\sigma_{n a m e=G e r m a n y}(w o r l d))'),
      ).toBe('SELECT name, continent FROM "world" WHERE name=\'Germany\'');
    }
    finally {
      globalThis.MathfieldElement = previousMathfieldElement;
      globalThis.convertLatexToAsciiMath = previousConvert;
    }
  });

  it('accepts direct multi-letter relation names in joins', () => {
    const previousMathfieldElement = globalThis.MathfieldElement;
    const previousConvert = globalThis.convertLatexToAsciiMath;
    delete globalThis.MathfieldElement;
    delete globalThis.convertLatexToAsciiMath;

    try {
      expect(
        translateLaTeXToSQL('t e a m\\bowtie_{i d=t e a m i d}g o a l'),
      ).toBe('SELECT * FROM (SELECT * FROM "team") AS ra1 JOIN (SELECT * FROM "goal") AS ra2 ON id=\'teamid\'');
    }
    finally {
      globalThis.MathfieldElement = previousMathfieldElement;
      globalThis.convertLatexToAsciiMath = previousConvert;
    }
  });
});
