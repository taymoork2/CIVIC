/// <reference types="node" />
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Check as LandingCheck } from "./config.ts";

// Adapters can remove this redundant prefix when their workspace already enforces it.
const VERIFY_DEPS = "PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error";
const SHARED = ["scripts/**", "packages/signoff/**", ".signoff.json", "**/package.json", "**/tsconfig*.json", "**/vite*.config.*", "**/vitest*.config.*", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", ".orca/landing.json"];
const EXCLUDED = ["!**/node_modules/**", "!**/.git/**", "!**/*.sqlite*", "!**/test-results/**", "!**/dist/**", "!**/dist.next/**", "!.orca-tools/**", "!.orca-dev*/**", "!.test-baselines/**", "!.fallow/**", "!**/.vitest/**"];

/** Sign-off sets this to the check's input fingerprint, so a task cache hit can never outlive a changed fingerprint. */
export const SIGNOFF_KEY = "ORCA_SIGNOFF_KEY";

export const taskName = (check: Pick<LandingCheck, "name">) => `landing:${check.name.toLowerCase().replaceAll(/[^a-z\d]+/gu, "-").replaceAll(/^-|-$/gu, "")}`;

const shellCommand = (argv: readonly string[]) => argv.map(word => /^[\w@%+=:,./-]+$/u.test(word) ? word : `'${word.replaceAll("'", String.raw`'\''`)}'`).join(" ");

const SERIAL_DIR = /^src\/(?:harness|core\/(?:harness|process))(?:\/|$)/u;
const SERIAL_FILE = /(?:^|\/)(?:harness|process)\/|(?:crash|process)[^/]*\.test\.ts$/iu;

/** Engine test files that deny signals, crash or time processes, so they never share the machine with competing unit lanes. */
export const serialFiles = (server: string) => globSync("src/**/*.test.ts", { cwd: server }).filter(file => SERIAL_FILE.test(file) || /SIGKILL|SIGTERM|crash-/u.test(readFileSync(path.join(server, file), "utf-8"))).toSorted();

export interface TaskPart { task: string; serial: boolean; argv: string[] }

const isServerTest = (argv: readonly string[], serverPackage: string | undefined) => serverPackage !== undefined && argv.includes(serverPackage) && argv.includes("test");
const isVitest = (argv: readonly string[]) => argv.includes("--filter") && argv.includes("test");

/** A check's tasks: one, or for an engine shard that reaches serial files, an ordinary part that excludes them and a serial part that runs only them. */
export const taskParts = (check: LandingCheck, serial: readonly string[], serverPackage?: string, verifyDeps = false): TaskPart[] => {
  const argv = check.argv.filter(word => !verifyDeps || word !== VERIFY_DEPS);
  const task = taskName(check);
  const test = argv.indexOf("test");
  const filters = isServerTest(argv, serverPackage) ? argv.slice(test + 1) : [];
  const whole = argv.includes("scripts/*.test.ts") || argv.includes("apps/desktop/*.test.ts") || (filters.length > 0 && filters.every(filter => SERIAL_DIR.test(filter))) || argv.some(word => /(?:^|\/)(?:crash|process)[^/]*\.test\.ts$/u.test(word));

  if (whole) { return [{ task, serial: true, argv }]; }

  const files = filters.length === 0 ? [] : serial.filter(file => filters.some(filter => file.includes(filter)));
  const unit = [...argv, ...isVitest(argv) ? ["--maxWorkers=1"] : []];

  if (files.length === 0) { return [{ task, serial: false, argv: unit }]; }

  return [
    { task: `${task}:serial`, serial: true, argv: [...argv.slice(0, test + 1), ...files] },
    { task, serial: false, argv: [...unit, "--passWithNoTests", ...files.map(file => `--exclude=${file}`)] },
  ];
};

interface LandingTask { command: string; cwd?: string; dependsOn?: string[]; cache: false | { input: string[]; output: string[]; env: string[]; untrackedEnv: string[] } }

const cacheFor = (check: LandingCheck): LandingTask["cache"] => ({
  input: [...check.paths?.map(prefix => prefix.endsWith("/") ? `${prefix}**` : prefix) ?? ["**/*"], ...SHARED, ...EXCLUDED],
  output: [],
  env: ["NODE_ENV", SIGNOFF_KEY],
  // Tasks see the same environment cached or not; only the key and NODE_ENV decide a hit.
  untrackedEnv: ["*"],
});

const browser = (check: LandingCheck) => check.argv.includes("playwright");

/** `run.tasks` for vite.config.ts: one task per check part plus the three sign-off lanes. */
export const landingTasks = (checks: readonly LandingCheck[], serial: readonly string[] = [], serverPackage?: string, verifyDeps = false) => {
  const parts = checks.map(check => ({ check, parts: taskParts(check, serial, serverPackage, verifyDeps) }));
  const lane = (pick: (check: LandingCheck, part: TaskPart) => boolean): LandingTask => ({ command: "node -e 0", cache: false, dependsOn: parts.flatMap(({ check, parts: list }) => list.flatMap(part => pick(check, part) ? [part.task] : [])) });

  return {
    ...Object.fromEntries(parts.flatMap(({ check, parts: list }) => list.map((part): [string, LandingTask] => [part.task, { command: shellCommand(part.argv), cwd: check.cwd ?? ".", cache: cacheFor(check) }]))),
    "landing:serial": lane((check, part) => part.serial && !browser(check)),
    "landing:units": lane((check, part) => !part.serial && !browser(check)),
    "landing:browser": lane(browser),
  };
};
