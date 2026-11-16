import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { loadavg } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export interface ProgressCheck {
  name: string;
  state: "pending" | "running" | "passed" | "reused" | "failed" | "stopped" | "skipped";
  startedAt?: number;
  seconds?: number;
  reason?: string;
  from?: string;
  output?: string;
  flaky?: boolean | undefined;
}

export interface Progress {
  version: 1;
  id: string;
  commit: string;
  name: string;
  state: "queued" | "held" | "running" | "passed" | "failed" | "stopped";
  reason: string;
  updatedAt: number;
  startedAt?: number;
  runner?: { pid: number; identity: string | null };
  checks: ProgressCheck[];
  selection?: "domain" | "full";
}

export const signoffDir = (root: string) =>
  path.join(
    path.resolve(
      root,
      execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: root,
        encoding: "utf-8",
      }).trim()
    ),
    "orca-signoff"
  );

const progressDir = (root: string) =>
  path.join(signoffDir(root), "progress-v1");

const validId = (id: string) => /^[a-f\d-]{36}$/u.test(id);

export const processIdentity = (pid: number): string | null => {
  try {
    return (
      execFileSync(
        "ps",
        ["-p", String(pid), "-o", "lstart=", "-o", "command="],
        {
          encoding: "utf-8",
          timeout: 1000,
          stdio: ["ignore", "pipe", "ignore"],
        }
      ).trim() || null
    );
  } catch {
    return null;
  }
};

// This is telemetry only: it never authorizes signing, admission, or process control.
export const writeProgress = (root: string, progress: Progress) => {
  assert.ok(validId(progress.id));
  const directory = progressDir(root);
  mkdirSync(directory, { recursive: true });
  progress.updatedAt = Date.now();
  const file = path.join(directory, `${progress.id}.json`);
  const temporary = `${file}.${randomUUID()}.tmp`;

  try {
    writeFileSync(temporary, JSON.stringify(progress), { flag: "wx" });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }

  const files = readdirSync(directory)
    .flatMap((name) => {
      if (!/^[a-f\d-]{36}\.json$/u.test(name)) { return []; }

      const stat = statSync(path.join(directory, name), {
        throwIfNoEntry: false,
      });

      return stat ? [{ name, time: stat.mtimeMs }] : [];
    })
    .toSorted((a, b) => b.time - a.time);

  for (const old of files.slice(100)) {
    rmSync(path.join(directory, old.name), { force: true });
  }
};

/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type -- Dependency-free parser validates untrusted disk JSON at the read boundary. */
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const optionalTime = (value: unknown) => value === undefined || finite(value);

const text = (value: unknown) =>
  typeof value === "string" && value.length <= 4096;

// oxlint-disable-next-line eslint/complexity -- Each condition validates one field in the dependency-free disk schema.
const isProgress = (v: unknown): v is Progress =>
  object(v) &&
  v.version === 1 &&
  typeof v.id === "string" &&
  validId(v.id) &&
  typeof v.commit === "string" &&
  /^[a-f\d]{40}$/u.test(v.commit) &&
  text(v.name) &&
  text(v.reason) &&
  finite(v.updatedAt) &&
  optionalTime(v.startedAt) &&
  ["queued", "held", "running", "passed", "failed", "stopped"].includes(
    typeof v.state === "string" ? v.state : ""
  ) &&
  (v.runner === undefined ||
    (object(v.runner) &&
      Number.isSafeInteger(v.runner.pid) &&
      Number(v.runner.pid) > 0 &&
      // pnpm can inject a long loader into the Node command line.
      (v.runner.identity === null || (typeof v.runner.identity === "string" && v.runner.identity.length <= 65_536)))) &&
  Array.isArray(v.checks) &&
  v.checks.length <= 1000 &&
  v.checks.every(
    (c) =>
      object(c) &&
      text(c.name) &&
      ["pending", "running", "passed", "reused", "failed", "stopped", "skipped"].includes(
        typeof c.state === "string" ? c.state : ""
      ) &&
      optionalTime(c.startedAt) &&
      optionalTime(c.seconds) &&
      (c.reason === undefined || text(c.reason)) &&
      (c.from === undefined || text(c.from)) &&
      (c.output === undefined || text(c.output)) &&
      (c.flaky === undefined || typeof c.flaky === "boolean")
  ) &&
  (v.selection === undefined || v.selection === "domain" || v.selection === "full");

/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type */

