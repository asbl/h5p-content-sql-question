#!/usr/bin/env node
/**
 * Pre-build script: compiles each SQL preset (.js) into a binary SQLite .db
 * file alongside it in src/scripts/databases/.
 *
 * Run automatically via "prebuild" in package.json, or manually:
 *   node scripts/build-databases.mjs
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// sql.js CJS build — locates its own WASM relative to node_modules/sql.js/dist/
const initSqlJs = require('sql.js');

const dbDir = join(__dirname, '../src/scripts/databases');

const presets = [
  'world', 'world23', 'world23v2',
  'bus', 'teachers', 'nobel', 'movie',
  'euro2012',
];

const SQL = await initSqlJs();

console.log('Building database presets...');
for (const name of presets) {
  const { default: sql } = await import(pathToFileURL(join(dbDir, `${name}.js`)).href);
  const db = new SQL.Database();
  db.run(sql);
  const data = db.export();   // Uint8Array — binary SQLite file
  writeFileSync(join(dbDir, `${name}.db`), Buffer.from(data));
  console.log(`  ${name}.db  ${data.byteLength} bytes`);
  db.close();
}
console.log('Done.');
