import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { git } from "./git.ts";
import { loadConfig, selectChecks } from "./config.ts";
import type { Check, DomainMap, Project } from "./config.ts";
import { advice, untyped } from "./commit-type.ts";
import { processIdentity, readProgress, signoffDir, writeProgress, statusMain } from "./signoff-status.ts";
import { SIGNOFF_KEY, taskParts } from "./landing-tasks.ts";
import { dependencyGraph } from "./dependencies.ts";
import type { DependencyProof, Evidence, FileProof } from "./dependencies.ts";

import type { Progress, ProgressCheck } from "./signoff-status.ts";

export { parseDomainMap } from "./config.ts";

interface Entry { name: string; state: "passed" | "reused" | "failed" | "stopped" | "skipped"; seconds: number; from?: string; rerun?: boolean; flaky?: boolean | undefined; reason?: string; tests?: { file: string; key: string; state: "passed" | "reused"; from: string }[] }

type Selection = "domain" | "full";

const SELECTION_LABEL = { domain: "domain-selected", full: "full" } as const;

interface Signoff { commit: string; checklist: string; passed: boolean; startedAt: number; checks: Entry[]; selection: Selection }

const KEPT = 20;
const KEPT_PASSES = 200;
const STOP_GRACE_MS = 5000;

// Any change to these can alter every check's result, so they are folded into every fingerprint.
const SHARED_INPUTS = /^(?:scripts\/|packages\/signoff\/|\.signoff\.json$)|(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|vite[^/]*\.config\.[cm]?[jt]s|vitest[^/]*\.[cm]?[jt]s|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc)$/u;
const LABELS = { passed: "pass", failed: "FAIL", stopped: "stop" };

// The engine's rule for leading `NAME=value` argv words (landing/live.ts): they are environment, not the program.
const ENV_PREFIX = /^[A-Za-z_]\w*=[\w@%+=:,./-]*$/u;