export const readProgress = (
  root: string
) => {
  const records: Progress[] = [];
  let unreadable = 0;
  let files: string[];
  let directory: string;

  try {
    directory = progressDir(root);
    files = readdirSync(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { records, unreadable };
    }

    return { records, unreadable: 1 };
  }

  for (const file of files
    .filter((name) => name.endsWith(".json"))
    .slice(0, 100)) {
    try {
      assert.ok(
        statSync(path.join(directory, file)).size <= 1024 * 1024
      );

      const value: unknown = JSON.parse(
        readFileSync(path.join(directory, file), "utf-8")
      );

      assert.ok(isProgress(value));
      records.push(value);
    } catch {
      unreadable += 1;
    }
  }

  return {
    records: records.toSorted((a, b) => b.updatedAt - a.updatedAt),
    unreadable,
  };
};

export const declareCandidate = (
  root: string,
  state: "queued" | "held",
  revision: string,
  name: string,
  reason: string
) => {
  assert.ok(
    name.trim() && reason.trim() && name.length <= 4096 && reason.length <= 4096
  );

  const commit = execFileSync(
    "git",
    ["rev-parse", "--verify", `${revision}^{commit}`],
    { cwd: root, encoding: "utf-8" }
  ).trim();

  const progress: Progress = {
    version: 1,
    id: randomUUID(),
    commit,
    name,
    state,
    reason,
    updatedAt: Date.now(),
    checks: [],
  };

  writeProgress(root, progress);

  return progress.id;
};

// oxlint-disable-next-line eslint/no-control-regex -- Strip terminal controls from untrusted snapshot text.
const clean = (s: string) => s.replaceAll(/[\u0000-\u001F\u007F-\u009F]/gu, " ");

export const renderProgress = (
  result: ReturnType<typeof readProgress>,
  details = false,
  now = Date.now()
) => {
  const lines = result.records.map((p) => {
    const alive =
      p.state !== "running" ||
      (p.runner !== undefined && p.runner.identity !== null &&
        processIdentity(p.runner.pid) === p.runner.identity);

    const label = alive
      ? {
          queued: "Queued next (declared)",
          held: "Held",
          running: "Running",
          passed: "Passed",
          failed: "Failed",
          stopped: "Stopped",
        }[p.state]
      : "Unknown / interrupted";

    const checks = p.checks.map(
      (c) =>
        `  ${clean(c.name)}: ${!alive && c.state === "running" ? "unknown / interrupted" : c.state}${c.flaky === true ? " (flaky: passed on rerun)" : ""}${c.startedAt === undefined ? "" : ` (${c.seconds ?? Math.floor(((alive && p.state === "running" ? now : p.updatedAt) - c.startedAt) / 1000)}s)`}${c.reason === undefined || c.reason === "" ? "" : ` — ${clean(c.reason)}`}`
    );

    return [
      `${label}: ${clean(p.name)}${p.startedAt === undefined ? "" : ` (${Math.floor(((p.state === "running" && alive ? now : p.updatedAt) - p.startedAt) / 1000)}s)`}`,
      `  ${alive ? clean(p.reason) : "Runner identity cannot be confirmed; last saved state follows."}`,
      ...checks,
      ...(details
        ? [
            `  Details: commit ${p.commit}; run ${p.id}; updated ${new Date(p.updatedAt).toISOString()}`,
            ...(p.selection === undefined
              ? []
              : [`  Selection: ${p.selection === "domain" ? "domain-selected (area map skipped some checks)" : "full"}`]),
          ]
        : []),
    ].join("\n");
  });

  if (!lines.length) {
    lines.push("No sign-off progress recorded.");
  }

  if (result.unreadable) {
    lines.push(
      `${result.unreadable} unreadable progress snapshot(s); status unknown.`
    );
  }

  return lines.join("\n\n");
};

export const watchProgress = async (
  root: string,
  {
    signal,
    seconds = 300,
    say = console.log,
  }: { signal: AbortSignal; seconds?: number; say?: (line: string) => void },
  details = false
) => {
  assert.ok(
    Number.isFinite(seconds) && seconds > 0 && seconds <= 3600,
    "Watch duration must be 1–3600 seconds"
  );
  const until = Date.now() + seconds * 1000;
  let previous = "";
  let delay = 1000;

  while (!signal.aborted && Date.now() < until) {
    const current = renderProgress(readProgress(root), details);

    if (current !== previous) {
      say(current);
    }

    delay = current === previous ? Math.min(delay * 2, 10_000) : 1000;
    previous = current;

    try {
      // oxlint-disable-next-line no-await-in-loop -- A bounded observer waits between successive snapshots.
      await sleep(Math.min(delay, Math.max(1, until - Date.now())), undefined, {
        signal,
      });
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    }
  }
};

