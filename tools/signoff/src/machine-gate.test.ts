import assert from "node:assert/strict";
// oxlint-disable-next-line vitest/no-import-node-test -- Pure decision logic with an injected process list, load and clock.
import { test as scenario } from "node:test";
import { busyReason, isSignoffCommand, otherSignoffs, parseProcessList, waitFlags, waitForQuietMachine } from "./machine-gate.ts";
import type { GateDeps, ProcessEntry } from "./machine-gate.ts";
import { loadConfig } from "./config.ts";

const proc = (pid: number, ppid: number, command: string, age = 0): ProcessEntry => ({ pid, ppid, age, command });

await scenario("the matcher accepts every way a sign-off is started", () => {
  for (const command of [
    "node /Users/me/Projects/orca/scripts/signoff.ts",
    "/opt/homebrew/bin/node --experimental-strip-types /Users/me/Projects/orca/scripts/signoff.ts --fresh --all",
    "node --import tsx /Users/me/Projects/orca/scripts/signoff.ts",
    "node -e import(\"/Users/me/Projects/orca/scripts/signoff.ts\").then(m => m.signoff(process.cwd(), { say: console.log }))",
    "node /Users/me/Projects/CIVIC/bin/with-temp-root.mjs node /Users/me/Projects/CIVIC/scripts/signoff.ts --candidate=0b0c0d0e-1111-2222-3333-444455556666",
    "bash /Users/me/Projects/CIVIC/bin/signoff",
    "/bin/bash /Users/me/Projects/CIVIC/bin/signoff --fresh",
    "node /Users/me/Projects/orca/apps/server/src/core/landing/signoff-runner.ts",
  ]) { assert.equal(isSignoffCommand(command), true, command); }
});

await scenario("the matcher ignores anything that only mentions the script or does not run checks", () => {
  for (const command of [
    "grep -rn scripts/signoff.ts apps",
    "grep node scripts/signoff.ts",
    "rg \"scripts/signoff.ts\"",
    "vim scripts/signoff.ts",
    "code /Users/me/Projects/orca/scripts/signoff.ts",
    "tail -f /tmp/log node scripts/signoff.ts",
    "node --test scripts/signoff.test.ts",
    "node scripts/signoff-status.ts",
    "node scripts/other.ts scripts/signoff.ts",
    "node -e console.log(\"scripts/signoff.ts\")",
    "bash -c ./bin/signoff-helper",
    "bash /Users/me/Projects/CIVIC/bin/signoff-all",
    "node /Users/me/Projects/orca/scripts/signoff.ts --dry-run",
    "node /Users/me/Projects/orca/scripts/signoff.ts --verify 0123abc",
    "node /Users/me/Projects/orca/scripts/signoff.ts --watch=5 --details",
    "bash /Users/me/Projects/CIVIC/bin/signoff --watch",
    "node /Users/me/Projects/orca/scripts/signoff.ts --help",
    "",
  ]) { assert.equal(isSignoffCommand(command), false, command); }
});

await scenario("the process's own wrapper chain and children are not other sign-offs", () => {
  const list = [
    proc(10, 1, "bash /Users/me/Projects/CIVIC/bin/signoff"),
    proc(11, 10, "node /Users/me/Projects/CIVIC/bin/with-temp-root.mjs node /Users/me/Projects/CIVIC/scripts/signoff.ts"),
    proc(12, 11, "node /Users/me/Projects/CIVIC/scripts/signoff.ts"),
    proc(13, 12, "node /Users/me/Projects/CIVIC/scripts/signoff.ts --fresh"),
    proc(20, 1, "node /Users/me/.t3/worktrees/orca/t3-ab12/scripts/signoff.ts", 240),
    proc(21, 1, "grep -rn scripts/signoff.ts ."),
  ];

  assert.deepEqual(otherSignoffs(list, 12).map(entry => [entry.pid, entry.name]), [[20, "orca"]]);
  assert.deepEqual(otherSignoffs(list, 20).map(entry => [entry.pid, entry.name]), [[10, "CIVIC"], [11, "CIVIC"], [12, "CIVIC"], [13, "CIVIC"]]);
  assert.deepEqual(otherSignoffs(list.slice(0, 4), 12), []);
});

