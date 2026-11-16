import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import type * as AST from "typescript/unstable/ast";
import type { Snapshot } from "typescript/unstable/sync";
import type { Check } from "./config.ts";

const VERSION = `imports-v1:${createHash("sha256").update(readFileSync(import.meta.filename)).digest("hex")}`;
const CODE = /\.[cm]?[jt]sx?$/u;
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const GLOBAL = /^(?:pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.signoff\.json)$|(?:^|\/)\.env(?:\.|$)|^packages\/signoff\/|^scripts\/(?:signoff|landing-tasks)[^/]*\.ts$/u;
const TOOL_IMPORTS = new Set(["vitest", "vite-plus/test", "vite-plus", "@playwright/test"]);
const PURE_BUILTINS = new Set(["node:assert", "node:assert/strict", "node:test", "node:path", "node:url", "node:util"]);
const RUNTIME_NAMES = new Set(["require", "eval", "Function", "constructor", "globalThis", "global", "module", "fetch", "WebSocket", "XMLHttpRequest", "Worker", "SharedWorker", "importScripts", "localStorage", "sessionStorage", "indexedDB", "caches", "window", "document", "navigator", "__dirname", "__filename", "Bun", "Deno"]);
const TEST_EXPORTS = new Set(["test", "it", "describe", "suite", "expect", "assert", "before", "after", "beforeAll", "afterAll", "beforeEach", "afterEach"]);
const CONFIG_EXPORTS = new Set(["defineConfig"]);
const BUILTIN_REPORTERS = new Set(["default", "basic", "verbose", "dot", "json", "junit", "tap", "tap-flat", "hanging-process", "github-actions"]);

type Literal = string | number | boolean | Literal[] | { [key: string]: Literal };

interface LiteralObject { [key: string]: Literal }

const hash = (value: readonly unknown[]) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSON and literal AST values are validated at their input boundary.
const object = (value: unknown): value is LiteralObject => typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (value: Literal | undefined, fallback: string[] = []): string[] => {
  if (value === undefined) { return fallback; }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Runner path fields accept a literal string or array of literal strings.
  if (typeof value === "string") { return [value]; }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Reject computed discovery rather than guessing at the runner's input.
  if (Array.isArray(value) && value.every(item => typeof item === "string")) { return value; }

  throw new Error("Nonliteral file discovery");
};

const manifest = (source: string) => {
  const value: unknown = JSON.parse(source);

  if (!object(value)) { throw new Error("Invalid package manifest"); }

  return value;
};

export interface Evidence {
  version: string;
  inputs: string[];
  edges: string[][];
  discovery: string[];
  environment: [string, string | undefined][];
}

export interface FileProof { file: string; key: string; evidence: Evidence }

export interface DependencyProof { key: string; evidence: Evidence; tests: FileProof[]; command: (files: string[]) => Check }

export interface DependencyGraph { prove: (check: Check) => DependencyProof | string; close: () => void }

