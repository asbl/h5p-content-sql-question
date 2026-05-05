import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runnerCtor: vi.fn(),
}));

globalThis.H5P.Runtime = class {
  setup(codeContainer) {
    this.codeContainer = codeContainer;
  }
};

vi.mock('../src/scripts/runtime/sqlrunner.js', () => ({
  default: class SQLRunnerMock {
    constructor(...args) {
      mocks.runnerCtor(...args);
    }
  },
}));

const { default: SQLRuntime } = await import('../src/scripts/runtime/runtime-sql.js');

describe('SQLRuntime', () => {
  beforeEach(() => {
    mocks.runnerCtor.mockClear();
  });

  it('builds runner options without mutating runtime options', () => {
    const runtime = new SQLRuntime();
    runtime.options = { maxRows: 25 };

    runtime.getRunner();

    expect(mocks.runnerCtor).toHaveBeenCalledWith(runtime, {
      maxRows: 25,
      tableFormat: 'markdown',
    });
    expect(runtime.options).toEqual({ maxRows: 25 });
  });

  it('keeps an explicit table format when creating runner options', () => {
    const runtime = new SQLRuntime();
    runtime.options = { maxRows: 5, tableFormat: 'html' };

    expect(runtime.getRunnerOptions()).toEqual({
      maxRows: 5,
      tableFormat: 'html',
    });
  });

  it('creates a console manager during setup when available', () => {
    const runtime = new SQLRuntime();
    const consoleManager = { write: vi.fn() };
    runtime.createConsoleManager = vi.fn(() => consoleManager);

    runtime.setup({});

    expect(runtime.createConsoleManager).toHaveBeenCalledTimes(1);
    expect(runtime._consoleManager).toBe(consoleManager);
  });

  it('writes safely even when no console manager exists', () => {
    const runtime = new SQLRuntime();

    expect(() => runtime.writeConsoleSafe('message')).not.toThrow();
  });

  it('handles onError safely without an initialized console manager', () => {
    const runtime = new SQLRuntime();
    const stop = vi.fn();
    const showCodePage = vi.fn();
    runtime.codeContainer = {
      getStateManager: () => ({ stop }),
      showCodePage,
    };

    expect(() => runtime.onError('db error')).not.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(showCodePage).toHaveBeenCalledTimes(1);
  });
});