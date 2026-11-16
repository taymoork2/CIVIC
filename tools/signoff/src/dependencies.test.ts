import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
// oxlint-disable-next-line vitest/no-import-node-test -- Execute the real runner in disposable Git repositories.
import { test as scenario } from "node:test";
import { ownedTemp } from "../civic-test-temp.ts";
import { verify } from "./signoff.ts";
import type { Check } from "./config.ts";

const invoke = (source: string, overrides: NodeJS.ProcessEnv = {}) => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  // pnpm injects module hooks; fixture proofs need a fresh process without inherited loaders.
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;

  return execFileSync(process.execPath, ["--input-type=module", "-e", source], { env: { ...env, ...overrides }, encoding: "utf-8" });
};

const fixture = () => {
  const temp = ownedTemp("signoff-graph-");
  const root = temp.directory;
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf-8" }).trim();

  const write = (file: string, value: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  };

  const commit = () => { git("add", "."); git("commit", "-qm", "test: Change graph fixture"); 

  return git("rev-parse", "HEAD"); };

  const checks = [
    { name: "units", argv: [process.execPath, "--test", "src/a.test.ts", "src/b.test.ts"], paths: ["src/"] },
    { name: "script", argv: [process.execPath, "scripts/check.ts"], paths: ["src/"] },
  ];

  git("init", "-qb", "main");
  write(".signoff.json", JSON.stringify({ checks }));
  write("package.json", '{"type":"module"}');
  write("tsconfig.json", '{"compilerOptions":{"module":"NodeNext","moduleResolution":"NodeNext","allowImportingTsExtensions":true,"noEmit":true},"include":["**/*.ts"]}');
  write("src/leaf.ts", "export const leaf = 1;\n");
  write("src/middle.ts", "export { leaf } from './leaf.ts';\n");
  write("src/a.test.ts", "import assert from 'node:assert/strict'; import { leaf } from './middle.ts'; assert.ok(leaf > 0); console.log('executed a');\n");
  write("src/b.test.ts", "import assert from 'node:assert/strict'; assert.ok(true); console.log('executed b');\n");
  write("scripts/config.ts", "export const value = 1;\n");
  write("scripts/check.ts", "import { value } from './config.ts'; console.log('executed script', value);\n");
  commit();
  git("switch", "-qc", "work");
  write("src/leaf.ts", "export const leaf = 2;\n");
  commit();

  const run = async (options = {}, module = path.join(import.meta.dirname, "signoff.ts")) => invoke(`import { signoff } from ${JSON.stringify(module)}; if (!await signoff(${JSON.stringify(root)}, ${JSON.stringify({ noWait: true, ...options })})) process.exitCode = 1;`);

  const prove = (check: Check, env?: NodeJS.ProcessEnv) => {
    const result: unknown = JSON.parse(invoke(`import { dependencyGraph } from ${JSON.stringify(path.join(import.meta.dirname, "dependencies.ts"))}; const graph = await dependencyGraph(${JSON.stringify(root)}); try { console.log(JSON.stringify(graph.prove(${JSON.stringify(check)}))); } finally { graph.close(); }`, env));

    return result;
  };

  // Sign-off runs with colour on; match the words, not the escape codes.
  const log = () => stripVTControlCharacters(readFileSync(path.join(root, ".git/orca-signoff", `${git("rev-parse", "HEAD")}.log`), "utf-8"));

  return { ...temp, root, git, write, commit, run, prove, log };
};

