/**
 * ESM resolve hook mapping the "@/..." alias to the project root, so the
 * TypeScript sources can be executed directly by
 * `node --test --experimental-strip-types` with NO build and NO npm install.
 * Complements the tsc-based `npm test` (which type-checks first).
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = path.join(root, specifier.slice(2));
    for (const ext of ['.ts', '.tsx', '/index.ts', '']) {
      try {
        return await nextResolve(pathToFileURL(target + ext).href, context);
      } catch { /* try the next candidate */ }
    }
  }
  return nextResolve(specifier, context);
}