const RELATED_LIMIT = 40;
const TEST_FILE = /\.test\.tsx?$/u;
const IMPORT = /(?:from\s+|import\(\s*)["'](?<specifier>\.{1,2}\/[^"']+)["']/gu;
const withoutExtension = (file: string) => file.replace(/\.[cm]?[jt]sx?$/u, "");

/** Unit test files in each package that changed or import a changed file directly; a full import graph reaches most of the engine, so it would not be quick. */
export const relatedTests = (root: string, changed: readonly string[]) => {
  const tests = git(root, "ls-files", "-z", "--", "apps/*/src/*", "packages/*/src/*").split("\0").filter(file => TEST_FILE.test(file));
  const targets = new Set(changed.flatMap(file => /\.[cm]?[jt]sx?$/u.test(file) ? [withoutExtension(file)] : []));
  const byPackage = new Map<string, string[]>();

  for (const test of tests) {
    const direct = targets.has(withoutExtension(test)) || [...readFileSync(path.join(root, test), "utf-8").matchAll(IMPORT)].some(match => targets.has(withoutExtension(path.posix.join(path.posix.dirname(test), match.groups?.specifier ?? ""))));

    if (!direct) { continue; }

    const pkg = test.split("/").slice(0, 2).join("/");
    byPackage.set(pkg, [...byPackage.get(pkg) ?? [], path.posix.relative(pkg, test)]);
  }

  return byPackage;
};

/** The checklist and area map both come from main, so a candidate cannot loosen its own checks; a map change on main invalidates earlier sign-offs. */
const checklist = (root: string, project: Project) => {
  const text = git(root, "show", `main:${project.configFile ?? ".signoff.json"}`);
  const map = project.areaMapFile === undefined || git(root, "ls-tree", "--name-only", "main", "--", project.areaMapFile) === "" ? undefined : git(root, "show", `main:${project.areaMapFile}`);
  const config = loadConfig(text, map);

  return { checks: (changed: readonly string[]) => selectChecks(config.checks, changed), related: project.relatedTests ?? config.relatedTests ?? false, vite: config.vite === true, typedCommits: config.typedCommits === true, map: config.areaMap, hash: createHash("sha256").update(text).update(map ?? "").digest("hex") };
};

const areaFilter = (area: string) => (word: string) => word.startsWith("src/core/") && (`src/core/${area}`.startsWith(word) || word.startsWith(`src/core/${area}/`));

/** Checks the domain map keeps for this diff: the checks each file's first matching domain names, checks whose paths name the file more narrowly than a broad prefix, and for an engine core area the shards whose test filters reach it. A file no domain matches keeps everything. */
export const selectDomainChecks = (map: DomainMap, checks: readonly Check[], changed: readonly string[]) => {
  const selected = new Set<string>();
  const broad = new Set(map.broad);

  for (const file of changed) {
    const domain = map.domains.find(candidate => new RegExp(candidate.match, "u").test(file));

    if (domain === undefined || domain.checks === "all") { return new Set(checks.map(check => check.name)); }

    const area = new RegExp(domain.match, "u").exec(file)?.groups?.area;
    const names = new Set(domain.checks);

    for (const check of checks) {
      const named = names.has(check.name);
      const narrow = check.paths?.some(prefix => !broad.has(prefix) && file.startsWith(prefix)) === true;
      const shard = area !== undefined && check.argv.some(areaFilter(area));

      if (named || narrow || shard) { selected.add(check.name); }
    }
  }

  return selected;
};

const passedRecord = (directory: string, commit: string) => {
  try {
    const record: unknown = JSON.parse(readFileSync(path.join(directory, `${commit}.json`), "utf-8"));

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The record is a file on disk; check its shape before trusting it.
    return typeof record === "object" && record !== null && "passed" in record && record.passed === true;
  } catch {
    return false;
  }
};

/** A commit already on main has an empty diff against main, so it is compared with the nearest earlier signed-off commit instead. */
const changedFiles = (root: string, directory: string) => {
  const head = git(root, "rev-parse", "HEAD");
  let base = git(root, "merge-base", "main", "HEAD");

  if (base === head) {
    const signed = git(root, "rev-list", "--skip=1", "HEAD").split("\n").find(commit => commit !== "" && passedRecord(directory, commit));
    assert.ok(signed !== undefined, "HEAD is already on main and no earlier commit on main has a sign-off to compare against. Sign off the work branch before it reaches main.");
    base = signed;
  }

  return git(root, "diff", "--name-only", "--no-renames", "-z", base, "HEAD", "--").split("\0").filter(Boolean);
};

const prune = (directory: string) => {
  const commits = readdirSync(directory).flatMap(name => /^[a-f\d]{40}\.json$/u.test(name) ? [{ name: name.slice(0, -5), time: statSync(path.join(directory, name)).mtimeMs }] : []).toSorted((a, b) => b.time - a.time);

  for (const { name } of commits.slice(KEPT)) {
    for (const extension of ["json", "log"]) { unlinkSync(path.join(directory, `${name}.${extension}`)); }
  }
};

// A pass is one file named by its fingerprint and holding the commit that earned it, so concurrent sign-offs never rewrite a shared index.
const passFile = (directory: string, fingerprint: string) => path.join(directory, "passed", fingerprint);

const prunePasses = (directory: string) => {
  const passes = readdirSync(path.join(directory, "passed")).flatMap(name => {
    const stat = statSync(path.join(directory, "passed", name), { throwIfNoEntry: false });

    return stat === undefined ? [] : [{ name, time: stat.mtimeMs }];
  }).toSorted((a, b) => b.time - a.time);

  for (const { name } of passes.slice(KEPT_PASSES)) {
    rmSync(path.join(directory, "passed", name), { force: true });
    rmSync(path.join(directory, "proof-v1", `${name}.json`), { force: true });
  }
};

const pathOf = (line: string) => line.slice(line.indexOf("\t") + 1);

/** What a check's result depends on: its definition, the tracked files under its paths (the whole tree without paths), and the inputs every check shares. */
const fingerprinter = (root: string) => {
  const listing = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"], { cwd: root, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 }).split("\0").filter(Boolean);
  const runtime = [process.version, process.platform, process.arch];
  const shared = listing.filter(line => SHARED_INPUTS.test(pathOf(line)));
  const tree = git(root, "rev-parse", "HEAD^{tree}");

  const scope = (paths: readonly string[] | undefined) => paths === undefined ? listing : listing.filter(line => paths.some(prefix => pathOf(line).startsWith(prefix)));

  return (check: Check, legacy = false) => {
    const scoped = scope(check.paths);
    const content = [...new Set([...shared, ...scoped])].map(line => line.split("\t")[0] ?? assert.fail("missing Git object")).toSorted((a, b) => a.localeCompare(b));

    // Paths bind content to discovery and resolution; a content multiset alone cannot authorize reuse.
    const identity = legacy ? [check, [...runtime, shared], check.paths === undefined ? tree : scoped] : ["content-v1", check, runtime, content, shared, scoped];

    return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  };
};

const historicalFlaky = (directory: string, commit: string, name: string) => {
  try {
    const record: unknown = JSON.parse(readFileSync(path.join(directory, `${commit}.json`), "utf-8"));

    // oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- Older pass files store only a SHA; validate its disk record before recovering a warning.
    return typeof record === "object" && record !== null && "checks" in record && Array.isArray(record.checks) && record.checks.some((entry: unknown) => typeof entry === "object" && entry !== null && "name" in entry && entry.name === name && "state" in entry && entry.state === "passed" && "rerun" in entry && entry.rerun === true);
  } catch {
    return false;
  }
};

const passedBy = (directory: string, fingerprint: string, name: string) => {
  const file = passFile(directory, fingerprint);

  if (!existsSync(file)) { return null; }

  const source = readFileSync(file, "utf-8").trim();

  if (/^[a-f\d]{40}$/u.test(source)) { return { commit: source, flaky: historicalFlaky(directory, source, name) }; }

  try {
    const value: unknown = JSON.parse(source);

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate optional pass metadata read from disk.
    if (typeof value === "object" && value !== null && "commit" in value && typeof value.commit === "string" && /^[a-f\d]{40}$/u.test(value.commit) && "flaky" in value && value.flaky === true) {
      return { commit: value.commit, flaky: true };
    }
  } catch {
    // An unreadable pass cannot authorize reuse.
  }

  return null;
};

const savePass = (directory: string, key: string, commit: string, flaky: boolean | undefined, evidence?: Evidence) => {
  if (evidence !== undefined) { writeFileSync(path.join(directory, "proof-v1", `${key}.json`), JSON.stringify(evidence)); }

  writeFileSync(passFile(directory, key), flaky === true ? JSON.stringify({ commit, flaky: true }) : commit);
};

const cachedPass = (directory: string, check: Check, keys: string[], fresh: boolean | undefined) => {
  if (fresh === true) { return null; }

  for (const key of keys) {
    const pass = passedBy(directory, key, check.name);

    if (pass !== null) { return pass; }
  }

  return null;
};

interface PlannedCheck {
  check: Check;
  key: string;
  from: string | undefined;
  flaky: boolean | undefined;
  combined: boolean;
  proof?: DependencyProof;
  fallback?: string;
  files: (FileProof & { from: string | undefined; flaky: boolean | undefined })[];
}

const proofReason = (root: string, from: string) => {
  try {
    const changed = git(root, "diff", "--name-only", "--no-renames", from, "HEAD", "--").split("\n").filter(Boolean);

    return `not affected: no import path from ${changed.length === 0 ? "any changed files (identical inputs)" : changed.join(", ")}`;
  } catch { return "not affected: identical discovery, resolved imports, configuration and environment"; }
};

// Playwright owns its browsers and ports, so it can overlap the unit suites.
const isBrowser = (check: Check) => check.argv.includes("playwright");

const prepare = (root: string, check: Check) => {
  const program = check.argv.findIndex(word => !ENV_PREFIX.test(word));
  const cwd = path.resolve(root, check.cwd ?? ".");
  assert.ok(program !== -1, `Check "${check.name}" has no command`);
  assert.ok(path.relative(root, cwd).split(path.sep)[0] !== "..", `Check "${check.name}" runs outside the repository`);

  const env = Object.fromEntries(check.argv.slice(0, program).map(word => [word.slice(0, word.indexOf("=")), word.slice(word.indexOf("=") + 1)]));
  const [command = "", ...args] = check.argv.slice(program);

  return { command, args, env, cwd };
};

type Launch = ReturnType<typeof prepare>;

/** Runs one check in its own process group, so stopping it also stops everything it started. */
const execute = async (check: Pick<Check, "timeoutMs">, launch: Launch, output: string, stop: AbortSignal) => {
  const file = openSync(output, "w");
  const child = spawn(launch.command, launch.args, { cwd: launch.cwd, env: { ...process.env, ...launch.env }, stdio: ["ignore", file, file], detached: true });
  closeSync(file);
  const closed = Promise.withResolvers<number | null>();
  let ending: AbortSignal | undefined;
  let timedOut = false;

  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      if (child.pid !== undefined) { process.kill(-child.pid, signal); }
    } catch {
      // The group already exited.
    }
  };

  const kill = () => { signalGroup("SIGKILL"); };

  const end = () => {
    if (ending !== undefined) { return; }

    signalGroup("SIGTERM");
    ending = AbortSignal.timeout(STOP_GRACE_MS);
    ending.addEventListener("abort", kill, { once: true });
  };

  const deadline = check.timeoutMs === undefined ? undefined : AbortSignal.timeout(check.timeoutMs);
  const timeout = () => { timedOut = true; end(); };

  deadline?.addEventListener("abort", timeout, { once: true });
  stop.addEventListener("abort", end, { once: true });

  if (stop.aborted) { end(); }

  child.on("error", error => { appendFileSync(output, `${String(error)}\n`); });
  child.on("close", code => { closed.resolve(code); });
  const code = await closed.promise;
  deadline?.removeEventListener("abort", timeout);
  ending?.removeEventListener("abort", kill);
  stop.removeEventListener("abort", end);

  // Descendants can outlive the leader that was asked to stop.
  if (ending !== undefined) { signalGroup("SIGKILL"); }

  if (timedOut) { appendFileSync(output, `Timed out after ${check.timeoutMs}ms\n`); }

  if (code === 0) { return "passed"; }

  return stop.aborted && !timedOut ? "stopped" : "failed";
};