await scenario("process rows parse pid, parent, elapsed time and the whole command", () => {
  assert.deepEqual(parseProcessList("    1     0    1-02:03:04 /sbin/launchd\n  812   1       05:09 node -e import(\"/x/scripts/signoff.ts\")\n  900 812    1:02:03 bash /x/bin/signoff --fresh\nnot a row\n"), [
    { pid: 1, ppid: 0, age: 93_784, command: "/sbin/launchd" },
    { pid: 812, ppid: 1, age: 309, command: "node -e import(\"/x/scripts/signoff.ts\")" },
    { pid: 900, ppid: 812, age: 3723, command: "bash /x/bin/signoff --fresh" },
  ]);
});

const busy = (processes: ProcessEntry[], load: number, self = 100) => busyReason(processes, load, self, 10);
const me = proc(100, 1, "node /a/orca/scripts/signoff.ts", 5);

await scenario("a quiet machine has no reason to wait; load at or over the limit does", () => {
  assert.equal(busy([me], 9.9), undefined);
  assert.equal(busy([me], 10), "the machine to quieten (load 10)");
  assert.equal(busy([me], 12.6), "the machine to quieten (load 13)");
});

await scenario("an older sign-off holds this one back, naming its repository and age", () => {
  const civic = proc(200, 1, "bash /x/CIVIC/bin/signoff", 240);
  assert.equal(busy([me, civic], 2), "another sign-off to finish (CIVIC, started 4 min ago)");
  assert.equal(busy([me, civic, proc(201, 1, "node /x/orca/scripts/signoff.ts", 7300)], 2), "2 other sign-offs to finish (oldest: orca, started 2 h 1 min ago)");
  assert.equal(busy([me, proc(200, 1, "bash /x/CIVIC/bin/signoff", 20)], 2), "another sign-off to finish (CIVIC, started under a minute ago)");
});

await scenario("two waiting sign-offs never wait on each other: only the older one is ahead", () => {
  const older = proc(200, 1, "node /x/CIVIC/scripts/signoff.ts", 40);
  const younger = proc(100, 1, "node /x/orca/scripts/signoff.ts", 38);
  assert.equal(busy([older, younger], 0, 200), undefined);
  assert.match(busy([older, younger], 0, 100) ?? "", /another sign-off/u);
  const sameSecondLowerPid = proc(90, 1, "node /x/CIVIC/scripts/signoff.ts", 38);
  assert.match(busy([sameSecondLowerPid, younger], 0, 100) ?? "", /another sign-off/u);
  assert.equal(busy([sameSecondLowerPid, younger], 0, 90), undefined);
});

const fixture = (frames: { processes?: ProcessEntry[]; load?: number }[]) => {
  let clock = 0;
  let looks = 0;
  const sleeps: number[] = [];
  const statuses: string[] = [];
  const said: string[] = [];
  const frame = () => frames[Math.min(Math.max(looks - 1, 0), frames.length - 1)] ?? {};

  const deps: GateDeps = {
    processes: () => {
      looks += 1;

      if (frames.length === 0) { throw new Error("ps unavailable"); }

      return frame().processes ?? [me];
    },
    load: () => frame().load ?? 0,
    now: () => clock,
    sleep: (ms: number) => {
      sleeps.push(ms);
      clock += ms;

      return Promise.resolve();
    },
    self: 100,
  };

  return { deps, sleeps, statuses, said, options: { status: (line: string) => { statuses.push(line); }, say: (line: string) => { said.push(line); } } };
};

await scenario("a quiet machine is looked at twice, 30 seconds apart, before starting", async () => {
  const f = fixture([{ load: 1 }]);
  await waitForQuietMachine(f.options, f.deps);
  assert.deepEqual(f.sleeps, [30_000]);
  assert.deepEqual(f.statuses, ["The machine is quiet; checking once more in 30 seconds", ""]);
});