// shortcut: only literal runner configuration and imports are proved; plugins, runtime I/O and generated inputs run the original check.
export const dependencyGraph = async (root: string): Promise<DependencyGraph> => {
  try {
    const [ts, { API }, { version }] = await Promise.all([import("typescript/unstable/ast"), import("typescript/unstable/sync"), import("typescript")]);
    const unmodelledSyntax = new Set([ts.SyntaxKind.ImportEqualsDeclaration, ts.SyntaxKind.MetaProperty, ts.SyntaxKind.JsxElement, ts.SyntaxKind.JsxSelfClosingElement, ts.SyntaxKind.JsxFragment, ts.SyntaxKind.Decorator]);
    const listing = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
    const objects = new Map(listing.map(line => [line.slice(line.indexOf("\t") + 1), line.slice(0, line.indexOf("\t"))]));
    const readable = listing.filter(line => /^(?:100644|100755) blob /u.test(line) && /(?:\.[cm]?[jt]sx?|\.json|\.jsonc)$/u.test(line.slice(line.indexOf("\t") + 1)));
    const oids = [...new Set(readable.map(line => line.split(" ")[2]?.split("\t")[0] ?? ""))];
    const batch = execFileSync("git", ["cat-file", "--batch"], { cwd: root, input: `${oids.join("\n")}\n`, maxBuffer: 256 * 1024 * 1024 });
    const blobs = new Map<string, string>();
    let offset = 0;

    for (const oid of oids) {
      const end = batch.indexOf(10, offset);
      const size = Number(batch.subarray(offset, end).toString().split(" ")[2]);

      if (!Number.isSafeInteger(size) || size < 0) { throw new Error("Unreadable Git object"); }

      blobs.set(oid, batch.subarray(end + 1, end + 1 + size).toString());
      offset = end + 2 + size;
    }

    const contents = new Map(readable.map(line => {
      const file = line.slice(line.indexOf("\t") + 1);

      return [file, blobs.get(line.split(" ")[2]?.split("\t")[0] ?? "") ?? ""];
    }));

    const names = [...objects.keys()];
    const directories = new Map<string, { files: string[]; directories: string[] }>();

    for (const file of names) {
      let child = path.posix.basename(file);
      let parent = path.posix.dirname(file);
      let isFile = true;

      for (;;) {
        const entries = directories.get(parent) ?? { files: [], directories: [] };
        const children = isFile ? entries.files : entries.directories;

        if (!children.includes(child)) { children.push(child); }

        directories.set(parent, entries);

        if (parent === ".") { break; }

        child = path.posix.basename(parent);
        parent = path.posix.dirname(parent);
        isFile = false;
      }
    }

    const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
    const inside = (file: string) => relative(file) !== ".." && !relative(file).startsWith("../");
    const delegated = (file: string) => !inside(file) || relative(file).includes("node_modules/");

    const api = new API({ cwd: root, fs: {
      readFile: file => delegated(file) ? undefined : contents.get(relative(file)) ?? null,
      fileExists: file => delegated(file) ? undefined : contents.has(relative(file)),
      directoryExists: file => delegated(file) ? undefined : directories.has(relative(file) || "."),
      getAccessibleEntries: file => {
        // oxlint-disable-next-line unicorn/no-useless-undefined -- Undefined delegates this filesystem request to TypeScript's host.
        if (delegated(file)) { return undefined; }

        return directories.get(relative(file) || ".") ?? { files: [], directories: [] };
      },
    } });

    let snapshot: Snapshot | undefined;

    const source = (file: string) => {
      // Reject obvious opaque inputs before starting the compiler; this preflight can only force execution.
      if (/["'](?:node:)?(?:fs(?:\/promises)?|child_process|net|http|https|module|worker_threads|vm)["']/u.test(contents.get(file) ?? "")) { throw new Error(`Runtime dependency in ${file}`); }

      snapshot ??= api.updateSnapshot({ openFiles: names.values().filter(name => CODE.test(name)).map(name => path.join(root, name)).toArray() });
      const project = snapshot.getDefaultProjectForFile(path.join(root, file));
      const ast = project?.program.getSourceFile(path.join(root, file));

      if (project === undefined || ast === undefined || ast.text !== contents.get(file) || project.program.getSyntacticDiagnostics(path.join(root, file)).length > 0) { throw new Error(`Cannot parse ${file}`); }

      return { project, ast };
    };

    const identity = (files: Iterable<string>) => [...new Set(files)].toSorted().map(file => `${objects.get(file) ?? "missing"}\t${file}`);

    const ancestors = (file: string) => {
      const found: string[] = [];
      let directory = path.posix.dirname(file);

      for (;;) {
        for (const name of ["package.json", "tsconfig.json"]) {
          const candidate = path.posix.join(directory, name);

          if (objects.has(candidate)) { found.push(candidate); }
        }

        if (directory === ".") { break; }

        directory = path.posix.dirname(directory);
      }

      return found;
    };

    const literal = (node: AST.Node): Literal => {
      if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) { return ts.isStringLiteral(node) ? node.text : Number(node.text); }

      if (node.kind === ts.SyntaxKind.TrueKeyword) { return true; }

      if (node.kind === ts.SyntaxKind.FalseKeyword) { return false; }

      if (ts.isArrayLiteralExpression(node)) { return node.elements.map(literal); }

      if (ts.isObjectLiteralExpression(node)) {
        return Object.fromEntries(node.properties.map(property => {
          if (!ts.isPropertyAssignment(property) || (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))) { throw new Error("Computed configuration"); }

          return [property.name.text, literal(property.initializer)];
        }));
      }

      throw new Error("Nonliteral configuration");
    };

    const configuration = (file: string) => {
      const { ast } = source(file);
      const exported = ast.statements.find(ts.isExportAssignment)?.expression;
      const expression = exported !== undefined && ts.isCallExpression(exported) && exported.expression.getText(ast) === "defineConfig" && exported.arguments.length === 1 ? exported.arguments[0] : exported;

      if (expression === undefined) { throw new Error(`No static configuration in ${file}`); }

      const value = literal(expression);

      // oxlint-disable-next-line anti-slop/no-known-value-widening -- The same boundary guard validates JSON and decoded AST objects.
      if (!object(value)) { throw new Error("Invalid configuration"); }

      return value;
    };

    const toolVersion = (cwd: string, tool: string) => {
      const value: unknown = createRequire(path.join(root, cwd, "package.json"))(`${tool}/package.json`);

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Installed package metadata is a disk input, not a trusted tool version.
      if (!object(value) || typeof value.version !== "string") { throw new Error(`Unavailable ${tool} version`); }

      return value.version;
    };

    const closure = (roots: string[], config: string | undefined, cwd: string) => {
      const inputs = new Set(names.filter(name => GLOBAL.test(name)));
      const edges: string[][] = [];
      const environment = new Map(Object.entries(process.env).map(([key, value]) => [key, hash([value])]));
      const visited = new Set<string>();
      const configurations = new Set<string>();

      const addConfiguration = (context: string) => {
        if (configurations.has(context)) { return; }

        configurations.add(context);
        inputs.add(context);
        const settings = manifest(contents.get(context) ?? "");

        if (settings.references !== undefined) { throw new Error(`Unproved TypeScript project references in ${context}`); }

        if (object(settings.compilerOptions) && settings.compilerOptions.plugins !== undefined) { throw new Error(`Unmodelled TypeScript plugin in ${context}`); }

        for (const inherited of strings(settings.extends)) {
          if (!inherited.startsWith(".")) { throw new Error(`External TypeScript configuration in ${context}`); }

          const target = path.posix.join(path.posix.dirname(context), inherited.endsWith(".json") ? inherited : `${inherited}.json`);

          if (!contents.has(target)) { throw new Error(`Missing TypeScript configuration ${target}`); }

          addConfiguration(target);
        }
      };

      const addContext = (file: string) => {
        for (const context of ancestors(file)) {
          inputs.add(context);

          if (/tsconfig.*\.json$/u.test(context)) { addConfiguration(context); }
        }
      };

      const visit = (file: string, configFile = false) => {
        if (visited.has(file)) { return; }

        if (!objects.has(file) || !/^(?:100644|100755) blob /u.test(objects.get(file) ?? "")) { throw new Error(`Untracked or nonregular dependency ${file}`); }

        visited.add(file);
        inputs.add(file);
        addContext(file);

        if (file.endsWith(".json")) { return; }

        const { ast, project } = source(file);

        const resolve = (specifier: AST.Expression) => {
          if (!ts.isStringLiteral(specifier)) { throw new Error(`Dynamic module in ${file}`); }

          const name = specifier.text;

          if (PURE_BUILTINS.has(name) || (TOOL_IMPORTS.has(name) && (name !== "vite-plus" || configFile))) { return; }

          if (name.startsWith("node:") || TOOL_IMPORTS.has(name)) { throw new Error(`Runtime capability ${name} in ${file}`); }

          if (!name.startsWith(".") || !/\.(?:[cm]?[jt]sx?|json)$/u.test(name)) { throw new Error(`Unmodelled runtime resolution ${name} in ${file}`); }

          const declarations = project.checker.getSymbolAtLocation(specifier)?.declarations ?? [];

          const targets = [...new Set(declarations.flatMap(declaration => {
            const node = declaration.resolve(project);

            return node === undefined ? [] : [relative(node.getSourceFile().fileName)];
          }))];

          if (targets.length !== 1 || targets[0] === undefined || !objects.has(targets[0]) || targets[0].endsWith(".d.ts") || path.posix.join(path.posix.dirname(file), name) !== targets[0]) { throw new Error(`Unresolved runtime module ${name} in ${file}`); }

          edges.push([file, name, targets[0]]);
          visit(targets[0]);
        };

        const runnerImport = (node: AST.ImportDeclaration) => {
          if (ts.isStringLiteral(node.moduleSpecifier) && (TOOL_IMPORTS.has(node.moduleSpecifier.text) || node.moduleSpecifier.text === "node:test")) {
            const bindings = node.importClause?.namedBindings;

            if (node.importClause?.name !== undefined || bindings === undefined || !ts.isNamedImports(bindings)) { throw new Error(`Unmodelled runner import in ${file}`); }

            const allowed = configFile ? CONFIG_EXPORTS : TEST_EXPORTS;

            if (bindings.elements.some(binding => !allowed.has(binding.propertyName?.text ?? binding.name.text))) { throw new Error(`Unmodelled runner capability in ${file}`); }
          }
        };

        const environmentRead = (node: AST.Identifier) => {
          const { parent } = node;
          const access = parent.parent;

          if (!ts.isPropertyAccessExpression(parent) || parent.name.text !== "env" || !ts.isPropertyAccessExpression(access) || access.expression !== parent) { throw new Error(`Computed environment in ${file}`); }

          environment.set(access.name.text, hash([process.env[access.name.text]]));
        };

        const walk = (node: AST.Node) => {
          if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) { resolve(node.moduleSpecifier); }

          if (ts.isImportDeclaration(node)) { runnerImport(node); }

          if (unmodelledSyntax.has(node.kind)) { throw new Error(`Unmodelled module semantics in ${file}`); }

          if (ts.isIdentifier(node) && RUNTIME_NAMES.has(node.text)) { throw new Error(`Runtime dependency in ${file}`); }

          if (ts.isPropertyAccessExpression(node) && (node.name.text === "extend" || node.name.text === "use" || node.name.text === "mock")) { throw new Error(`Unmodelled shared fixture in ${file}`); }

          if (ts.isIdentifier(node) && node.text === "process") { environmentRead(node); }

          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) { throw new Error(`Dynamic import in ${file}`); }

          node.forEachChild(walk);
        };

        walk(ast);
      };

      if (config !== undefined) { visit(config, true); }

      for (const file of roots) { visit(file); }

      addContext(path.posix.join(cwd, "entry.ts"));
      // Snapshots and non-code fixtures are shared until the runner can prove individual ownership.

      for (const file of names.filter(name => name.startsWith(cwd === "." ? "" : `${cwd}/`) && !CODE.test(name) && !name.endsWith(".md"))) { inputs.add(file); }

      return { inputs: identity(inputs), edges: edges.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), environment: [...environment].toSorted(([a], [b]) => a.localeCompare(b)) };
    };

    const nodeCommand = (check: Check, argv: readonly string[], cwd: string) => {
      if (argv[1] !== "--test") {
        if (argv.length !== 2 || !CODE.test(argv[1] ?? "")) { throw new Error("Unknown Node command"); }

        return { cwd, filters: [], config: undefined, runner: "node", tool: process.version, replaceAt: 0, browser: false, script: path.posix.join(cwd, argv[1] ?? "") };
      }

      let replaceAt = check.argv.indexOf("--test") + 1;

      while (check.argv[replaceAt]?.startsWith("--test-concurrency=") === true) { replaceAt += 1; }

      const words = check.argv.slice(replaceAt);

      if (words.length === 0 || words.some(word => word.startsWith("-"))) { throw new Error("Unknown Node discovery"); }

      return { cwd, filters: words.map(word => path.posix.join(cwd, word)), config: undefined, runner: "node", tool: process.version, replaceAt, browser: false, script: undefined };
    };

    const vitestCommand = (check: Check, argv: readonly string[], envCount: number) => {
      const packages = names.filter(name => {
        if (!name.endsWith("package.json")) { return false; }

        try { return manifest(contents.get(name) ?? "{}").name === argv[2]; } catch { return false; }
      });

      if (packages.length !== 1 || packages[0] === undefined) { throw new Error("Unknown workspace package"); }

      const cwd = path.posix.dirname(packages[0]);
      const { scripts } = manifest(contents.get(packages[0]) ?? "{}");

      if (!object(scripts) || !/^vp test run -c vitest\.config\.ts(?: --passWithNoTests)?$/u.test(strings(scripts.test)[0] ?? "")) { throw new Error("Unknown package test script"); }

      if (scripts.pretest !== undefined || scripts.posttest !== undefined) { throw new Error("Package lifecycle hooks"); }

      const replaceAt = envCount + 4;

      return { cwd, config: path.posix.join(cwd, "vitest.config.ts"), runner: "vitest", tool: toolVersion(cwd, "vite-plus"), replaceAt, filters: check.argv.slice(replaceAt), browser: false, script: undefined };
    };

    const command = (check: Check) => {
        const env = check.argv.filter(word => /^[A-Za-z_]\w*=/u.test(word));
        const argv = check.argv.slice(env.length);
        const program = argv[0] ?? "";
        const cwd = check.cwd ?? ".";

        if (program === "node" || program === process.execPath) { return nodeCommand(check, argv, cwd); }

        if (program === "pnpm" && argv[1] === "--filter" && argv[3] === "test") { return vitestCommand(check, argv, env.length); }

        if (program === "pnpm" && argv[1] === "exec" && argv[2] === "playwright" && argv[3] === "test" && argv[4] === "-c" && argv.length === 6) {
          return { cwd, runner: "playwright", tool: toolVersion(cwd, "@playwright/test"), config: path.posix.join(cwd, argv[5] ?? ""), replaceAt: check.argv.length, filters: [], browser: true, script: undefined };
        }

        throw new Error("Unknown command");
    };

    const discover = ({ cwd, config, filters, browser }: ReturnType<typeof command>) => {
        let discovered: string[];
        let setup: string[] = [];
        let physical: string[];

        if (config === undefined) {
          discovered = names.filter(file => CODE.test(file) && filters.some(filter => path.matchesGlob(file, filter)));
          physical = globSync(filters, { cwd: root }).filter(file => CODE.test(file));
        } else {
          const settings = configuration(config);
          const test = browser ? settings : settings.test;

          if (!object(test)) { throw new Error("Unknown runner configuration"); }

          const allowed = new Set(browser ? ["testDir", "testMatch", "outputDir", "workers", "timeout", "globalTimeout", "reporter", "use"] : ["maxWorkers", "pool", "reporters", "testTimeout", "hookTimeout", "expect", "setupFiles", "globalSetup", "environment", "include", "exclude", "isolate"]);

          if (Object.keys(settings).some(key => !browser && key !== "test") || Object.keys(test).some(key => !allowed.has(key)) || test.isolate === false || (test.environment !== undefined && test.environment !== "node")) { throw new Error("Unmodelled runner configuration or shared test state"); }

          const base = browser ? path.posix.join(path.posix.dirname(config), strings(test.testDir, ["."])[0] ?? ".") : cwd;
          const include = strings(browser ? test.testMatch : test.include);
          const exclude = strings(test.exclude);

          if (include.some(pattern => !/\.(?:test|spec)\.(?:[cm]?[jt]sx?|\{ts,tsx\})$/u.test(pattern))) { throw new Error("Unmodelled discovery pattern"); }

          discovered = names.filter(file => file.startsWith(base === "." ? "" : `${base}/`) && TEST.test(file) && !file.includes("/node_modules/") && (include.length === 0 || include.some(pattern => path.matchesGlob(path.posix.relative(base, file), pattern))) && !exclude.some(pattern => path.matchesGlob(path.posix.relative(base, file), pattern)));
          physical = globSync(include.length === 0 ? "**/*.{test,spec}.{ts,tsx,js,jsx,mts,mtsx,mjs,mjsx,cts,ctsx,cjs,cjsx}" : include, { cwd: path.join(root, base), exclude: ["**/node_modules/**", "**/.git/**", ...exclude] }).map(file => path.posix.join(base, file));

          setup = [...strings(test.setupFiles), ...strings(test.globalSetup)].map(file => path.posix.join(cwd, file));

          setup.push(...strings(test.reporters).flatMap(reporter => {
            if (BUILTIN_REPORTERS.has(reporter)) { return []; }

            if (!reporter.startsWith(".")) { throw new Error("Unmodelled reporter plugin"); }

            return [path.posix.join(cwd, reporter)];
          }));

          if (browser) {
            // Browser fixtures can boot any application route or server handler, irrespective of test imports.
            setup.push(...names.filter(file => /^(?:apps\/(?:web|server)\/|packages\/contracts\/)/u.test(file) && CODE.test(file) && !TEST.test(file)));
          }

          if (filters.some(filter => filter.startsWith("-"))) { throw new Error("Unknown test filter"); }

          // oxlint-disable-next-line react-doctor/js-set-map-lookups -- Runner filters deliberately match substrings, not membership in a set.
          discovered = discovered.filter(file => filters.length === 0 || filters.some(filter => path.posix.relative(cwd, file).includes(filter)));
          // oxlint-disable-next-line react-doctor/js-set-map-lookups -- Apply the same substring filters to the physical discovery set.
          physical = physical.filter(file => filters.length === 0 || filters.some(filter => path.posix.relative(cwd, file).includes(filter)));
        }

        if (JSON.stringify([...new Set(physical)].toSorted()) !== JSON.stringify(discovered.toSorted())) { throw new Error("Untracked, ignored or missing discovered tests"); }

        return { discovered: discovered.toSorted(), setup };
    };

    const prove = (check: Check): DependencyProof | string => {
      try {
        if ((process.env.NODE_OPTIONS ?? "") !== "" || (process.env.NODE_PATH ?? "") !== "" || check.argv.some(word => /^(?:NODE_OPTIONS|NODE_PATH|LD_PRELOAD|DYLD_INSERT_LIBRARIES)=/u.test(word))) { throw new Error("Ambient Node loaders or module paths"); }

        const launch = command(check);
        const { cwd, config, runner, tool, replaceAt, script } = launch;

        for (const directory of new Set([".", cwd])) {
          if (globSync(".env*", { cwd: path.join(root, directory) }).some(file => !objects.has(path.posix.join(directory, file)))) { throw new Error("Untracked environment input"); }
        }

        if (config !== undefined) { closure([], config, cwd); }

        if (script !== undefined) {
          const evidence: Evidence = { version: VERSION, discovery: [], ...closure([script], undefined, cwd) };

          return { key: hash([VERSION, check, process.version, process.platform, process.arch, version, evidence]), evidence, tests: [], command: () => check };
        }

        const { discovered, setup } = discover(launch);

        if (discovered.length === 0) { throw new Error("Empty or unknown test discovery"); }

        const tests = discovered.map(file => {
          const evidence: Evidence = { version: VERSION, discovery: discovered, ...closure([file, ...setup], config, cwd) };
          const key = hash([VERSION, check, runner, tool, process.version, process.platform, process.arch, version, file, evidence]);

          return { file, key, evidence };
        });

        const evidence: Evidence = { version: VERSION, discovery: discovered, inputs: [...new Set(tests.flatMap(test => test.evidence.inputs))].toSorted(), edges: tests.flatMap(test => test.evidence.edges), environment: tests.flatMap(test => test.evidence.environment) };

        const selectedFile = (file: string) => {
          const relativeFile = path.posix.relative(cwd, file);

          return runner === "playwright" ? `${relativeFile.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$` : relativeFile;
        };

        return { key: hash([VERSION, check, tests.map(test => test.key)]), evidence, tests, command: files => ({ ...check, argv: [...check.argv.slice(0, replaceAt), ...files.map(selectedFile)] }) };
      } catch (error) { return error instanceof Error ? error.message : String(error); }
    };

    return { prove, close: () => { snapshot?.dispose(); api.close(); } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return { prove: () => reason, close: () => {
      // No compiler was opened when initialization failed.
    } };
  }
};