/** Runs the checks that still need running: the browser suite beside everything else, which runs one after another. A failure stops both lanes. */
const runLanes = async (pending: Check[], launches: Map<Check, Launch>, { directory, commit, say, keep, transition, serial = new Set(pending), units = 1, browser = isBrowser, signal }: { directory: string; commit: string; say: (line: string) => void; keep: (check: Check, entry: Entry) => void; transition: (check: Check, update: Partial<ProgressCheck>) => void; serial?: ReadonlySet<Check>; units?: number; browser?: (check: Check) => boolean; signal?: AbortSignal | undefined }) => {
  const logFile = path.join(directory, `${commit}.log`);
  const results = new Map<Check, Entry>();
  const stop = new AbortController();
  const interrupt = () => { stop.abort(); };

  signal?.addEventListener("abort", interrupt, { once: true });

  if (signal?.aborted === true) { interrupt(); }

  writeFileSync(logFile, "");

  // Each check writes its own file; whole sections reach the log when it ends, so lanes never interleave.
  const lane = async (queue: Iterable<[number, Check]>, name: string) => {
    for (const [index, check] of queue) {
      if (stop.signal.aborted) { return; }

      const output = path.join(directory, `${commit}.${name}${index}.part`);
      const began = Date.now();
      const launch = launches.get(check) ?? assert.fail("unprepared check");

      const attempt = async (heading: string) => {
        transition(check, { state: "running", startedAt: began, output, reason: heading === check.name ? "Check executing" : "Failed once; one rerun executing" });

        if (heading === check.name) { say(`run   ${check.name}`); }

        const state = await execute(check, launch, output, stop.signal);
        appendFileSync(logFile, `\n== ${heading}: ${check.argv.join(" ")}\n${readFileSync(output, "utf-8")}`);
        rmSync(output);

        return state;
      };

      // oxlint-disable-next-line no-await-in-loop -- A lane runs its checks one after another.
      let state: Awaited<ReturnType<typeof execute>> = await attempt(check.name);
      // One rerun of just this check tells an unreliable test from a real failure without repeating the whole sign-off.
      const rerun = state === "failed" && !stop.signal.aborted;

      if (rerun) {
        say(`again ${check.name} (failed once; one rerun)`);
        // oxlint-disable-next-line no-await-in-loop -- The rerun follows the failure it checks.
        state = await attempt(`${check.name} (rerun)`);
      }

      const seconds = Math.round((Date.now() - began) / 1000);
      const entry: Entry = { name: check.name, state, seconds };

      if (rerun) { entry.rerun = true; }

      if (rerun && state === "passed") { entry.flaky = true; }

      results.set(check, entry);
      transition(check, { ...entry, reason: state === "stopped" ? "Run cancelled or another check failed" : "" });
      say(`${LABELS[state]}  ${check.name} (${seconds}s${entry.flaky === true ? ", flaky: passed on rerun" : ""})`);

      if (state === "passed") { keep(check, entry); }

      // Later checks would only spend time on a commit that cannot land.
      if (state !== "passed") {
        stop.abort();

        return;
      }
    }
  };

  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);

  // Serial checks have the main lane to themselves; the unit checks after them share a bounded pool.
  const main = async () => {
    await lane(pending.filter(check => !browser(check) && serial.has(check)).entries(), "main");
    const queue = pending.filter(check => !browser(check) && !serial.has(check)).entries();
    await Promise.all(Array.from({ length: units }, async (_, index) => { await lane(queue, `unit${index}`); }));
  };

  try { await Promise.all([main(), lane(pending.filter(browser).entries(), "browser")]); } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    signal?.removeEventListener("abort", interrupt);
  }

  return results;
};

