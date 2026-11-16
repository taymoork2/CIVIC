import { execFileSync } from "node:child_process";

export const git = (root: string, ...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