await scenario("another sign-off or a high load is waited out with one updating status line", async () => {
  const civic = proc(200, 1, "bash /x/CIVIC/bin/signoff", 240);
  const f = fixture([{ processes: [me, civic] }, { processes: [me, civic] }, { load: 13 }, { load: 4 }, { load: 4 }]);
  await waitForQuietMachine(f.options, f.deps);
  assert.deepEqual(f.statuses, ["Waiting for another sign-off to finish (CIVIC, started 4 min ago)", "Waiting for another sign-off to finish (CIVIC, started 4 min ago)", "Waiting for the machine to quieten (load 13)", "The machine is quiet; checking once more in 30 seconds", ""]);
  assert.deepEqual(f.sleeps, [10_000, 10_000, 10_000, 30_000]);
});

await scenario("a sign-off that appears during the 30 second pause sends the wait around again", async () => {
  const f = fixture([{ load: 1 }, { processes: [me, proc(200, 1, "bash /x/CIVIC/bin/signoff", 100)] }, { load: 1 }, { load: 1 }]);
  await waitForQuietMachine(f.options, f.deps);
  assert.deepEqual(f.sleeps, [30_000, 10_000, 30_000]);
});

await scenario("the wait is bounded and ends with a plain reason", async () => {
  const f = fixture([{ load: 20 }]);
  await assert.rejects(waitForQuietMachine({ ...f.options, maxWaitMinutes: 1 }, f.deps), /Not signed off: still waiting for the machine to quieten \(load 20\) after 1 min\. Try again later, or use --no-wait to start anyway\./u);
  assert.equal(f.sleeps.reduce((sum, ms) => sum + ms, 0), 60_000);
});

await scenario("an unreadable process list is said once and only the load is waited on", async () => {
  const f = fixture([]);
  await waitForQuietMachine(f.options, f.deps);
  assert.deepEqual(f.said, ["Can't see other sign-offs from here; waiting on the machine's load only."]);
});

await scenario("a stopped sign-off stops waiting", async () => {
  const stop = new AbortController();
  const f = fixture([{ load: 20 }]);

  const sleep = (_ms: number, signal?: AbortSignal) => {
    stop.abort();
    signal?.throwIfAborted();

    return Promise.resolve();
  };

  const deps = { ...f.deps, sleep };

  await assert.rejects(waitForQuietMachine({ ...f.options, signal: stop.signal }, deps), /abort/iu);
});

await scenario("wait flags are split from the other arguments and validated", () => {
  assert.deepEqual(waitFlags(["--fresh", "--no-wait", "--wait-max", "30", "--all"]), { noWait: true, waitMaxMinutes: 30, rest: ["--fresh", "--all"] });
  assert.deepEqual(waitFlags(["--wait-max=0.5"]), { noWait: false, waitMaxMinutes: 0.5, rest: [] });
  assert.deepEqual(waitFlags(["--dry-run"]), { noWait: false, waitMaxMinutes: undefined, rest: ["--dry-run"] });

  for (const bad of [["--wait-max"], ["--wait-max", "soon"], ["--wait-max=0"], ["--wait-max", "-5"]]) {
    assert.throws(() => waitFlags(bad), /--wait-max needs a number of minutes/u, bad.join(" "));
  }
});

await scenario("the load limit is a config field that must be a sensible number", () => {
  const checks = [{ name: "one", argv: ["true"] }];
  assert.equal(loadConfig(JSON.stringify({ checks })).maxLoad, undefined);
  assert.equal(loadConfig(JSON.stringify({ checks, maxLoad: 6.5 })).maxLoad, 6.5);

  for (const maxLoad of [0, -1, "10", null, 5000]) { assert.throws(() => loadConfig(JSON.stringify({ checks, maxLoad })), /Invalid maxLoad/u, String(maxLoad)); }
});
