import { beforeEach, describe, expect, it, vi } from 'vitest';

class RuntimeStub {
  constructor() {
    this.options = {};
  }
}

H5P.Runtime = RuntimeStub;
H5P.TestRuntimeMixin = (Base) => class extends Base {
  constructor(resize, code, codeTester, options) {
    super();
    this.codeTester = codeTester;
    this.options = options;
  }
};
H5P.SolutionRuntimeMixin = (Base) => class extends Base {};

const { default: SQLTestRuntime } = await import('../src/scripts/runtime/runtime-test-sql.js');

describe('SQLTestRuntime query constraints', () => {
  let tester;

  beforeEach(() => {
    tester = { setQueryConstraintResult: vi.fn() };
  });

  function createRuntime(options) {
    const runtime = new SQLTestRuntime(vi.fn(), 'SELECT 1', tester, options);
    runtime.getCode = () => 'SELECT a FROM t JOIN u ON t.id = u.id';
    return runtime;
  }

  it('hands the structural check result to the tester', () => {
    createRuntime({ queryConstraints: { requiredKeywords: 'JOIN, GROUP BY' }, l10n: {} })
      .checkQueryConstraints();

    expect(tester.setQueryConstraintResult).toHaveBeenCalledTimes(1);
    const result = tester.setQueryConstraintResult.mock.calls[0][0];
    expect(result.passed).toBe(false);
    expect(result.violations).toEqual(['Required: GROUP BY']);
    expect(result.checks.map((check) => check.passed)).toEqual([true, false]);
  });

  it('does nothing without configured requirements', () => {
    createRuntime({ l10n: {} }).checkQueryConstraints();
    createRuntime({ queryConstraints: { requiredKeywords: ' ' }, l10n: {} }).checkQueryConstraints();

    expect(tester.setQueryConstraintResult).not.toHaveBeenCalled();
  });
});