/** The Vite task cache is agent-writable inside a checkout, so it is used only when sign-off's own storage lies outside it, as in the owner's linked worktrees. */
export const ownerTaskCache = (root: string, directory: string) => path.relative(realpathSync(root), realpathSync(path.dirname(directory))).split(path.sep)[0] === "..";

type RunOptions = Parameters<typeof runLanes>[2];

const same = (a: Check, b: Check) => a.name === b.name && JSON.stringify(a.argv) === JSON.stringify(b.argv) && a.cwd === b.cwd;

const cacheLabel = (root: string, directory: string, project: Project, vite: boolean, fresh: boolean | undefined) => {
  const tasks = project.tasks !== undefined || (vite && existsSync(path.join(root, "node_modules/.bin/vp")));

  return tasks && fresh !== true && ownerTaskCache(root, directory) ? "owner sign-off storage" : "off";
};

/** Checks whose definition matches the checkout's checklist run as its Vite tasks, a split check as its serial and ordinary parts; anything else runs its own command in the serial lane. */
const runChecks = async (root: string, pending: Check[], options: RunOptions & { keys: ReadonlyMap<Check, string>; fresh: boolean; selected: ReadonlyMap<Check, Check> }, project: Project) => {
  const config = loadConfig(readFileSync(path.join(root, project.configFile ?? ".signoff.json"), "utf-8"));
  const vp = path.join(root, "node_modules/.bin/vp");
  const runner: Project["tasks"] = project.tasks ?? (config.vite === true && existsSync(vp) ? { command: vp, serial: [] } : undefined);
  const manifest = runner === undefined ? [] : config.checks;
  const serialTests = runner?.serial ?? [];
  const cache = !options.fresh && ownerTaskCache(root, options.directory);
  const parent = new Map<Check, Check>();
  const serial = new Set<Check>();

  const tasks = pending.flatMap(check => {
    const selected = options.selected.get(check);

    if (selected !== undefined) {
      return taskParts(selected, serialTests, runner?.serverPackage, runner?.verifyDeps).map(part => {
        const task: Check = { ...selected, name: part.serial ? `${check.name} (serial part)` : check.name, argv: part.argv };
        parent.set(task, check);

        if (part.serial || runner === undefined) { serial.add(task); }

        return task;
      });
    }

    if (!manifest.some(candidate => same(candidate, check))) {
      serial.add(check);

      return [check];
    }

    return taskParts(check, serialTests, runner?.serverPackage, runner?.verifyDeps).map(part => {
      const name = part.task.endsWith(":serial") ? `${check.name} (serial part)` : check.name;
      const argv = [runner?.command ?? assert.fail("missing task runner"), "run", cache ? "--cache" : "--no-cache", "--log", "grouped", part.task];
      const task: Check = check.timeoutMs === undefined ? { name, argv } : { name, argv, timeoutMs: check.timeoutMs };

      parent.set(task, check);

      if (part.serial) { serial.add(task); }

      return task;
    });
  });

  const launches = new Map(tasks.map(task => {
    const launch = prepare(root, task);
    const check = parent.get(task);

    if (check !== undefined) {
      Object.assign(launch.env, { VITE_CACHE_PATH: path.join(options.directory, "vite-task-cache"), VP_REMOTE_CACHE: "off", [SIGNOFF_KEY]: options.keys.get(check) ?? assert.fail("unplanned check") });
    }

    return [task, launch] as const;
  }));

  const checkOf = (task: Check) => parent.get(task) ?? task;
  const partsOf = (check: Check) => tasks.filter(task => checkOf(task) === check);
  const results = new Map<Check, Entry>();

  const combined = (check: Check, done: ReadonlyMap<Check, Entry>): Entry | undefined => {
    const entries = partsOf(check).flatMap(task => done.get(task) ?? []);

    if (entries.length === 0) { return undefined; }

    const seconds = entries.reduce((sum, entry) => sum + entry.seconds, 0);
    let state: Entry["state"] = "stopped";

    if (entries.some(entry => entry.state === "failed")) { state = "failed"; } else if (entries.length === partsOf(check).length && entries.every(entry => entry.state === "passed")) { state = "passed"; }

    const entry: Entry = { name: check.name, state, seconds };

    if (entries.some(part => part.rerun === true)) { entry.rerun = true; }

    if (entries.some(part => part.flaky === true)) { entry.flaky = true; }

    return entry;
  };

  const done = await runLanes(tasks, launches, {
    ...options,
    serial,
    units: 2,
    browser: task => isBrowser(checkOf(task)),
    // A split check earns its pass and its final state only once every part has ended.
    keep: task => {
      const entry = combined(checkOf(task), results);

      if (entry?.state === "passed") { options.keep(checkOf(task), entry); }
    },
    transition: (task, update) => {
      const check = checkOf(task);

      if (update.state !== "passed" && update.state !== "failed" && update.state !== "stopped") {
        options.transition(check, update);

        return;
      }

      const part: Entry = { name: task.name, state: update.state, seconds: update.seconds ?? 0 };

      if (update.flaky === true) { part.flaky = true; }

      results.set(task, part);
      const entry = combined(check, results);

      if (entry !== undefined && (entry.state !== "stopped" || partsOf(check).every(taskPart => results.has(taskPart)))) { options.transition(check, { ...entry, reason: update.reason ?? "" }); }
    },
  });

  return new Map(pending.flatMap(check => {
    const entry = combined(check, done);

    return entry === undefined ? [] : [[check, entry] as const];
  }));
};

