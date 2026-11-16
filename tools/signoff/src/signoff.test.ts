import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
// oxlint-disable-next-line vitest/no-import-node-test -- These checks execute commands in real disposable Git repositories.
import { test as scenario } from "node:test";
import { ownedTemp } from "../civic-test-temp.ts";
import type { Check } from "./config.ts";
import { readProgress, renderLive, renderProgress, signoffDir } from "./signoff-status.ts";
import { signoff, verify } from "./signoff.ts";

const check = (name: string, code = "") => ({ name, paths: ["src/"], argv: [process.execPath, "-e", `const fs = require('node:fs'); fs.appendFileSync('.git/ran', '${name}\\n'); ${code}`] });

const setup = (checks: Check[] = [check("one"), check("two")]) => {
  const temp = ownedTemp("signoff-smart-");
  const root = temp.directory;
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root, encoding: "utf-8" }).trim();

  const write = (file: string, source: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), source);
  };

  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "test: Change fixture");

    return git("rev-parse", "HEAD");
  };

  git("init", "-qb", "main");
  write(".signoff.json", JSON.stringify({ checks }));
  write("notes/a.txt", "outside the checks\n");
  commit();
  git("switch", "-qc", "work");
  write("src/a.txt", "first\n");
  commit();

  return { ...temp, root, git, write, commit, directory: signoffDir(root), runs: () => readFileSync(path.join(root, ".git/ran"), "utf-8").trim().split("\n") };
};

const output = () => {
  const lines: string[] = [];

  return { lines, say: (line: string) => { lines.push(line); } };
};

await scenario("a move outside every check's inputs reuses every check and explains its source without writes", async () => {
  const f = setup();

  try {
    const first = f.git("rev-parse", "HEAD");
    assert.equal(await signoff(f.root, output()), true);
    f.git("mv", "notes/a.txt", "notes/b.txt");
    const moved = f.commit();
    const before = readdirSync(f.directory);
    const dry = output();
    assert.equal(await signoff(f.root, { dryRun: true, ...dry }), true);
    assert.equal(dry.lines.filter(line => line.includes(`reuse: same content as ${first}`)).length, 2);
    assert.deepEqual(readdirSync(f.directory), before);
    assert.equal(await signoff(f.root, output()), true);
    assert.deepEqual(f.runs(), ["one", "two"]);
    const snapshots = readProgress(f.root);
    assert.equal(snapshots.unreadable, 0);
    assert.equal(readProgress(f.root).records[0]?.checks.every(c => c.state === "reused"), true);
    assert.equal(verify(f.root, moved), "full");
  } finally { f.cleanup(); }
});

await scenario("a content change reruns, and moving an input cannot reuse identical bytes", async () => {
  const f = setup([check("read", "fs.readFileSync('src/a.txt');")]);

  try {
    assert.equal(await signoff(f.root, output()), true);
    f.write("src/a.txt", "changed\n");
    f.commit();
    assert.equal(await signoff(f.root, output()), true);
    assert.deepEqual(f.runs(), ["read", "read"]);
    f.git("mv", "src/a.txt", "src/b.txt");
    const moved = f.commit();
    assert.equal(await signoff(f.root, output()), false);
    assert.deepEqual(f.runs(), ["read", "read", "read", "read"]);
    assert.throws(() => verify(f.root, moved), /did not pass/u);
  } finally { f.cleanup(); }
});

await scenario("a check without input boundaries reruns on a move while a bounded check reuses", async () => {
  const f = setup([{ name: "whole", argv: check("whole").argv }, check("bounded")]);

  try {
    assert.equal(await signoff(f.root, output()), true);
    f.git("mv", "notes/a.txt", "notes/b.txt");
    f.commit();
    assert.equal(await signoff(f.root, output()), true);
    assert.deepEqual(f.runs(), ["whole", "bounded", "whole"]);
  } finally { f.cleanup(); }
});

