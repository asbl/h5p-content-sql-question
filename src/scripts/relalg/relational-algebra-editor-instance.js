import { buildRelationalAlgebraKeyboardLayout } from './relational-algebra-keyboard';
import { translateLaTeXToSQL } from './relational-algebra-translator';

/**
 * Relational-algebra editor instance implementing the EditorAdapter interface
 * used by EditorManager.
 *
 * Wraps H5P.MathEditor (MathLive) and exposes the generated SQL via getCode(),
 * analogous to how BlocklyEditorInstance exposes generated source. This lets
 * the existing SQL runtime pipeline consume relational algebra unchanged.
 *
 * Interface contract (mirrors CodeMirrorInstance public API):
 *   getCode()            → string (always returns translator-generated SQL)
 *   setCode(code)        → reloads the LaTeX input
 *   setTheme(theme)      → applies container theme
 *   setFixedLines(n)     → no-op (MathLive manages its own height)
 *   restoreDynamicHeight()
 *   destroy()
 *
 * Options (subset of the shared options passed by EditorManager):
 *   - onChangeCallback(code)  called with the generated SQL whenever the
 *     MathLive field changes
 *   - resizeActionHandler()  forwarded to MathLive geometry changes
 *   - convertLatexToAsciiMath  optional MathLive function injection for tests
 */