/** Related tests run first in the main lane, so a failure next to the change stops the sign-off within minutes. */
const quickChecks = (root: string, changed: readonly string[], anyPending: boolean) => {
  const related = [...relatedTests(root, changed)];
  const relatedCount = related.reduce((sum, [, files]) => sum + files.length, 0);
  const runs = anyPending && relatedCount > 0 && relatedCount <= RELATED_LIMIT;
  const quick: Check[] = runs ? related.map(([pkg, files]) => ({ name: `related tests in ${pkg}`, argv: ["PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error", "pnpm", "test", ...files, "--maxWorkers=1"], cwd: pkg })) : [];

  return { quick, relatedCount };
};

const SKIP_REASON = "Skipped by area map";

/** Without a map every check runs. */
const splitByMap = (listed: readonly Check[], map: DomainMap | undefined, changed: readonly string[]) => {
  const selected = map === undefined ? new Set(listed.map(check => check.name)) : selectDomainChecks(map, listed, changed);

  return { kept: listed.filter(check => selected.has(check.name)), skipped: listed.filter(check => !selected.has(check.name)) };
};

const observeProgress = (root: string, commit: string, quick: Check[], plan: readonly { check: Check; from: string | undefined; flaky: boolean | undefined; combined: boolean }[], skipped: readonly Check[], candidate: string | undefined, startedAt: number) => {
  const declared = candidate === undefined ? undefined : readProgress(root).records.find(p => p.id === candidate);
  assert.ok(candidate === undefined || (declared?.commit === commit && (declared.state === "queued" || declared.state === "held")), "Candidate must be a readable pending declaration for this exact commit");
  const progressChecks = new Map<Check, ProgressCheck>();

  for (const check of quick) { progressChecks.set(check, { name: check.name, state: "pending", reason: "Waiting for its lane" }); }

  for (const { check, from, flaky, combined } of plan) {
    const entry: ProgressCheck = { name: check.name, state: "pending", reason: "Waiting for its lane" };

    if (from !== undefined) { entry.state = "reused"; entry.from = from; entry.reason = "Matching inputs already passed"; entry.flaky = flaky; }

    if (combined) { entry.state = "reused"; entry.reason = "Every discovered test has matching dependency evidence"; entry.flaky = flaky; }

    progressChecks.set(check, entry);
  }

  for (const check of skipped) { progressChecks.set(check, { name: check.name, state: "skipped", reason: SKIP_REASON }); }

  const progress: Progress = { version: 1, id: declared?.id ?? randomUUID(), commit, name: declared?.name ?? git(root, "show", "-s", "--format=%s", commit), state: "running", reason: "Runner admitted; checks executing", startedAt, updatedAt: startedAt, runner: { pid: process.pid, identity: processIdentity(process.pid) }, checks: [...progressChecks.values()], selection: skipped.length === 0 ? "full" : "domain" };

  const save = () => { writeProgress(root, progress); };

  save();

  return {
    transition: (check: Check, update: Partial<ProgressCheck>) => { Object.assign(progressChecks.get(check) ?? assert.fail("missing progress check"), update); save(); },
    finish: (state: Progress["state"], reason: string) => {
      progress.state = state;
      progress.reason = reason;

      for (const check of progress.checks) {
        if (check.state === "pending" || check.state === "running") { check.state = "stopped"; check.reason = "Not completed: run ended"; }
      }

      save();
    },
  };
};

