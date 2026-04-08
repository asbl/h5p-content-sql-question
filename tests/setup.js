import { afterEach, vi } from 'vitest';

const missingTranslation = (key, library = '') => `[Missing translation ${library}:${key}]`;

class BaseCodeQuestion {
  constructor(params = {}, contentId = 0, extras = {}) {
    this.params = params;
    this.contentId = contentId;
    this.extras = extras;
    this.contentL10n = params.l10n || {};
    this.l10n = this.contentL10n;
  }

  getCodeContainerOptions() {
    return { fromParentContainer: true };
  }

  getRuntimeOptions() {
    return {
      l10n: this.contentL10n,
      fromParentRuntime: true,
    };
  }

  getDecodedCode(code = '') {
    return `decoded:${code}`;
  }
}

class BaseCodeQuestionContainer {
  constructor() {
    this.resizeActionHandler = vi.fn();
  }

  async setup() {
  }
}

globalThis.H5P = {
  CodeQuestion: BaseCodeQuestion,
  CodeQuestionContainer: BaseCodeQuestionContainer,
  t: vi.fn((key, _params, library) => missingTranslation(key, library)),
  getPath: vi.fn((path, contentId) => `resolved:${contentId}:${path}`),
  Markdown: class {
    constructor(value) {
      this.value = value;
    }

    getHTML() {
      return `<p>${this.value}</p>`;
    }
  },
  ButtonClickedObserver: class {},
  StateRunObserver: class {},
  StateStopObserver: class {},
  PageHideObserver: class {},
  PageShowObserver: class {},
};

globalThis.document = {
  documentElement: {
    lang: 'en',
  },
};

afterEach(() => {
  globalThis.document.documentElement.lang = 'en';
  globalThis.H5P.t.mockReset();
  globalThis.H5P.t.mockImplementation((key, _params, library) => missingTranslation(key, library));
  globalThis.H5P.getPath.mockClear();
  vi.restoreAllMocks();
});