for (const flakyPart of ["serial", "unit"]) {
  await scenario(`an actual Vite+ split check preserves a flaky ${flakyPart} part in its parent and cache`, async () => {
    const f = setup([{ name: "shard", paths: ["src/"], argv: ["pnpm", "--filter", "@fixture/server", "test", "src/core/"] }]);

    try {
      for (const part of ["serial", "unit"]) {
        const file = part === "serial" ? "process" : "ordinary";
        f.write(`src/core/${file}.test.ts`, `import assert from 'node:assert/strict'; import fs from 'node:fs'; fs.appendFileSync('.git/ran', '${part}\\n'); const seen = fs.existsSync('.git/${part}-seen'); fs.writeFileSync('.git/${part}-seen', ''); assert.ok(${part !== flakyPart} || seen);\n`);
      }

      f.write("vite.config.ts", `export default ${JSON.stringify({ run: { tasks: {
        "landing:shard:serial": { command: `${process.execPath} src/core/process.test.ts`, cache: false },
        "landing:shard": { command: `${process.execPath} src/core/ordinary.test.ts`, cache: false },
      } } })};\n`);
      f.write(".gitignore", "node_modules/\n");
      f.write("package.json", JSON.stringify({ name: "signoff-split-fixture", private: true, type: "module" }));
      f.write("pnpm-workspace.yaml", "packages: []\n");

      const sha = f.commit();
      const project = { tasks: { command: path.resolve(import.meta.dirname, "../../../packages/node_modules/.bin/vp"), serial: ["src/core/process.test.ts"], serverPackage: "@fixture/server" } };
      const states: boolean[] = [];
      const say = () => { states.push(readProgress(f.root).records[0]?.checks[0]?.flaky === true); };

      assert.equal(await signoff(f.root, { say }, project), true, readFileSync(path.join(f.directory, `${sha}.log`), "utf-8"));
      assert.ok(states.includes(true), readFileSync(path.join(f.directory, `${sha}.log`), "utf-8"));
      assert.match(readFileSync(path.join(f.directory, `${sha}.json`), "utf-8"), /"rerun":true,"flaky":true/u);
      const [pass] = readdirSync(path.join(f.directory, "passed"));
      assert.ok(pass !== undefined);
      assert.match(readFileSync(path.join(f.directory, "passed", pass), "utf-8"), /"flaky":true/u);
      assert.equal(f.runs().filter(part => part === flakyPart).length, 2);
      assert.equal(f.runs().filter(part => part !== flakyPart).length, 1);
      f.git("mv", "notes/a.txt", "notes/b.txt");
      f.commit();
      assert.equal(await signoff(f.root, output(), project), true);
      assert.equal(f.runs().length, 3);
      assert.equal(readProgress(f.root).records[0]?.checks[0]?.flaky, true);
    } finally { f.cleanup(); }
  });
}

await scenario("swapping contents, adding a duplicate, and moving a shared script all invalidate reuse", async () => {
  const f = setup();

  try {
    f.write("src/b.txt", "second\n");
    f.write("scripts/helper.ts", "export {};\n");
    f.commit();
    assert.equal(await signoff(f.root, output()), true);

    for (const change of [
      () => { f.write("src/a.txt", "second\n"); f.write("src/b.txt", "first\n"); },
      () => { f.write("src/c.txt", "second\n"); },
      () => { f.git("mv", "scripts/helper.ts", "notes/helper.ts"); },
      () => { chmodSync(path.join(f.root, "src/a.txt"), 0o755); },
    ]) {
      change();
      f.commit();
      const dry = output();
      assert.equal(await signoff(f.root, { dryRun: true, ...dry }), true);
      assert.equal(dry.lines.filter(line => line.endsWith("[run]")).length, 2);
      assert.equal(await signoff(f.root, output()), true);
    }

    assert.equal(f.runs().length, 10);
  } finally { f.cleanup(); }
});

await scenario("rerun passes remain flaky in records, both status views, reuse and the pass cache after record pruning", async () => {
  const f = setup([check("once", "if (!fs.existsSync('.git/seen')) { fs.writeFileSync('.git/seen', ''); process.exit(1); }")]);

  try {
    const sha = f.git("rev-parse", "HEAD");
    const first = output();
    assert.equal(await signoff(f.root, first), true);
    assert.match(readFileSync(path.join(f.directory, `${sha}.json`), "utf-8"), /"rerun":true,"flaky":true/u);
    assert.ok(first.lines.some(line => line === "Flaky checks (passed on rerun): once"));
    assert.equal(verify(f.root, sha), "full");
    rmSync(path.join(f.directory, `${sha}.json`));
    f.git("mv", "notes/a.txt", "notes/b.txt");
    const reused = f.commit();
    const dry = output();
    await signoff(f.root, { dryRun: true, ...dry });
    assert.ok(dry.lines.some(line => line.includes(`reuse: same content as ${sha}; flaky: passed on rerun`)));
    assert.equal(await signoff(f.root, output()), true);
    assert.deepEqual(f.runs(), ["once", "once"]);
    assert.match(readFileSync(path.join(f.directory, `${reused}.json`), "utf-8"), /"flaky":true/u);
    const status = readProgress(f.root);
    assert.equal(status.unreadable, 0);
    assert.equal(status.records[0]?.checks[0]?.flaky, true);
    assert.match(renderProgress(status), /once: reused \(flaky: passed on rerun\)/u);
    assert.match(renderLive({ progress: status.records[0], medians: new Map(), now: Date.now(), width: 100, load: 0, color: false }), /flaky: passed on rerun/u);
    assert.equal(verify(f.root, reused), "full");
    assert.equal(await signoff(f.root, { fresh: true, ...output() }), true);
    assert.notEqual(readProgress(f.root).records[0]?.checks[0]?.flaky, true);
    const [snapshot] = readProgress(f.root).records;
    assert.ok(snapshot !== undefined);
    const file = path.join(f.directory, "progress-v1", `${snapshot.id}.json`);
    writeFileSync(file, JSON.stringify({ ...snapshot, runner: { pid: process.pid, identity: "x".repeat(65_536) } }));
    assert.equal(readProgress(f.root).unreadable, 0);
    writeFileSync(file, JSON.stringify({ ...snapshot, runner: { pid: process.pid, identity: "x".repeat(65_537) } }));
    assert.equal(readProgress(f.root).unreadable, 1);
    writeFileSync(file, JSON.stringify({ ...snapshot, checks: [{ ...snapshot.checks[0], flaky: "yes" }] }));
    assert.equal(readProgress(f.root).unreadable, 1);
  } finally { f.cleanup(); }
});

