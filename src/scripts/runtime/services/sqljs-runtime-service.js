const DEFAULT_SQL_JS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/';

const sharedSqlJsRuntimeState = {
  sharedSQL: null,
  setupPromise: null,
  scriptPromises: new Map(),
};

function getCspNonce() {
  if (typeof document === 'undefined') {
    return '';
  }

  const currentScript = document.currentScript;
  const currentNonce = currentScript?.nonce || currentScript?.getAttribute?.('nonce');

  if (currentNonce) {
    return currentNonce;
  }

  const integrationNonce = typeof window !== 'undefined'
    ? window?.H5PIntegration?.nonce
    : '';

  if (integrationNonce) {
    return integrationNonce;
  }

  const nonceSource = document.querySelector('script[nonce], link[nonce], style[nonce], meta[name="csp-nonce"]');

  return nonceSource?.nonce
    || nonceSource?.content
    || nonceSource?.getAttribute?.('nonce')
    || nonceSource?.getAttribute?.('content')
    || '';
}

function applyCspNonce(element) {
  const nonce = getCspNonce();

  if (nonce) {
    element.setAttribute('nonce', nonce);
  }
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function normalizeSqlJsRuntimeUrls(url) {
  const rawUrl = String(url || '').trim() || DEFAULT_SQL_JS_URL;

  if (/\.js(?:[?#].*)?$/i.test(rawUrl)) {
    const lastSlashIndex = rawUrl.lastIndexOf('/');
    const baseUrl = lastSlashIndex >= 0
      ? rawUrl.slice(0, lastSlashIndex + 1)
      : '';

    return {
      baseUrl,
      scriptUrl: rawUrl,
      wasmUrl: `${baseUrl}sql-wasm.wasm`,
    };
  }

  const baseUrl = ensureTrailingSlash(rawUrl);

  return {
    baseUrl,
    scriptUrl: `${baseUrl}sql-wasm.js`,
    wasmUrl: `${baseUrl}sql-wasm.wasm`,
  };
}

function loadExternalScript(url, marker) {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('External sql.js runtime requires a browser window.'));
  }

  const existingPromise = sharedSqlJsRuntimeState.scriptPromises.get(url);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.dataset.h5pSqljsRuntime = marker;
    applyCspNonce(script);
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load sql.js runtime script: ${url}`));
    document.head.appendChild(script);
  }).catch((error) => {
    sharedSqlJsRuntimeState.scriptPromises.delete(url);
    throw error;
  });

  sharedSqlJsRuntimeState.scriptPromises.set(url, promise);
  return promise;
}

export async function warmupSharedSqlJs(url) {
  if (sharedSqlJsRuntimeState.sharedSQL) {
    return sharedSqlJsRuntimeState.sharedSQL;
  }

  if (sharedSqlJsRuntimeState.setupPromise) {
    return sharedSqlJsRuntimeState.setupPromise;
  }

  const runtimeUrls = normalizeSqlJsRuntimeUrls(url);

  sharedSqlJsRuntimeState.setupPromise = (async () => {
    await loadExternalScript(runtimeUrls.scriptUrl, 'loader');

    if (typeof window?.initSqlJs !== 'function') {
      throw new Error('sql.js runtime loaded, but initSqlJs is unavailable.');
    }

    const sql = await window.initSqlJs({
      locateFile: () => runtimeUrls.wasmUrl,
    });

    sharedSqlJsRuntimeState.sharedSQL = sql;
    return sql;
  })().catch((error) => {
    sharedSqlJsRuntimeState.setupPromise = null;
    throw error;
  });

  return sharedSqlJsRuntimeState.setupPromise;
}

export function resetSharedSqlJsState() {
  sharedSqlJsRuntimeState.sharedSQL = null;
  sharedSqlJsRuntimeState.setupPromise = null;
}