const runOutcome = (passed: boolean, results: ReadonlyMap<Check, Entry>): [Progress["state"], string] => {
  if (passed) { return ["passed", "All required checks passed or were reused"]; }

  return [[...results.values()].some(entry => entry.state === "failed") ? "failed" : "stopped", "Run ended without sign-off"];
};

const describePlan = ({ root, commit, changed, plan, skipped, relatedCount, say }: { root: string; commit: string; changed: readonly string[]; plan: readonly PlannedCheck[]; skipped: readonly Check[]; relatedCount: number; say: (line: string) => void }) => {
  say(`${commit.slice(0, 8)}: ${changed.length} changed files, ${plan.length} checks selected, ${skipped.length} skipped by area map${skipped.length === 0 ? "" : ` (${skipped.map(check => check.name).join(", ")})`}`);
  say(`related tests first: ${relatedCount} files${relatedCount > RELATED_LIMIT ? ` (over ${RELATED_LIMIT}, skipped)` : ""}`);

  for (const { check, from, flaky, proof, fallback, files, combined } of plan) {
    let decision = from === undefined ? `run${isBrowser(check) ? ", second lane" : ""}` : `reuse: same content as ${from}${flaky === true ? "; flaky: passed on rerun" : ""}`;

    if (combined) { decision = "reuse: matching proof for every discovered file (file sources below)"; }

    let reason = "";

    if (proof !== undefined && from !== undefined) { reason = `; ${proofReason(root, from)}`; }

    const explanation = fallback === undefined ? "" : `; dependency proof unavailable: ${fallback}`;

    say(`  ${check.name}: ${check.argv.join(" ")}${check.cwd === undefined ? "" : ` (in ${check.cwd})`}${explanation} [${decision}${reason}]`);

    for (const file of files) {
      say(`    ${file.file}: [${file.from === undefined ? "run" : `reuse: same content as ${file.from}; ${proofReason(root, file.from)}`}]; proof ${file.key}`);
    }
  }
};

export interface SignoffOptions { dryRun?: boolean; fresh?: boolean; all?: boolean; say?: (line: string) => void; candidate?: string | undefined; signal?: AbortSignal }

const describeResult = (record: Signoff, directory: string, say: (line: string) => void) => {
  const flakyChecks = record.checks.filter(entry => entry.flaky === true);

  if (flakyChecks.length > 0) { say(`Flaky checks (passed on rerun): ${flakyChecks.map(entry => entry.name).join(", ")}`); }

  say(`${record.passed ? `Signed off (${SELECTION_LABEL[record.selection]})` : "Not signed off"}: ${record.commit} (log: ${path.join(directory, `${record.commit}.log`)})`);
};

const requireTypedTitles = (root: string, required: boolean) => {
  const bad = required ? untyped(root) : [];
  assert.equal(bad.length, 0, `Not signed off: ${advice(bad)}`);
};