await scenario("a twice-failed check is a failure rather than a flaky pass and never earns a cache entry", async () => {
  const f = setup([check("fail", "process.exit(1);")]);

  try {
    assert.equal(await signoff(f.root, output()), false);
    assert.deepEqual(f.runs(), ["fail", "fail"]);
    assert.equal(readProgress(f.root).records[0]?.checks[0]?.flaky, undefined);
    assert.deepEqual(readdirSync(path.join(f.directory, "passed")), []);
  } finally { f.cleanup(); }
});

await scenario("a flaky pass is cached with its warning before a later required check fails", async () => {
  const f = setup([
    check("once", "if (!fs.existsSync('.git/seen')) { fs.writeFileSync('.git/seen', ''); process.exit(1); }"),
    check("fail", "process.exit(1);"),
  ]);

  try {
    let observed = false;
    const sha = f.git("rev-parse", "HEAD");

    const say = (line: string) => {
      if (line !== "run   fail") { return; }

      assert.equal(existsSync(path.join(f.directory, `${sha}.json`)), false);
      const files = readdirSync(path.join(f.directory, "passed"));
      assert.equal(files.length, 1);
      assert.match(readFileSync(path.join(f.directory, "passed", files[0] ?? assert.fail("missing pass")), "utf-8"), /"flaky":true/u);
      observed = true;
    };

    assert.equal(await signoff(f.root, { say }), false);
    assert.equal(observed, true);
    const dry = output();
    await signoff(f.root, { dryRun: true, ...dry });
    assert.ok(dry.lines.some(line => line.includes(`reuse: same content as ${sha}; flaky: passed on rerun`)));
  } finally { f.cleanup(); }
});

await scenario("legacy path-bound fingerprints remain reusable and malformed pass metadata runs the check", async () => {
  const f = setup([check("old")]);

  try {
    const definition = check("old");
    const listing = f.git("ls-tree", "-r", "-z", "HEAD").split("\0").filter(Boolean);
    const shared = [process.version, process.platform, process.arch, listing.filter(line => line.endsWith("\t.signoff.json"))];
    const scoped = listing.filter(line => line.split("\t")[1]?.startsWith("src/") === true);
    const key = createHash("sha256").update(JSON.stringify([definition, shared, scoped])).digest("hex");
    const sha = f.git("rev-parse", "HEAD");
    f.write(`.git/orca-signoff/passed/${key}`, sha);
    f.write(`.git/orca-signoff/${sha}.json`, JSON.stringify({ checks: [{ name: "old", state: "passed", rerun: true }] }));
    assert.equal(await signoff(f.root, output()), true);
    assert.equal(existsSync(path.join(f.root, ".git/ran")), false);
    assert.equal(readProgress(f.root).records[0]?.checks[0]?.flaky, true);

    for (const file of readdirSync(path.join(f.directory, "passed"))) {
      f.write(`.git/orca-signoff/passed/${file}`, '{"commit":"bad","flaky":true}');
    }

    assert.equal(await signoff(f.root, output()), true);
    assert.deepEqual(f.runs(), ["old"]);
  } finally { f.cleanup(); }
});

await scenario("commit titles need a type only when the project's sign-off config asks for it", async () => {
  const f = setup();

  try {
    f.git("commit", "-q", "--allow-empty", "-m", "Untyped change");
    assert.equal(await signoff(f.root, { dryRun: true, ...output() }), true);
    f.git("switch", "-q", "main");
    f.write(".signoff.json", JSON.stringify({ checks: [check("one")], typedCommits: true }));
    f.commit();
    f.git("switch", "-q", "work");
    f.git("rebase", "-q", "main");
    await assert.rejects(signoff(f.root, { dryRun: true, ...output() }), /Not signed off: .*Untyped change/su);
  } finally { f.cleanup(); }
});
