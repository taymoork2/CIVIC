import { execFileSync } from "node:child_process";
import { loadavg } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import assert from "node:assert/strict";

export interface ProcessEntry { pid: number; ppid: number; age: number; command: string }

const DEFAULT_MAX_LOAD = 10;
const DEFAULT_WAIT_MAX_MINUTES = 120;
const SETTLE_MS = 30_000;
const POLL_MS = 10_000;

const SIGNOFF_SCRIPT = /(?:^|\/)scripts\/signoff\.ts$/u;
const RUNNER_SCRIPT = /(?:^|\/)landing\/signoff-runner\.ts$/u;
const EVAL_IMPORT = /\bimport\(\s*["'](?<script>[^"']*scripts\/signoff\.ts)["']/u;
const EVAL_FLAGS = new Set(["-e", "--eval", "-p", "--print"]);
const NODE_VALUE_FLAGS = new Set(["--import", "--require", "-r", "--loader", "--experimental-loader", "--conditions", "-C", "--env-file"]);
const SHELLS = new Set(["bash", "sh", "zsh"]);

// These invocations read or print; only the others run checks and load the machine.
const NOT_A_RUN = /^--(?:dry-run|verify|watch(?:=.*)?|help)$/u;

const base = (word: string) => path.posix.basename(word);

interface Launch { script: string; args: string[] }

const nodeLaunch = (words: readonly string[]): Launch | undefined => {
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index] ?? "";

    if (EVAL_FLAGS.has(word)) {
      const script = EVAL_IMPORT.exec(words.slice(index + 1).join(" "))?.groups?.script;

      return script === undefined ? undefined : { script, args: [] };
    }

    if (NODE_VALUE_FLAGS.has(word)) { index += 1; continue; }

    if (word.startsWith("-")) { continue; }

    if (SIGNOFF_SCRIPT.test(word) || RUNNER_SCRIPT.test(word)) { return { script: word, args: words.slice(index + 1) }; }

    return base(word) === "with-temp-root.mjs" ? launch(words.slice(index + 1)) : undefined;
  }

  return undefined;
};

const shellLaunch = (words: readonly string[]): Launch | undefined => {
  const script = words.slice(1).find(word => !word.startsWith("-"));

  return script !== undefined && base(script) === "signoff" && base(path.posix.dirname(script)) === "bin" ? { script, args: words.slice(words.indexOf(script) + 1) } : undefined;
};

const launch = (words: readonly string[]): Launch | undefined => {
  const program = base(words[0] ?? "");

  if (program === "node") { return nodeLaunch(words); }

  return SHELLS.has(program) ? shellLaunch(words) : undefined;
};

/** The script a command line is running a sign-off from, or undefined when it is anything else (grep, an editor, a dry run, the status view). */
const signoffScript = (command: string) => {
  const found = launch(command.trim().split(/\s+/u));

  return found !== undefined && !found.args.some(arg => NOT_A_RUN.test(arg)) ? found.script : undefined;
};

export const isSignoffCommand = (command: string) => signoffScript(command) !== undefined;

const repositoryName = (script: string) => {
  const worktree = /\/worktrees\/(?<project>[^/]+)\//u.exec(script)?.groups?.project;

  if (worktree !== undefined) { return worktree; }

  const parts = script.split("/");
  const root = parts.findLastIndex(part => part === "scripts" || part === "bin" || part === "apps");

  return root > 0 ? parts[root - 1] ?? "another repository" : "another repository";
};

/** `ps -Ao pid=,ppid=,etime=,command=` rows; etime is `[[dd-]hh:]mm:ss`. */
export const parseProcessList = (output: string): ProcessEntry[] => output.split("\n").flatMap(line => {
  const row = /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?:(?<days>\d+)-)?(?:(?<hours>\d+):)?(?<minutes>\d+):(?<seconds>\d+)\s+(?<command>.+)$/u.exec(line)?.groups;

  if (row === undefined) { return []; }

  const { pid = "", ppid = "", days = "0", hours = "0", minutes = "0", seconds = "0", command = "" } = row;

  return [{ pid: Number(pid), ppid: Number(ppid), age: ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds), command }];
});

const readProcesses = () => parseProcessList(execFileSync("ps", ["-A", "-ww", "-o", "pid=,ppid=,etime=,command="], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }));

export interface RunningSignoff extends ProcessEntry { name: string }

/** Sign-offs running on the machine other than this process, its ancestors (wrappers) and its descendants. */
export const otherSignoffs = (processes: readonly ProcessEntry[], self: number): RunningSignoff[] => {
  const byPid = new Map(processes.map(entry => [entry.pid, entry] as const));
  const relatives = new Set([self]);

  for (let pid = byPid.get(self)?.ppid; pid !== undefined && !relatives.has(pid); pid = byPid.get(pid)?.ppid) { relatives.add(pid); }

  for (const entry of processes) {
    const chain = new Set<number>();

    for (let pid: number | undefined = entry.pid; pid !== undefined && !chain.has(pid); pid = byPid.get(pid)?.ppid) {
      chain.add(pid);

      if (pid === self) { relatives.add(entry.pid); }
    }
  }

  return processes.flatMap(entry => {
    const script = relatives.has(entry.pid) ? undefined : signoffScript(entry.command);

    return script === undefined ? [] : [{ ...entry, name: repositoryName(script) }];
  });
};