export const signoff = async (root: string, { dryRun = false, fresh, all = false, say = console.log, candidate, signal }: SignoffOptions = {}, project: Project = {}) => {
  assert.ok(dryRun || git(root, "status", "--porcelain") === "", "The working tree has uncommitted changes. Commit first: a sign-off describes a commit.");
  const commit = git(root, "rev-parse", "HEAD");
  const { checks: select, map, hash, related, vite, typedCommits } = checklist(root, project);
  requireTypedTitles(root, typedCommits);
  const directory = signoffDir(root);
  const changed = changedFiles(root, directory);
  const fingerprint = fingerprinter(root);
  const { kept, skipped } = splitByMap(select(changed), all ? undefined : map, changed);
  const selection: Selection = skipped.length === 0 ? "full" : "domain";

  const graph = await dependencyGraph(root);
  let plan: PlannedCheck[];

  try {
    plan = kept.map(check => {
      const result = graph.prove(check);
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A resolver failure is an explanatory string, never reusable evidence.
      const fallback = typeof result === "string" ? result.replaceAll(/\s+/gu, " ").slice(0, 1024) : undefined;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Only a complete resolver proof can authorize a stronger cache identity.
      const proof = typeof result === "string" ? undefined : result;
      const key = proof?.key ?? fingerprint(check);
      const source = cachedPass(directory, check, proof === undefined ? [key, fingerprint(check, true)] : [key], fresh);

      const files = proof?.tests.map(file => {
        const pass = fresh === true ? undefined : passedBy(directory, file.key, check.name);

        return { ...file, from: pass?.commit, flaky: pass?.flaky };
      }) ?? [];

      const complete = files.length > 0 && files.every(file => file.from !== undefined);
      const from = source?.commit;
      const flaky = source?.flaky === true || files.some(file => file.flaky === true);

      return { check, key, from, flaky, files, combined: source === null && complete, ...proof === undefined ? { fallback: fallback ?? "Unavailable graph" } : { proof } };
    });
  } finally { graph.close(); }

  const { quick, relatedCount } = related ? quickChecks(root, changed, plan.some(({ from, combined }) => from === undefined && !combined)) : { quick: [], relatedCount: 0 };

  if (dryRun) {
    describePlan({ root, commit, changed, plan, skipped, relatedCount, say });
    say(`vite task cache: ${cacheLabel(root, directory, project, vite, fresh)}`);

    return true;
  }

  const pending = [...quick, ...plan.flatMap(({ check, from, combined }) => from === undefined && !combined ? [check] : [])];
  mkdirSync(path.join(directory, "passed"), { recursive: true });
  mkdirSync(path.join(directory, "proof-v1"), { recursive: true });
  const startedAt = Date.now();
  const monitor = observeProgress(root, commit, quick, plan, skipped, candidate, startedAt);

  for (const { check, from, flaky } of plan.filter(item => item.from !== undefined || item.combined)) {
    const reason = from === undefined ? "matching proof for every discovered test" : `same content as ${from}${flaky === true ? "; flaky: passed on rerun" : ""}`;
    say(`reuse ${check.name} (${reason})`);
  }

  const keys = new Map(plan.map(({ check, key }) => [check, key] as const));
  const proofs = new Map(plan.map(({ key, proof }) => [key, proof?.evidence] as const));
  const selected = new Map(plan.flatMap(({ check, from, files, proof }) => from === undefined && proof !== undefined && files.some(file => file.from !== undefined) ? [[check, proof.command(files.filter(file => file.from === undefined).map(file => file.file))] as const] : []));
  const unchanged = () => git(root, "rev-parse", "HEAD") === commit && git(root, "status", "--porcelain", "--untracked-files=no") === "";

  // Each pass is kept as soon as it happens, so a run cut short by a restart resumes from where it stopped.
  const keep = (check: Check, entry: Entry) => {
    const key = keys.get(check);

    if (key !== undefined && unchanged()) {
      const item = plan.find(planned => planned.check === check);

      if (item?.files.some(file => file.flaky === true) === true) { entry.flaky = true; }

      if (item?.proof !== undefined) {
        for (const file of item.files) {
          if (file.from !== undefined) { continue; }

          savePass(directory, file.key, commit, entry.flaky, file.evidence);
        }
      }

      savePass(directory, key, commit, entry.flaky, proofs.get(key));
    }
  };

  try {
    const results = await runChecks(root, pending, { directory, commit, say, keep, transition: monitor.transition, keys, fresh: fresh === true, selected, signal }, project);

    // Checks write ignored and untracked files; the sign-off only has to describe unchanged tracked content.
    assert.ok(unchanged(), "The checkout changed while the checks ran, so nothing was signed off.");

    const outcomes = plan.flatMap(({ check, key, from, flaky, files, combined }) => {
      let entry = results.get(check);

      if (from !== undefined || combined) {
        entry = { name: check.name, state: "reused", seconds: 0, flaky };

        if (from !== undefined) { entry.from = from; }
      }

      if (entry !== undefined && (entry.state === "passed" || entry.state === "reused") && files.length > 0) {
        entry.tests = files.map(file => ({ file: file.file, key: file.key, state: file.from === undefined && from === undefined ? "passed" : "reused", from: file.from ?? entry.from ?? commit }));

        if (files.some(file => file.flaky === true)) { entry.flaky = true; }
      }

      return entry === undefined ? [] : [{ key, entry }];
    });

    // Individual passes stay useful even when a later check failed.
    for (const { key, entry } of outcomes) {
      if (entry.state === "passed" || entry.state === "reused") {
        savePass(directory, key, entry.from ?? commit, entry.flaky, proofs.get(key));
      }
    }

    const quickEntries = quick.flatMap(check => results.get(check) ?? []);
    const entries = outcomes.map(({ entry }) => entry);
    const passed = entries.length === plan.length && [...quickEntries, ...entries].every(entry => entry.state === "passed" || entry.state === "reused");
    const record: Signoff = { commit, checklist: hash, passed, startedAt, checks: [...quickEntries, ...entries, ...skipped.map((check): Entry => ({ name: check.name, state: "skipped", seconds: 0, reason: SKIP_REASON }))], selection };

    writeFileSync(path.join(directory, `${commit}.json`), JSON.stringify(record));
    prune(directory);
    prunePasses(directory);

    describeResult(record, directory, say);
    monitor.finish(...runOutcome(passed, results));

    return record.passed;
  } catch (error) {
    monitor.finish("failed", String(error));
    throw error;
  }
};

