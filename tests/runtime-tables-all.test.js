import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  singleRuntimeCtor: vi.fn(),
  singleRuntimeCtorSnapshots: [],
  singleSetup: vi.fn(),
  singlePrepareForRun: vi.fn(),
  singleRun: vi.fn(),
}));

globalThis.H5P.Runtime = class {
  constructor(resizeActionHandler, code, options) {
    this.resizeActionHandler = resizeActionHandler;
    this.code = code;
    this.options = options;
  }

  setup(codeContainer) {
    this.codeContainer = codeContainer;
  }
};

vi.mock('../src/scripts/runtime/sqlrunner.js', () => ({
  default: class SQLRunnerMock {},
}));

vi.mock('../src/scripts/runtime/runtime-table-single.js', () => ({
  default: class SQLTablesRuntimeSingleMock {
    constructor(...args) {
      this.resultTable = `${args[2].tableName} rows`;
      mocks.singleRuntimeCtorSnapshots.push([
        args[0],
        args[1],
        { ...args[2] },
      ]);
      mocks.singleRuntimeCtor(...args);
    }

    setup() {
      mocks.singleSetup();
    }

    prepareForRun() {
      mocks.singlePrepareForRun();
    }

    async run() {
      mocks.singleRun();
    }
  },
}));

const { default: SQLTablesAllRuntime } = await import('../src/scripts/runtime/runtime-tables-all.sql.js');

describe('SQLTablesAllRuntime', () => {
  beforeEach(() => {
    mocks.singleRuntimeCtor.mockClear();
    mocks.singleRuntimeCtorSnapshots.length = 0;
    mocks.singleSetup.mockClear();
    mocks.singlePrepareForRun.mockClear();
    mocks.singleRun.mockClear();
  });

  it('loads each discovered table and stores the rendered output by table name', async () => {
    const runtime = new SQLTablesAllRuntime(vi.fn(), { id: 'container' }, {
      dbFile: 'db.sqlite',
    });
    const results = [{
      values: [
        ['world'],
        ['city'],
      ],
    }];

    await runtime.onSuccess(results);

    expect(runtime.tables).toBe(results);
    expect(mocks.singleRuntimeCtorSnapshots[0]).toEqual([expect.any(Function), { id: 'container' }, {
      dbFile: 'db.sqlite',
      tableName: 'world',
    }]);
    expect(mocks.singleRuntimeCtorSnapshots[1]).toEqual([expect.any(Function), { id: 'container' }, {
      dbFile: 'db.sqlite',
      tableName: 'city',
    }]);
    expect(mocks.singleSetup).toHaveBeenCalledTimes(2);
    expect(mocks.singlePrepareForRun).toHaveBeenCalledTimes(2);
    expect(mocks.singleRun).toHaveBeenCalledTimes(2);
    expect(runtime.resultTables).toEqual(new Map([
      ['world', 'world rows'],
      ['city', 'city rows'],
    ]));
  });

  it('returns early when no table names were loaded', async () => {
    const runtime = new SQLTablesAllRuntime(vi.fn(), { id: 'container' }, {
      dbFile: 'db.sqlite',
    });

    await expect(runtime.onSuccess([])).resolves.toEqual([]);

    expect(mocks.singleRuntimeCtor).not.toHaveBeenCalled();
    expect(runtime.resultTables).toEqual(new Map());
  });
});