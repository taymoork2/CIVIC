/// <reference types="node" />
import { readFileSync } from "node:fs";
import { git } from "./git.ts";

const TYPES = ["feat", "fix", "refactor", "perf", "test", "docs", "style", "build", "ci", "chore", "revert"];
const TYPED = new RegExp(`^(?:${TYPES.join("|")})(?:\\([a-z0-9-]+\\))?!?: \\S`, "u");

// Git writes these titles itself.
const GENERATED = /^(?:Merge |Revert "|fixup! |squash! |amend! )/u;

const titleOf = (message: string) => message.split("\n").find(line => line.trim() !== "" && !line.startsWith("#")) ?? "";

export const typed = (message: string) => GENERATED.test(titleOf(message)) || TYPED.test(titleOf(message));

/** Titles of the commits after `base` that lack a conventional type. */
export const untyped = (root: string, base = "main") => git(root, "log", "--format=%s", `${base}..HEAD`).split("\n").filter(title => title !== "" && !typed(title));

export const advice = (titles: readonly string[]) => `Start each commit title with a type, like "fix: Keep the reason plain" (${TYPES.join(", ")}):\n${titles.map(title => `  ${title}`).join("\n")}`;

export const commitTypeMain = (root = process.cwd(), [file] = process.argv.slice(2)) => {
  const bad = file === undefined ? untyped(root) : [readFileSync(file, "utf-8")].flatMap(message => typed(message) ? [] : [titleOf(message)]);

  if (bad.length > 0) {
    console.error(advice(bad));
    process.exitCode = 1;
  }
};

if (import.meta.main) { commitTypeMain(); }