const vitestFixture = () => {
  const f = fixture();
  const checks = [{ name: "units", argv: ["pnpm", "--filter", "@fixture/server", "test", "src/"], paths: ["src/"] }];
  f.write(".signoff.json", JSON.stringify({ checks }));
  f.write(".gitignore", "node_modules/\n");
  f.write("package.json", JSON.stringify({ name: "@fixture/server", private: true, type: "module", scripts: { test: "vp test run -c vitest.config.ts" } }));
  f.write("vitest.config.ts", "import { defineConfig } from 'vite-plus'; export default defineConfig({test:{maxWorkers:1,include:['src/**/*.test.ts']}});\n");
  f.write("src/a.test.ts", "import { test, expect } from 'vite-plus/test'; import { leaf } from './middle.ts'; test('a', () => {expect(leaf).toBeGreaterThan(0); console.log('executed a');});\n");
  f.write("src/b.test.ts", "import { test, expect } from 'vite-plus/test'; test('b', () => {expect(true).toBe(true); console.log('executed b');});\n");
  mkdirSync(path.join(f.root, "node_modules/.bin"), { recursive: true });
  symlinkSync(path.resolve(import.meta.dirname, "../../../packages/node_modules/vite-plus"), path.join(f.root, "node_modules/vite-plus"));
  symlinkSync(path.resolve(import.meta.dirname, "../../../packages/node_modules/.bin/vp"), path.join(f.root, "node_modules/.bin/vp"));
  f.commit();
  f.git("branch", "-f", "main");
  f.write("src/leaf.ts", "export const leaf = 3;\n");
  f.commit();

  return { ...f, checks };
};

await scenario("a leaf edit executes only transitive importing tests and the aggregate still verifies", async () => {
  const f = fixture();

  try {
    await f.run();
    f.write("src/leaf.ts", "export const leaf = 3;\n");
    const sha = f.commit();
    const dry = await f.run({ dryRun: true });
    assert.match(dry, /src\/b.test.ts.*not affected: no import path from src\/leaf.ts/u);
    await f.run();
    assert.match(f.log(), /executed a/u);
    assert.doesNotMatch(f.log(), /executed b|executed script/u);
    assert.equal(verify(f.root, sha), "full");
    await f.run({ fresh: true });
    assert.match(f.log(), /executed b/u);
  } finally { f.cleanup(); }
});

await scenario("a shared script changes only checks whose resolved closure contains it", async () => {
  const f = fixture();

  try {
    await f.run();
    f.write("scripts/config.ts", "export const value = 2;\n");
    f.commit();
    const dry = await f.run({ dryRun: true });
    assert.match(dry, /units:.*reuse.*not affected: no import path from scripts\/config.ts/u);
    await f.run();
    assert.match(f.log(), /executed script 2/u);
    assert.doesNotMatch(f.log(), /executed a|executed b/u);
  } finally { f.cleanup(); }
});

await scenario("file passes from different commits combine without claiming one commit passed the whole input set", async () => {
  const f = fixture();

  try {
    f.write("src/other.ts", "export const other = 1;\n");
    f.write("src/b.test.ts", "import assert from 'node:assert/strict'; import { other } from './other.ts'; assert.ok(other > 0); console.log('executed b');\n");
    f.commit();
    await f.run();
    f.write("src/other.ts", "export const other = 2;\n");
    f.commit();
    await f.run();
    f.write("src/leaf.ts", "export const leaf = 3;\n");
    f.commit();
    await f.run();
    f.write("src/other.ts", "export const other = 1;\n");
    const sha = f.commit();
    assert.match(await f.run({ dryRun: true }), /units:.*reuse: matching proof for every discovered file/u);
    await f.run();
    assert.equal(f.log(), "");
    assert.equal(verify(f.root, sha), "full");
  } finally { f.cleanup(); }
});

await scenario("new and renamed discovered tests cannot inherit another file's pass", async () => {
  const f = fixture();

  try {
    f.write(".signoff.json", JSON.stringify({ checks: [{ name: "units", argv: [process.execPath, "--test", "src/*.test.ts"], paths: ["src/"] }] }));
    f.commit();
    f.git("branch", "-f", "main");
    f.write("src/leaf.ts", "export const leaf = 3;\n");
    f.commit();
    await f.run();
    f.write("src/new.test.ts", "console.log('executed new');\n");
    f.commit();
    await f.run();
    assert.match(f.log(), /executed new/u);
    renameSync(path.join(f.root, "src/new.test.ts"), path.join(f.root, "src/renamed.test.ts"));
    f.commit();
    await f.run();
    assert.match(f.log(), /executed new/u);
  } finally { f.cleanup(); }
});