export default class RelationalAlgebraEditorInstance {
  constructor(target, content = '', codingLanguage, options = {}) {
    // `target instanceof HTMLElement` requires a browser DOM; fall back to a
    // duck-type check so the adapter also works in non-browser test runtimes.
    this.parentElement = isHtmlElement(target) ? target : null;
    this._initialLatex = String(content || '');
    this.codingLanguage = codingLanguage;
    this.options = {
      readonly: false,
      onChangeCallback: () => {},
      resizeActionHandler: () => {},
      theme: 'light',
      convertLatexToAsciiMath: null,
      ...options,
    };

    this.mathEditor = null;
    this.previewElement = null;
    this.root = null;

    this._createEditor();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Returns the SQL generated from the current relational-algebra input.
   * @returns {string} SQL SELECT statement (or empty string on parse error).
   */
  getCode() {
    const latex = this.mathEditor?.getValue?.() ?? '';
    if (!latex.trim()) return '';

    try {
      return translateLaTeXToSQL(latex, {
        convertLatexToAsciiMath: this.options.convertLatexToAsciiMath,
      });
    }
    catch (error) {
      this._showPreviewError(error);
      return '';
    }
  }

  /**
   * Returns the raw LaTeX input, used for persistence and round-tripping.
   * @returns {string} LaTeX source.
   */
  getTemplateCode() {
    return this.mathEditor?.getValue?.() ?? this._initialLatex;
  }

  /**
   * Replaces the editor input with the given LaTeX.
   * @param {string} latex LaTeX source.
   */
  setCode(latex) {
    this._initialLatex = String(latex ?? '');
    this.mathEditor?.setValue?.(this._initialLatex);
    this._refreshPreview();
  }

  /**
   * Updates the container theme. MathLive theming is minimal here.
   * @param {string} theme Theme variant.
   */
  setTheme(theme) {
    this.options.theme = theme === 'dark' ? 'dark' : 'light';
    this.root?.classList.remove('theme-light', 'theme-dark');
    this.root?.classList.add(`theme-${this.options.theme}`);
  }

  /** Focuses the MathLive field. */
  focus() {
    this.mathEditor?.focus?.();
  }

  /** No-op: MathLive manages its own height. */
  setFixedLines() {}

  /** No-op: MathLive manages its own height. */
  restoreDynamicHeight() {}

  /** Disposes the MathLive field and removes all DOM nodes. */
  destroy() {
    this.mathEditor?.destroy?.();
    this.mathEditor = null;
    if (this.parentElement) {
      this.parentElement.innerHTML = '';
    }
    this.root = null;
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  _createEditor() {
    if (!this.parentElement || typeof globalThis.H5P?.MathEditor !== 'function') {
      return;
    }

    const root = document.createElement('div');
    root.className = `relalg-editor theme-${this.options.theme}`;

    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'relalg-editor-field-wrapper';

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'relalg-sql-preview-wrapper';
    previewWrapper.hidden = true;

    this.previewElement = document.createElement('div');
    previewWrapper.append(this.previewElement);

    root.append(editorWrapper, previewWrapper);
    this.parentElement.append(root);
    this.root = root;

    const convert = this.options.convertLatexToAsciiMath;
    this.mathEditor = new globalThis.H5P.MathEditor(editorWrapper, {
      placeholder: '\\sigma_{\\ldots}(R)',
      initialValue: this._initialLatex,
      onChangeCallback: () => {
        this._refreshPreview();
        this.options.onChangeCallback(this.getCode());
        this.options.resizeActionHandler();
      },
      // Allow tests to inject a server-side MathLive converter.
      ...(convert ? { convertLatexToAsciiMath: convert } : {}),
    });

    this._configureKeyboard();
    this._configureShortcuts();

    if (this.options.readonly) {
      this.mathEditor.disable?.();
    }

    this._refreshPreview();
  }

  /**
   * Registers the RA virtual keyboard layout while the field is focused.
   */
  _configureKeyboard() {
    const field = this.mathEditor?.mathField;
    if (!field) return;

    const layout = buildRelationalAlgebraKeyboardLayout();

    field.addEventListener('focusin', () => {
      if (window.mathVirtualKeyboard) {
        window.mathVirtualKeyboard.layouts = [layout, 'numeric'];
        window.mathVirtualKeyboard.visible = true;
      }
    });
    field.addEventListener('focusout', () => {
      window.mathVirtualKeyboard?.hide?.();
    });
  }

  /**
   * Registers inline shortcuts for operator names. Word-like shortcuts must not
   * fire in the middle of identifiers, otherwise typing table names such as
   * `world` would replace the `or` segment with `\lor`.
   */
  _configureShortcuts() {
    const field = this.mathEditor?.mathField;
    if (!field) return;

    const atWordBoundary = 'nothing+space+openfence+relop+binop+punct';
    const shortcut = (value, after = atWordBoundary) => ({ value, after });
    const inlineShortcuts = {
      sigma: shortcut('\\sigma'),
      pi: shortcut('\\pi'),
      rho: shortcut('\\rho'),
      join: shortcut('\\bowtie'),
      union: shortcut('\\cup'),
      cross: shortcut('\\times'),
      and: { value: '', after: 'nothing' },
      or: { value: '', after: 'nothing' },
      not: { value: '', after: 'nothing' },
      cap: { value: '', after: 'nothing' },
      cup: { value: '', after: 'nothing' },
    };
    const applyInlineShortcuts = () => {
      field.inlineShortcuts = inlineShortcuts;
      field._mathfield?.setOptions?.({ inlineShortcuts });
      if (field._mathfield?.options) {
        field._mathfield.options.inlineShortcuts = inlineShortcuts;
      }
    };
    applyInlineShortcuts();
    field.addEventListener?.('mount', applyInlineShortcuts);
    queueMicrotask?.(applyInlineShortcuts);
    globalThis.setTimeout?.(applyInlineShortcuts, 0);

    const previousInlineShortcutHook = field.onInlineShortcut;
    field.onInlineShortcut = (sender, symbol) => {
      const operatorShortcut = {
        and: '\\land',
        or: '\\lor',
        not: '\\lnot',
        cap: '\\cap',
        cup: '\\cup',
      }[symbol];

      if (operatorShortcut) {
        return hasSeparatorBeforeShortcut(sender, symbol) ? operatorShortcut : '';
      }

      return previousInlineShortcutHook?.(sender, symbol) ?? '';
    };
  }

  _refreshPreview() {
    if (!this.previewElement) return;

    const latex = this.mathEditor?.getValue?.() ?? '';
    const previewWrapper = this.previewElement.parentElement;
    if (!latex.trim()) {
      previewWrapper.hidden = true;
      this.previewElement.textContent = '';
      return;
    }

    try {
      const sql = translateLaTeXToSQL(latex, {
        convertLatexToAsciiMath: this.options.convertLatexToAsciiMath,
      });
      previewWrapper.hidden = false;
      this.previewElement.textContent = sql || '';
    }
    catch (error) {
      this._showPreviewError(error);
    }
  }

  _showPreviewError(error) {
    const previewWrapper = this.previewElement?.parentElement;
    if (!previewWrapper || !this.previewElement) return;
    previewWrapper.hidden = false;
    this.previewElement.textContent = `⚠ ${error?.message ?? 'Ungültige Eingabe'}`;
  }
}

function isHtmlElement(value) {
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) {
    return true;
  }
  // Duck-type fallback for non-browser runtimes (e.g. Node test environment).
  return value !== null && typeof value === 'object' && typeof value.appendChild === 'function';
}

function hasSeparatorBeforeShortcut(mathfield, symbol) {
  const leftSiblings = getLeftSiblings(mathfield);
  const atomBeforeShortcut = leftSiblings[Math.max(0, String(symbol).length - 1)];

  if (!atomBeforeShortcut || atomBeforeShortcut.type === 'first') {
    return false;
  }

  if (isIdentifierAtom(atomBeforeShortcut)) {
    return false;
  }

  return [
    'space',
    'mopen',
    'mrel',
    'mbin',
    'mpunct',
    'minner',
    'array',
  ].includes(atomBeforeShortcut.type);
}

function getLeftSiblings(mathfield) {
  const model = mathfield?.model;
  let atom = model?.at?.(Math.min(model.position, model.anchor));
  const siblings = [];

  while (atom?.type && atom.type !== 'first') {
    siblings.push(atom);
    atom = atom.leftSibling;
  }

  return siblings;
}

function isIdentifierAtom(atom) {
  if (!atom) return false;
  if (atom.mode === 'text') return /[A-Za-z0-9]$/.test(String(atom.value || ''));
  return atom.type === 'mord' && /[A-Za-z0-9]$/.test(String(atom.value || ''));
}
