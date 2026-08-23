/**
 * Ambient declarations for the OFFLINE test typecheck (tsconfig.test.json only).
 *
 * Why this exists: the test tsconfig sets `"types": []`, so `@types/node` is not
 * pulled in even when node_modules is present. That makes `npm run test:types`
 * produce the SAME result with or without an install — which matters because the
 * engine/scoring layer must stay verifiable in environments where the npm
 * registry is unreachable.
 *
 * This file is deliberately excluded from the app's own tsconfig.json, so it can
 * never shadow the real @types/node during `npm run typecheck` or `next build`.
 */

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  argv: string[];
};

declare module 'node:test' {
  interface TestContext {
    name: string;
    diagnostic(message: string): void;
  }
  type TestFn = (t: TestContext) => void | Promise<void>;
  function test(name: string, fn: TestFn): Promise<void>;
  function describe(name: string, fn: () => void): void;
  function it(name: string, fn: TestFn): void;
  function before(fn: () => void | Promise<void>): void;
  function beforeEach(fn: () => void | Promise<void>): void;
  function after(fn: () => void | Promise<void>): void;
  function afterEach(fn: () => void | Promise<void>): void;
  export { test, describe, it, before, beforeEach, after, afterEach };
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, expected?: string | RegExp | object, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    rejects(fn: () => Promise<unknown>, expected?: string | RegExp | object, message?: string): Promise<void>;
    doesNotReject(fn: () => Promise<unknown>, message?: string): Promise<void>;
    strictEqual(actual: unknown, expected: unknown, message?: string): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
    match(actual: string, expected: RegExp, message?: string): void;
    fail(message?: string): never;
  }
  const assert: Assert;
  export default assert;
}