await scenario("unresolved imports, computed reads and discovery config changes use full execution", async () => {
  const f = fixture();

  try {
    await f.run();
    f.write("src/b.test.ts", "import { readFileSync } from 'node:fs'; import path from 'node:path'; console.log('executed b', readFileSync(path.join('src', 'leaf.ts'), 'utf8'));\n");
    f.commit();
    await f.run();
    f.write("src/leaf.ts", "export const leaf = 4;\n");
    f.commit();
    const dry = await f.run({ dryRun: true });
    assert.match(dry, /dependency proof unavailable/u);
    await f.run();
    assert.match(f.log(), /executed a/u);
    assert.match(f.log(), /executed b/u);
  } finally { f.cleanup(); }
});

await scenario("the real Vite runner selects leaf importers and a config edit reruns the whole suite", async () => {
  const f = vitestFixture();

  try {
    await f.run();
    f.write("src/leaf.ts", "export const leaf = 4;\n");
    f.commit();
    await f.run();
    assert.match(f.log(), /Test Files\s+1 passed \(1\)/u);
    f.write("vitest.config.ts", "import { defineConfig } from 'vite-plus'; export default defineConfig({test:{maxWorkers:1,testTimeout:12000,include:['src/**/*.test.ts']}});\n");
    f.commit();
    await f.run();
    assert.match(f.log(), /Test Files\s+2 passed \(2\)/u);
  } finally { f.cleanup(); }
});

await scenario("unknown imports, shared state, plugins and arbitrary discovery cannot produce a proof", () => {
  const f = vitestFixture();

  try {
    const cases: [string, string][] = [
      ["src/b.test.ts", "import './missing.ts';\n"],
      ["src/b.test.ts", "const target = './leaf.ts'; await import(target);\n"],
      ["src/b.test.ts", "import { run } from 'node:test'; run({files:['elsewhere.ts']});\n"],
      ["src/b.test.ts", "import { test } from 'vite-plus/test'; test.extend({});\n"],
      ["src/b.test.ts", "new Worker('./worker.ts');\n"],
      ["vitest.config.ts", "export default {test:{isolate:false}};\n"],
      ["vitest.config.ts", "export default {plugins:[],test:{}};\n"],
      ["vitest.config.ts", "export default {test:{include:['src/**/*.ts']}};\n"],
    ];

    for (const [file, content] of cases) {
      f.write("vitest.config.ts", "export default {test:{include:['src/**/*.test.ts']}};\n");
      f.write("src/b.test.ts", "console.log('safe');\n");
      f.write(file, content);
      f.commit();
      const result = f.prove(f.checks[0] ?? assert.fail("missing check"));

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A failed proof is an explanation, not a cache key or executable plan.
      assert.equal(typeof result, "string");
    }
  } finally { f.cleanup(); }
});

await scenario("ambient Node loaders and module paths cannot produce a proof", () => {
  const f = fixture();
  const check = { name: "units", argv: [process.execPath, "--test", "src/a.test.ts", "src/b.test.ts"] };

  try {
    for (const env of [{ NODE_OPTIONS: "--import=data:text/javascript," }, { NODE_PATH: f.root }]) {
      assert.equal(f.prove(check, env), "Ambient Node loaders or module paths");
    }
  } finally { f.cleanup(); }
});

