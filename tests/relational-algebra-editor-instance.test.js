import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vitest's project config runs these tests in the 'node' environment with a
// minimal TestElement-based document mock (see tests/setup.js). We extend that
// mock locally with the few extra pieces the RA editor instance needs:
// classList, addEventListener and the inlineShortcuts setter that the
// MathLive field exposes.

// ── MathEditor mock ────────────────────────────────────────────────────────
//
// The real MathEditor wraps MathLive's MathfieldElement, which requires a
// browser DOM (HTMLElement). We mock it to capture the LaTeX value and the
// options passed to the constructor, including onChangeCallback invocations.

const mathEditorInstances = [];

class MockMathEditor {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.value = options.initialValue ?? '';

    // The editor instance reads mathField for keyboard/shortcut config.
    this.mathField = container?.ownerDocument?.createElement?.('math-field') ?? null;

    mathEditorInstances.push(this);
  }

  getValue() { return this.value; }
  setValue(latex) { this.value = String(latex ?? ''); }
  focus() {}
  disable() {}
  enable() {}
  destroy() {
    const idx = mathEditorInstances.indexOf(this);
    if (idx >= 0) mathEditorInstances.splice(idx, 1);
  }
}

// Deterministic MathLive converter stub for tests. Mirrors the subset of
// behavior the real MathLive convertLatexToAsciiMath exhibits for the cases
// tested here.
const convertLatexToAsciiMath = (latex) => String(latex)
  .replace(/\\sigma/g, 'sigma')
  .replace(/\\pi/g, 'pi')
  .replace(/\\rho/g, 'rho')
  .replace(/\\bowtie/g, '|><|')
  .replace(/\\times/g, 'xx')
  .replace(/\\cup/g, '\u222a')
  .replace(/\\cap/g, '\u2229')
  .replace(/\\land/g, 'and')
  .replace(/\\lor/g, 'or')
  .replace(/\{([^{}]*)\}/g, '($1)');

/**
 * Minimal element mock with classList, appendChild, append, replaceChildren
 * and addEventListener. Tracks `className` so theme-class assertions work.
 * Stores `inlineShortcuts` so the editor's shortcut registration succeeds.
 */
class MockElement {
  constructor(tagName = '') {
    this.tagName = tagName;
    this.children = [];
    this._classes = new Set();
    this.attributes = {};
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.ownerDocument = globalThis.document;
    this.parentElement = null;
    this.listeners = {};
    this.inlineShortcuts = {};
  }

  get className() {
    return [...this._classes].join(' ');
  }