/** Throws unless the commit has a passing sign-off against the checklist main has now; returns whether the area map skipped any checks. Records from before the map decided anything ran every check. */
export const verify = (root: string, revision: string, project: Project = {}) => {
  const commit = git(root, "rev-parse", "--verify", `${revision}^{commit}`);
  const file = path.join(signoffDir(root), `${commit}.json`);
  assert.ok(existsSync(file), `No sign-off for ${commit}. Run: node scripts/signoff.ts`);
  const record: unknown = JSON.parse(readFileSync(file, "utf-8"));
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The record is a file on disk; check its shape before trusting it.
  assert.ok(typeof record === "object" && record !== null && "commit" in record && "checklist" in record && "passed" in record, `Unreadable sign-off for ${commit}`);
  assert.ok(record.commit === commit && record.passed === true, `The sign-off for ${commit} did not pass.`);
  assert.ok(record.checklist === checklist(root, project).hash, `The landing checklist or area map changed since ${commit} was signed off. Run: node scripts/signoff.ts`);

  return SELECTION_LABEL["selection" in record && record.selection === "domain" ? "domain" : "full"];
};

const usage = "Usage: signoff [--dry-run] [--fresh] [--all] [--post] [--candidate=<token>]\n       signoff --verify <sha>\n       signoff --watch[=seconds] [--details]\nRun main's configured checks against committed HEAD; --all ignores the area map; --fresh disables reuse; --post explicitly authorizes a GitHub commit status (never pushes).";

const runCommand = async (root: string, args: string[], project: Project) => {
  assert.ok(!args.includes("--post") || (!args.includes("--dry-run") && process.env.NODE_TEST_CONTEXT === undefined && process.env.VITEST === undefined), "GitHub posting is refused during tests and dry runs");
  const commit = git(root, "rev-parse", "HEAD");
  const passed = await signoff(root, { dryRun: args.includes("--dry-run"), fresh: args.includes("--fresh"), all: args.includes("--all"), candidate: args.find(arg => arg.startsWith("--candidate="))?.slice(12) }, project);

  if (passed && args.includes("--post")) {
    verify(root, commit, project);
    assert.ok(git(root, "rev-parse", "HEAD") === commit && git(root, "status", "--porcelain", "--untracked-files=no") === "", "Checkout changed before posting");
    execFileSync("gh", githubStatusArgs(commit), { cwd: root, stdio: "inherit" });
  }

  return passed;
};

export const signoffMain = async (root = process.cwd(), args = process.argv.slice(2), project: Project = {}) => {
  try {
    if (args[0] === "--watch" || args[0]?.startsWith("--watch=") === true) {
      await statusMain(root, args);
    } else if (args[0] === "--verify" && args.length === 2 && args[1] !== undefined) {
      console.log(`Signed off (${verify(root, args[1], project)}): ${args[1]}`);
    } else if (args[0] === "--help") {
      console.log(usage);
    } else if (args.every(arg => arg === "--dry-run" || arg === "--fresh" || arg === "--all" || arg === "--post" || /^--candidate=[a-f\d-]{36}$/u.test(arg))) {
      process.exitCode = await runCommand(root, args, project) ? 0 : 1;
    } else {
      console.log(usage);
      process.exitCode = 1;
    }
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

export const githubStatusArgs = (commit: string) => {
  assert.match(commit, /^[a-f\d]{40}$/u);

  return ["api", "--method", "POST", `repos/{owner}/{repo}/statuses/${commit}`, "-f", "state=success", "-f", "context=signoff", "-f", "description=Local sign-off checks passed"];
};

if (import.meta.main) { await signoffMain(); }
