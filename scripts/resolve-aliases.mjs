#!/usr/bin/env node
/**
 * Rewrite `require("@/…")` → a relative path inside the compiled test build.
 *
 * TypeScript resolves the `@/*` path alias at typecheck time but emits the
 * specifier verbatim, which Node cannot resolve. Rather than add a runtime
 * dependency (tsconfig-paths / vitest / jest — none of which can be installed in
 * a network-restricted environment), this 30-line pass fixes the emitted JS so
 * `node --test .test-build/` runs with zero dependencies.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

const ROOT = process.argv[2] || '.test-build';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

let files = 0;
let rewrites = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const next = src.replace(/require\((["'])@\/([^"']+)\1\)/g, (_m, q, sub) => {
    rewrites++;
    let rel = relative(dirname(file), join(ROOT, sub)).split(sep).join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `require(${q}${rel}${q})`;
  });
  if (next !== src) {
    writeFileSync(file, next);
    files++;
  }
}
console.log(`resolve-aliases: rewrote ${rewrites} specifier(s) across ${files} file(s) in ${ROOT}`);