const medianSeconds = (root: string) => {
  const seen = new Map<string, number[]>();

  try {
    const directory = signoffDir(root);

    const files = readdirSync(directory)
      .flatMap((name) => /^[a-f\d]{40}\.json$/u.test(name) ? [{ name, time: statSync(path.join(directory, name)).mtimeMs }] : [])
      .toSorted((a, b) => b.time - a.time)
      .slice(0, 10);

    for (const { name } of files) {
      const record: unknown = JSON.parse(readFileSync(path.join(directory, name), "utf-8"));

      for (const c of object(record) && Array.isArray(record.checks) ? record.checks : []) {
        if (object(c) && c.state === "passed" && text(c.name) && finite(c.seconds)) {
          seen.set(String(c.name), [...(seen.get(String(c.name)) ?? []), Number(c.seconds)]);
        }
      }
    }
  } catch {
    // No history yet: bars shimmer instead.
  }

  return new Map(
    [...seen].map(([name, list]) => [name, list.toSorted((a, b) => a - b)[Math.floor(list.length / 2)] ?? 0])
  );
};

const SPIN = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

export interface Tail {
  text: string;
  mtime: number;
}

// oxlint-disable-next-line eslint/no-control-regex -- Terminal escape sequences are what this strips.
const ESCAPES = /\u001B(?:\[[\d;?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)?|.)/gu;

export const tailLines = (raw: string, count: number, width: number) =>
  raw
    .replaceAll(ESCAPES, "")
    .split("\n")
    .map((line) => clean(line.split("\r").at(-1) ?? "").trimEnd())
    .filter((line, i, all) => line !== "" || i < all.length - 1)
    .slice(-count)
    .map((line) => (line.length > width ? `${line.slice(0, width - 1)}…` : line));

// shortcut: the last 16 KB only, so a line longer than that shows partly; raise if checks print huge lines.
const readTail = (file: string, directory: string) => {
  const resolved = path.resolve(file);

  if (!resolved.startsWith(directory + path.sep) || !resolved.endsWith(".part")) {
    return null;
  }

  try {
    const { size, mtimeMs } = statSync(resolved);
    const length = Math.min(size, 16_384);
    const buffer = Buffer.alloc(length);
    const fd = openSync(resolved, "r");

    try {
      readSync(fd, buffer, 0, length, size - length);
    } finally {
      closeSync(fd);
    }

    const full = buffer.toString("utf-8");

    return { text: length < size ? full.slice(full.indexOf("\n") + 1) : full, mtime: mtimeMs };
  } catch {
    return null;
  }
};

export const outputWindow = (tail: Tail, now: number, height: number, width: number, color: boolean) => {
  const ago = Math.max(0, Math.floor((now - tail.mtime) / 1000));
  const note = `last output ${ago}s ago`;
  const dim = (s: string) => (color ? `\u001B[2m${s}\u001B[0m` : s);
  const body = tailLines(tail.text, height, width - 6);

  return [
    dim(`      ┌ ${note}`),
    ...Array.from({ length: height }, (_, i) => dim(`      │ ${body[i - (height - body.length)] ?? ""}`)),
  ];
};

const GUESS_SECONDS = 30;

const GLYPHS = {
  passed: ["32", "✓"],
  reused: ["36", "↺"],
  failed: ["31", "✗"],
  stopped: ["33", "■"],
  running: ["35", ""],
  pending: ["2", "·"],
  skipped: ["2", "·"],
} as const;

// shortcut: lanes are inferred from the check name since snapshots don't record them; store the lane in the snapshot if names drift.
const laneOf = (name: string) => {
  if (name.endsWith("(serial part)")) {
    return "serial";
  }

  return /browser/iu.test(name) ? "browser" : "units";
};

const span = (seconds: number) =>
  seconds < 60 ? `${Math.round(seconds)}s` : `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, "0")}s`;

export const bar = (fraction: number, width: number, shimmerAt?: number) => {
  if (shimmerAt !== undefined) {
    const at = shimmerAt % (width + 3);

    return Array.from({ length: width }, (_, i) => (i >= at - 3 && i < at ? "█" : "░")).join("");
  }

  const filled = Math.round(Math.min(Math.max(fraction, 0), 1) * width);

  return "█".repeat(filled) + "░".repeat(width - filled);
};

const rowOf = (c: ProgressCheck, median: number | undefined, now: number) => {
  const skip = c.state === "skipped";
  const elapsed = c.seconds ?? (c.startedAt === undefined ? 0 : Math.max(0, (now - c.startedAt) / 1000));
  const done = c.state === "passed" || c.state === "reused";
  const weight = median ?? GUESS_SECONDS;
  let remaining = 0;
  let share = 0;

  if (c.state === "running") {
    remaining = Math.max(weight - elapsed, 0);
    share = Math.min(elapsed, weight);
  } else if (c.state === "pending") {
    remaining = weight;
  } else if (done) {
    share = weight;
  }

  return { c, median, skip, elapsed, done, remaining, share, weight: skip ? 0 : weight };
};

const gauge = (r: ReturnType<typeof rowOf>, frame: number) => {
  const median = r.median ?? 0;
  const known = median > 0;
  const fill = known ? r.elapsed / median : 0;
  const meter = r.c.state === "running" && !known ? bar(0, 10, frame) : bar(r.done ? 1 : fill, 10);

  if (r.c.state === "pending") {
    return { meter, time: "" };
  }

  return { meter, time: known ? `${span(r.elapsed)}/${span(median)}` : span(r.elapsed) };
};

export const renderLive = ({
  progress: p,
  medians,
  now,
  width: columns,
  load,
  color,
  tails = new Map<string, Tail>(),
  rows: terminalRows = 40,
  lines = 10,
}: {
  progress: Progress | undefined;
  medians: Map<string, number>;
  now: number;
  width: number;
  load: number;
  color: boolean;
  tails?: Map<string, Tail>;
  rows?: number;
  lines?: number;
}) => {
  if (p === undefined) {
    return "No sign-off progress recorded.";
  }

  const width = Math.max(60, columns);
  const paint = (code: string, s: string) => (color ? `\u001B[${code}m${s}\u001B[0m` : s);
  const frame = Math.floor(now / 100);

  // An ended run freezes its timers at its last update instead of counting on.
  const rows = p.checks.map((c) => rowOf(c, medians.get(c.name), p.state === "running" ? now : p.updatedAt));

  const glyph = (r: (typeof rows)[number]) => {
    const [code, mark] = GLYPHS[r.c.state];

    return paint(code, mark === "" ? (SPIN[frame % SPIN.length] ?? "·") : mark);
  };

  const total = rows.reduce((n, r) => n + r.weight, 0);
  const fraction = total === 0 ? Number(p.state === "passed") : rows.reduce((n, r) => n + r.share, 0) / total;
  const lanes = (["serial", "units", "browser"] as const).map((lane) => ({ lane, rows: rows.filter((r) => laneOf(r.c.name) === lane) }));
  const eta = Math.max(0, ...lanes.map(({ lane, rows: list }) => list.reduce((n, r) => n + r.remaining, 0) / (lane === "units" ? 2 : 1)));
  const status = p.state === "running" ? `ETA ${span(eta)}` : p.state;
  const stats = `${bar(fraction, 12)} ${Math.round(fraction * 100)}%  ${status}  load ${load.toFixed(1)}`;
  const nameWidth = width - 34;
  const room = Math.max(8, width - stats.length - 19);
  const subject = clean(p.name);
  const head = `${paint("1", p.state === "running" ? "Sign-off" : "No sign-off running · last")} ${subject.length > room ? `${subject.slice(0, room - 1)}…` : subject} ${paint("2", p.commit.slice(0, 7))}`;
  const out = [`${head}  ${paint("36", stats)}`, ""];

  const shown = new Set(rows.filter((r) => tails.has(r.c.name) && ["running", "failed"].includes(r.c.state)));
  const spare = terminalRows - rows.length - lanes.filter((l) => l.rows.length).length - 3;
  const height = Math.max(2, Math.min(lines, Math.floor(spare / Math.max(1, shown.size)) - 1));

  for (const { lane, rows: list } of lanes) {
    if (!list.length) {
      continue;
    }

    out.push(paint("1", `${lane} ${list.filter((r) => r.done).length}/${list.length}`));

    for (const r of list) {
      const name = clean(r.c.name);
      const label = (name.length > nameWidth ? `${name.slice(0, nameWidth - 1)}…` : name).padEnd(nameWidth);

      if (r.skip) {
        out.push(`  ${glyph(r)} ${paint("2", `${label.trimEnd()} skipped by area map`)}`);
        continue;
      }

      const live = r.c.state === "running";
      const pending = r.c.state === "pending";
      const { meter, time } = gauge(r, frame);
      out.push(`  ${glyph(r)} ${pending ? paint("2", label) : label} ${paint(live ? "35" : "2", meter)} ${time}`);

      if (r.c.flaky === true) { out.push(paint("33", "      flaky: passed on rerun")); }

      const tail = shown.has(r) ? tails.get(r.c.name) : undefined;

      if (tail !== undefined) {
        out.push(...outputWindow(tail, now, height, width, color));
      }
    }
  }

  return out.join("\n");
};

const liveWatch = async (root: string, signal: AbortSignal, seconds: number | undefined, lines: number) => {
  const directory = signoffDir(root);
  const tails = new Map<string, Tail>();
  const color = process.env.NO_COLOR === undefined;
  const medians = medianSeconds(root);
  const until = seconds === undefined ? Number.POSITIVE_INFINITY : Date.now() + seconds * 1000;
  let progress: Progress | undefined;
  let read = 0;
  let shown = "";

  process.stdout.write("\u001B[?25l\u001B[2J");

  try {
    while (!signal.aborted && Date.now() < until) {
      const now = Date.now();

      if (now - read >= 1000) {
        [progress] = readProgress(root).records;
        read = now;

        for (const c of progress?.checks ?? []) {
          const tail = (c.state === "running" || c.state === "failed") && c.output !== undefined ? readTail(c.output, directory) : null;

          if (tail !== null) {
            tails.set(c.name, tail);
          } else if (c.state !== "running" && c.state !== "failed") {
            tails.delete(c.name);
          }
        }
      }

      const frameText = renderLive({ progress, medians, now, width: process.stdout.columns, rows: process.stdout.rows, lines, tails, load: loadavg()[0] ?? 0, color });

      // Synchronized output (DEC 2026) shows each frame whole; terminals without it ignore the codes.
      if (frameText !== shown) {
        process.stdout.write(`\u001B[?2026h\u001B[H${frameText.split("\n").join("\u001B[K\n")}\u001B[K\u001B[J\u001B[?2026l`);
        shown = frameText;
      }

      try {
        // oxlint-disable-next-line no-await-in-loop -- A bounded observer waits between frames.
        await sleep(progress?.state === "running" ? 66 : 1000, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) {
          throw error;
        }
      }
    }
  } finally {
    process.stdout.write("\u001B[?25h\n");
  }
};

export const statusMain = async (root = process.cwd(), args = process.argv.slice(2)) => {

  try {
    if ((args[0] === "--queued" || args[0] === "--held") && args.length === 4) {
      console.log(
        declareCandidate(
          root,
          args[0] === "--queued" ? "queued" : "held",
          args[1] ?? assert.fail("Missing revision"),
          args[2] ?? assert.fail("Missing name"),
          args[3] ?? assert.fail("Missing reason")
        )
      );
    } else {
      assert.ok(
        args.every((a) => a === "--details" || /^--(?:watch|lines)(?:=\d+)?$/u.test(a)),
        "Usage: node scripts/signoff-status.ts [--details] [--watch[=seconds]] | --queued|--held <commit> <name> <reason>"
      );
      const watch = args.find((a) => a.startsWith("--watch"));

      if (watch === undefined) {
        console.log(renderProgress(readProgress(root), args.includes("--details")));
      } else {
        const stop = new AbortController();
        const lines = Number(args.find((a) => a.startsWith("--lines="))?.split("=")[1] ?? 10);
        const live = process.stdout.isTTY && !args.includes("--details");

        const cancel = () => {
          stop.abort();
        };

        process.on("SIGINT", cancel);
        process.on("SIGTERM", cancel);

        try {
          const [, given] = watch.split("=");

          if (live) {
            // A person watching stops it with Ctrl-C; it redraws only when something changes and slows to once a second when idle.
            assert.ok(given === undefined || Number(given) > 0, "Watch duration must be a positive number of seconds");
            await liveWatch(root, stop.signal, given === undefined ? undefined : Number(given), lines);
          } else {
            await watchProgress(root, { signal: stop.signal, seconds: Number(given ?? 300) }, args.includes("--details"));
          }
        } finally {
          process.off("SIGINT", cancel);
          process.off("SIGTERM", cancel);
        }
      }
    }
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
};

if (import.meta.main) { await statusMain(); }