  set className(value) {
    this._classes = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  get classList() {
    const self = this;
    return {
      add(...names) { names.forEach((n) => self._classes.add(n)); },
      remove(...names) { names.forEach((n) => self._classes.delete(n)); },
      toggle(name, force) {
        if (force === true) return self._classes.add(name);
        if (force === false) return self._classes.delete(name);
        if (self._classes.has(name)) self._classes.delete(name);
        else self._classes.add(name);
      },
      contains(name) { return self._classes.has(name); },
    };
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    this.innerHTML += child.outerHTML ?? child.textContent ?? '';
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this.innerHTML = '';
    children.forEach((child) => this.appendChild(child));
  }

  get outerHTML() {
    const classAttribute = this.className ? ` class="${this.className}"` : '';
    const content = this.innerHTML || this.textContent;
    return `<${this.tagName}${classAttribute}>${content}</${this.tagName}>`;
  }
}

let savedDocument;
let savedH5P;

beforeEach(() => {
  mathEditorInstances.length = 0;
  savedDocument = globalThis.document;
  savedH5P = globalThis.H5P;

  globalThis.document = {
    documentElement: { lang: 'en' },
    createElement(tagName) { return new MockElement(tagName); },
    createDocumentFragment() { return new MockElement(''); },
  };
  globalThis.H5P = { ...(savedH5P || {}), MathEditor: MockMathEditor };
});

afterEach(() => {
  globalThis.document = savedDocument;
  globalThis.H5P = savedH5P;
});

function buildDom() {
  return globalThis.document.createElement('div');
}

describe('RelationalAlgebraEditorInstance', () => {
  let RelationalAlgebraEditorInstance;

  beforeEach(async () => {
    vi.resetModules();
    ({ default: RelationalAlgebraEditorInstance } = await import('../src/scripts/relalg/relational-algebra-editor-instance'));
  });

  it('generates SQL from the initial LaTeX value via getCode()', () => {
    const container = buildDom();
    const editor = new RelationalAlgebraEditorInstance(
      container,
      '\\sigma_{x=1}(R)',
      'relalg',
      { convertLatexToAsciiMath },
    );

    expect(editor.getCode()).toBe('SELECT * FROM "R" WHERE x=1');
  });

  it('returns empty string for empty input', () => {
    const container = buildDom();
    const editor = new RelationalAlgebraEditorInstance(container, '', 'relalg', {
      convertLatexToAsciiMath,
    });

    expect(editor.getCode()).toBe('');
  });

  it('does not throw when H5P.MathEditor is unavailable', () => {
    globalThis.H5P = undefined;
    const container = buildDom();

    const editor = new RelationalAlgebraEditorInstance(container, '\\sigma_{x=1}(R)', 'relalg', {
      convertLatexToAsciiMath,
    });

    expect(editor.getCode()).toBe('');
    expect(editor.getTemplateCode()).toBe('\\sigma_{x=1}(R)');
  });

  it('returns the raw LaTeX via getTemplateCode()', () => {
    const container = buildDom();
    const editor = new RelationalAlgebraEditorInstance(
      container,
      '\\sigma_{x=1}(R)',
      'relalg',
      { convertLatexToAsciiMath },
    );

    expect(editor.getTemplateCode()).toBe('\\sigma_{x=1}(R)');
  });

  it('invokes onChangeCallback with generated SQL when the field changes', () => {
    const container = buildDom();
    const onChangeCallback = vi.fn();
    const editor = new RelationalAlgebraEditorInstance(container, '', 'relalg', {
      convertLatexToAsciiMath,
      onChangeCallback,
    });

    const mock = mathEditorInstances[0];
    mock.value = '\\pi_{a}(R)';
    mock.options.onChangeCallback();

    expect(onChangeCallback).toHaveBeenCalled();
    expect(editor.getCode()).toBe('SELECT a FROM "R"');
  });

  it('handles word-like inline shortcuts only after separators', () => {
    const container = buildDom();
    new RelationalAlgebraEditorInstance(container, '', 'relalg', {
      convertLatexToAsciiMath,
    });

    const mathField = mathEditorInstances[0].mathField;
    const shortcuts = mathField.inlineShortcuts;
    expect(shortcuts.sigma).toEqual({
      value: '\\sigma',
      after: 'nothing+space+openfence+relop+binop+punct',
    });
    expect(shortcuts.join).toEqual({
      value: '\\bowtie',
      after: 'nothing+space+openfence+relop+binop+punct',
    });

    expect(shortcuts.or).toEqual({ value: '', after: 'nothing' });
    expect(shortcuts.and).toEqual({ value: '', after: 'nothing' });
    expect(shortcuts.not).toEqual({ value: '', after: 'nothing' });
    expect(shortcuts.cap).toEqual({ value: '', after: 'nothing' });
    expect(shortcuts.cup).toEqual({ value: '', after: 'nothing' });

    const first = { type: 'first' };
    const w = { type: 'mord', mode: 'math', value: 'w', leftSibling: first };
    const oAfterW = { type: 'mord', mode: 'math', value: 'o', leftSibling: w };
    const space = { type: 'space', mode: 'math', value: ' ', leftSibling: first };
    const oAfterSpace = { type: 'mord', mode: 'math', value: 'o', leftSibling: space };
    const sender = (atom) => ({
      model: {
        position: 1,
        anchor: 1,
        at: () => atom,
      },
    });

    expect(mathField.onInlineShortcut(sender(oAfterW), 'or')).toBe('');
    expect(mathField.onInlineShortcut(sender(oAfterSpace), 'or')).toBe('\\lor');
  });

  it('setCode updates the editor input and preview', () => {
    const container = buildDom();
    const editor = new RelationalAlgebraEditorInstance(container, '', 'relalg', {
      convertLatexToAsciiMath,
    });

    editor.setCode('\\pi_{a,b}(R)');
    expect(editor.getTemplateCode()).toBe('\\pi_{a,b}(R)');
    expect(editor.getCode()).toBe('SELECT a, b FROM "R"');
  });

  it('applyTheme toggles the theme class on the root element', () => {
    const container = buildDom();
    const editor = new RelationalAlgebraEditorInstance(container, '', 'relalg', {
      convertLatexToAsciiMath,
    });

    editor.setTheme('dark');
    expect(editor.root.className).toContain('theme-dark');

    editor.setTheme('light');
    expect(editor.root.className).toContain('theme-light');
  });

  it('destroy clears the parent container', () => {
    const container = buildDom();
    const editor = new RelationalAlgebraEditorInstance(container, '', 'relalg', {
      convertLatexToAsciiMath,
    });

    editor.destroy();
    expect(container.innerHTML).toBe('');
    expect(editor.mathEditor).toBeNull();
  });
});
