import assert from "node:assert/strict";

export interface Check {
  name: string;
  argv: readonly string[];
  cwd?: string | undefined;
  paths?: readonly string[] | undefined;
  timeoutMs?: number | undefined;
  signoffOnly?: boolean | undefined;
}

export interface DomainMap { broad: string[]; domains: { name: string; match: string; checks: "all" | string[] }[] }

export interface Config { checks: Check[]; areaMap?: DomainMap; relatedTests?: boolean; vite?: boolean; typedCommits?: boolean; maxLoad?: number }

export interface Project {
  configFile?: string;
  areaMapFile?: string;
  relatedTests?: boolean;
  tasks?: { command: string; serial: readonly string[]; serverPackage?: string; verifyDeps?: boolean } | undefined;
}

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSON stays unknown until validated at the file boundary.
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const relative = (value: string) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..");
const localPath = (value: unknown, limit: number): value is string => text(value) && value.length <= limit && relative(value);
const duration = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 86_400_000;
const boolean = (value: unknown): value is boolean => typeof value === "boolean";
const loadLimit = (value: unknown): value is number => typeof value === "number" && value > 0 && value <= 1000;

const only = (keys: readonly string[], allowedKeys: readonly string[]) => {
  const allowed = new Set(allowedKeys);

  return keys.every(key => allowed.has(key));
};

const isCheck = (value: unknown): value is Check => object(value) && only(Object.keys(value), ["name", "argv", "cwd", "paths", "timeoutMs", "signoffOnly"]) &&
  text(value.name) && value.name.length <= 120 && strings(value.argv) && value.argv.length > 0 && value.argv.length <= 32 && value.argv.every(word => word.length <= 1024) &&
  (value.cwd === undefined || localPath(value.cwd, 1024)) &&
  (value.paths === undefined || (strings(value.paths) && value.paths.length <= 64 && value.paths.every(prefix => localPath(prefix, 512)))) &&
  (value.timeoutMs === undefined || duration(value.timeoutMs)) &&
  (value.signoffOnly === undefined || boolean(value.signoffOnly));

const isDomainMap = (value: unknown): value is DomainMap => object(value) && only(Object.keys(value), ["broad", "domains"]) && strings(value.broad) && Array.isArray(value.domains) && value.domains.every(domain =>
  object(domain) && only(Object.keys(domain), ["name", "match", "checks"]) && text(domain.name) && text(domain.match) && (domain.checks === "all" || strings(domain.checks)));

export const parseDomainMap = (source: string) => {
  const map: unknown = JSON.parse(source);
  assert.ok(isDomainMap(map), "Unreadable sign-off domain map");

  for (const domain of map.domains) { assert.doesNotThrow(() => new RegExp(domain.match, "u"), "Invalid area map pattern"); }

  return map;
};

export const loadConfig = (source: string, areaMap?: string): Config => {
  const value: unknown = JSON.parse(source);
  const manifest = Array.isArray(value) ? { checks: value } : value;
  assert.ok(object(manifest) && only(Object.keys(manifest), ["checks", "areaMap", "relatedTests", "vite", "typedCommits", "step", "budgetMs", "maxLoad"]), "Unreadable sign-off config");
  assert.ok(Array.isArray(manifest.checks) && manifest.checks.length > 0 && manifest.checks.length <= 32 && manifest.checks.every(isCheck), "Invalid sign-off checks: use names, argv and repository-relative paths");
  assert.ok(manifest.step === undefined || manifest.step === "merge" || manifest.step === "pr", "Invalid landing step");
  assert.ok(manifest.budgetMs === undefined || duration(manifest.budgetMs), "Invalid check budget");
  assert.ok(manifest.maxLoad === undefined || loadLimit(manifest.maxLoad), "Invalid maxLoad");
  const config: Config = { checks: manifest.checks };

  if (loadLimit(manifest.maxLoad)) { config.maxLoad = manifest.maxLoad; }

  assert.equal(new Set(config.checks.map(check => check.name)).size, config.checks.length, "Duplicate sign-off check name");

  for (const option of ["relatedTests", "vite", "typedCommits"] as const) {
    if (manifest[option] !== undefined) {
      const enabled: unknown = manifest[option];
      assert.ok(boolean(enabled), `Invalid ${option} option`);
      config[option] = enabled;
    }
  }

  if (areaMap !== undefined || manifest.areaMap !== undefined) { config.areaMap = parseDomainMap(areaMap ?? JSON.stringify(manifest.areaMap)); }

  if (config.areaMap !== undefined) {
    for (const domain of config.areaMap.domains) {
      assert.ok(domain.checks === "all" || domain.checks.every(name => config.checks.some(check => check.name === name)), "Area map names an unknown check");
    }
  }

  return config;
};

export const selectChecks = (checks: readonly Check[], changed: readonly string[]) => checks.filter(check => check.paths === undefined || check.paths.some(prefix => changed.some(file => file.startsWith(prefix))));