await scenario("a missing TypeScript installation falls back to running the full original command", async () => {
  const f = fixture();

  try {
    mkdirSync(path.join(f.root, "tool"));

    for (const file of readdirSync(import.meta.dirname).filter(candidate => candidate.endsWith(".ts") && !candidate.endsWith(".test.ts"))) {
      cpSync(path.join(import.meta.dirname, file), path.join(f.root, "tool", file));
    }

    f.commit();
    const runner = path.join(f.root, "tool/signoff.ts");
    await f.run({}, runner);
    f.write("src/leaf.ts", "export const leaf = 4;\n");
    f.commit();
    assert.match(await f.run({ dryRun: true }, runner), /dependency proof unavailable:.*typescript/u);
    await f.run({}, runner);
    assert.match(f.log(), /executed a/u);
    assert.match(f.log(), /executed b/u);
  } finally { f.cleanup(); }
});

await scenario("JSX cannot hide an implicit runtime dependency from the proof", () => {
  const f = vitestFixture();

  try {
    f.write("vitest.config.ts", "export default {test:{include:['src/**/*.test.{ts,tsx}']}};\n");
    f.write("src/implicit.test.tsx", "const element = <div />; console.log(element);\n");
    f.commit();
    const result = f.prove(f.checks[0] ?? assert.fail("missing check"));

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- An incomplete proof must explain full execution instead of yielding a cache identity.
    assert.ok(typeof result === "string");
    assert.match(result, /Unmodelled module semantics/u);
  } finally { f.cleanup(); }
});

await scenario("Playwright config edits rerun every browser file and application dependencies invalidate them", async () => {
  const f = fixture();

  try {
    const check = { name: "browser", cwd: "apps/web", argv: ["pnpm", "exec", "playwright", "test", "-c", "e2e/core.config.ts"] };
    f.write(".signoff.json", JSON.stringify({ checks: [check] }));
    f.write(".gitignore", "node_modules/\n");
    f.write("apps/web/e2e/core.config.ts", "import { defineConfig } from '@playwright/test'; export default defineConfig({testDir:'core',testMatch:['*.test.ts'],workers:1,reporter:'line'});\n");
    f.write("apps/web/e2e/core/a.test.ts", "import { test, expect } from '@playwright/test'; import { leaf } from '../../../../src/leaf.ts'; test('a', () => {expect(leaf).toBeGreaterThan(0);});\n");
    f.write("apps/web/e2e/core/b.test.ts", "import { test, expect } from '@playwright/test'; test('b', () => {expect(true).toBe(true);});\n");
    f.write("apps/web/src/application.ts", "export const application = 1;\n");
    mkdirSync(path.join(f.root, "node_modules/@playwright"), { recursive: true });
    mkdirSync(path.join(f.root, "node_modules/.bin"), { recursive: true });
    symlinkSync(path.resolve(import.meta.dirname, "../../../packages/canvas/node_modules/@playwright/test"), path.join(f.root, "node_modules/@playwright/test"));
    symlinkSync(path.resolve(import.meta.dirname, "../../../packages/canvas/node_modules/.bin/playwright"), path.join(f.root, "node_modules/.bin/playwright"));
    f.commit();
    f.git("branch", "-f", "main");
    f.write("src/leaf.ts", "export const leaf = 3;\n");
    f.commit();
    await f.run();
    f.write("src/leaf.ts", "export const leaf = 4;\n");
    f.commit();
    assert.match(await f.run({ dryRun: true }), /b.test.ts.*reuse:.*not affected/u);
    await f.run();
    assert.match(f.log(), /1 passed/u);
    f.write("apps/web/e2e/core.config.ts", "import { defineConfig } from '@playwright/test'; export default defineConfig({testDir:'core',testMatch:['*.test.ts'],workers:1,reporter:'line',timeout:12000});\n");
    f.commit();
    await f.run();
    assert.match(f.log(), /2 passed/u);
    f.write("apps/web/src/application.ts", "export const application = 2;\n");
    f.commit();
    await f.run();
    assert.match(f.log(), /2 passed/u);
  } finally { f.cleanup(); }
});