const ago = (seconds: number) => {
  if (seconds < 60) { return "under a minute ago"; }

  const minutes = Math.floor(seconds / 60);

  return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
};

/** What the machine is waiting on, in plain words, or undefined when it is quiet. Of two sign-offs that both wait, the older goes first, so they never wait on each other. */
export const busyReason = (processes: readonly ProcessEntry[], load: number, self: number, maxLoad: number) => {
  const me = processes.find(entry => entry.pid === self);
  const ahead = otherSignoffs(processes, self).filter(other => me === undefined || other.age > me.age || (other.age === me.age && other.pid < me.pid)).toSorted((a, b) => b.age - a.age);
  const [oldest] = ahead;

  if (oldest !== undefined) {
    return ahead.length === 1 ? `another sign-off to finish (${oldest.name}, started ${ago(oldest.age)})` : `${ahead.length} other sign-offs to finish (oldest: ${oldest.name}, started ${ago(oldest.age)})`;
  }

  return load >= maxLoad ? `the machine to quieten (load ${Math.round(load)})` : undefined;
};

export interface GateDeps {
  processes: () => ProcessEntry[];
  load: () => number;
  now: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  self: number;
}

export interface GateOptions {
  maxLoad?: number | undefined;
  maxWaitMinutes?: number | undefined;
  /** An updating status line; an empty line clears it. */
  status: (line: string) => void;
  say: (line: string) => void;
  signal?: AbortSignal | undefined;
}

const realDeps: GateDeps = { processes: readProcesses, load: () => loadavg()[0] ?? 0, now: Date.now, sleep: async (ms, signal) => { await sleep(ms, undefined, signal === undefined ? undefined : { signal }); }, self: process.pid };

/** Returns once no other sign-off is running and the load is below the limit on two looks 30 seconds apart; throws a plain reason after the wait bound. */
export const waitForQuietMachine = async ({ maxLoad = DEFAULT_MAX_LOAD, maxWaitMinutes = DEFAULT_WAIT_MAX_MINUTES, status, say, signal }: GateOptions, deps: GateDeps = realDeps) => {
  const deadline = deps.now() + maxWaitMinutes * 60_000;
  let warned = false;

  const look = () => {
    let processes: ProcessEntry[] = [];

    try {
      processes = deps.processes();
    } catch {
      if (!warned) { say("Can't see other sign-offs from here; waiting on the machine's load only."); warned = true; }
    }

    return busyReason(processes, deps.load(), deps.self, maxLoad);
  };

  for (;;) {
    let reason = look();

    if (reason === undefined) {
      status("The machine is quiet; checking once more in 30 seconds");
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each look depends on the wait before it.
      await deps.sleep(SETTLE_MS, signal);
      reason = look();

      if (reason === undefined) {
        status("");

        return;
      }
    }

    if (deps.now() >= deadline) {
      status("");
      throw new Error(`Not signed off: still waiting for ${reason} after ${maxWaitMinutes} min. Try again later, or use --no-wait to start anyway.`);
    }

    status(`Waiting for ${reason}`);
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each look depends on the wait before it.
    await deps.sleep(POLL_MS, signal);
  }
};

/** Rewrites one terminal line, or prints each distinct line once when output is a log. */
export const statusWriter = (say: (line: string) => void, tty: boolean) => {
  let last = "";

  return (line: string) => {
    if (tty) {
      process.stdout.write(`\r\u001B[2K${line}`);

      return;
    }

    if (line !== "" && line !== last) { last = line; say(line); }
  };
};

export interface WaitFlags { noWait: boolean; waitMaxMinutes: number | undefined; rest: string[] }

export const waitFlags = (args: readonly string[]): WaitFlags => {
  const flags: WaitFlags = { noWait: false, waitMaxMinutes: undefined, rest: [] };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";

    if (arg === "--no-wait") {
      flags.noWait = true;
    } else if (arg === "--wait-max" || arg.startsWith("--wait-max=")) {
      index += arg === "--wait-max" ? 1 : 0;
      const value = arg === "--wait-max" ? args[index] : arg.slice("--wait-max=".length);
      const minutes = Number(value);
      assert.ok(value !== undefined && value !== "" && Number.isFinite(minutes) && minutes > 0, "--wait-max needs a number of minutes, such as --wait-max 30");
      flags.waitMaxMinutes = minutes;
    } else {
      flags.rest.push(arg);
    }
  }

  return flags;
};
