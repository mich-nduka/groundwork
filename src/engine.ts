// Bridge to the Groundwork engine: the Python scripts that ship inside every
// project (scripts/groundwork.py and scripts/check_docs.py). All profile
// rules, generation and validation live there, so the CLI and the plain
// Python workflow always behave the same. This module finds Python, runs
// those scripts, and works out which project a command applies to.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TEMPLATE_ROOT = join(PACKAGE_ROOT, "template");
export const VERSION: string = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;

/** An error shown to the user as-is, with the exit code to use. */
export class GroundworkError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

// --- Python -------------------------------------------------------------------

const MIN_PYTHON: readonly [number, number] = [3, 9];

interface Python {
  command: string;
  args: string[];
  version: string;
}

let cachedPython: Python | undefined;

/** The first Python 3.9+ found: $GROUNDWORK_PYTHON, python3, python, or (Windows) py -3. */
export function findPython(): Python {
  if (cachedPython) return cachedPython;
  const fromEnv = process.env.GROUNDWORK_PYTHON;
  const candidates: [string, string[]][] = fromEnv
    ? [[fromEnv, []]]
    : [["python3", []], ["python", []], ...(process.platform === "win32" ? [["py", ["-3"]] as [string, string[]]] : [])];
  const tried: string[] = [];
  for (const [command, args] of candidates) {
    const probe = spawnSync(command, [...args, "-c", "import sys; print('%d.%d' % sys.version_info[:2])"], {
      encoding: "utf8",
    });
    if (probe.error || probe.status !== 0) {
      tried.push(`${[command, ...args].join(" ")} (not found)`);
      continue;
    }
    const version = probe.stdout.trim();
    const [major = 0, minor = 0] = version.split(".").map(Number);
    if (major > MIN_PYTHON[0] || (major === MIN_PYTHON[0] && minor >= MIN_PYTHON[1])) {
      cachedPython = { command, args, version };
      return cachedPython;
    }
    tried.push(`${command} (Python ${version} is too old)`);
  }
  throw new GroundworkError(
    [
      `Groundwork needs Python ${MIN_PYTHON.join(".")} or newer, and none was found.`,
      "Its checks are plain Python scripts that ship inside every project, so any project can be checked in CI without Node.",
      `Tried: ${tried.join(", ")}.`,
      "Install Python from https://www.python.org/downloads/ or your package manager,",
      "or set GROUNDWORK_PYTHON to the path of a Python 3 executable.",
    ].join("\n"),
  );
}

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type Script = "groundwork.py" | "check_docs.py";

/** Run one of a project's scripts. "inherit" streams its output straight to the user. */
export function runScript(root: string, script: Script, args: string[], mode: "inherit" | "capture"): RunResult {
  const python = findPython();
  const result = spawnSync(python.command, [...python.args, "-I", join(root, "scripts", script), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: mode === "inherit" ? "inherit" : "pipe",
  });
  if (result.error) throw new GroundworkError(`Could not run ${script}: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export interface EngineResult {
  ok: boolean;
  errors?: string[];
}

/** Run groundwork.py with --json and parse its single JSON object. */
export function runEngine<T extends EngineResult>(root: string, args: string[]): T {
  const result = runScript(root, "groundwork.py", [...args, "--json"], "capture");
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    const detail = (result.stderr || result.stdout).trim();
    throw new GroundworkError(`groundwork.py ${args[0]} failed unexpectedly:\n${detail}`);
  }
}

// --- Engine data shapes (see scripts/groundwork.py) ---------------------------

export interface ProfileDocument {
  path: string;
  required: boolean;
  when?: string;
}

export interface Profile {
  id: string;
  name: string;
  purpose: string;
  use_when?: string[];
  not_when?: string[];
  requires?: (string | string[])[];
  incompatible_with?: string[];
  documents: ProfileDocument[];
  checks?: { name: string; what: string }[];
  readme: string;
}

export interface ProfileList extends EngineResult {
  groundworkVersion: string;
  profiles: Profile[];
}

export interface InitPlan extends EngineResult {
  profiles: string[];
  documents: { path: string; owner: string; requiredBy: string[]; action: "create" | "keep" }[];
  checks: { profile: string; name: string; what: string; action: "add-row" | "present" }[];
  optional: { path: string; owner: string; when: string }[];
}

export interface NewResult extends EngineResult {
  dryRun: boolean;
  destination: string;
  name: string;
  groundworkVersion: string;
  files: number;
  init: InitPlan;
}

// --- Projects -----------------------------------------------------------------

export interface Project {
  root: string;
  /** Has scripts/groundwork.py (Groundwork 3.0+); 2.x projects only have the checker. */
  hasEngine: boolean;
  /** Its groundwork.py supports --json and `config` (Groundwork 3.1+). */
  hasJsonEngine: boolean;
  /** This is the template bundled with the CLI, not a user's project. */
  isBundledTemplate: boolean;
}

function same(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

/**
 * A folder is a Groundwork project only when it has the checker script and
 * either a .groundwork/config.json or a scaffold-manifest.json named
 * "Groundwork" — never just because some files look familiar.
 */
export function isProject(dir: string): boolean {
  if (!existsSync(join(dir, "scripts", "check_docs.py"))) return false;
  if (existsSync(join(dir, ".groundwork", "config.json"))) return true;
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "scaffold-manifest.json"), "utf8"));
    return manifest?.name === "Groundwork" && Array.isArray(manifest.files);
  } catch {
    return false;
  }
}

/** The nearest Groundwork project at or above `start`, or null. */
export function findProject(start = process.cwd()): Project | null {
  let dir = resolve(start);
  for (;;) {
    if (isProject(dir)) {
      const engine = join(dir, "scripts", "groundwork.py");
      return {
        root: dir,
        hasEngine: existsSync(engine),
        hasJsonEngine: existsSync(engine) && readFileSync(engine, "utf8").includes('"--json"'),
        isBundledTemplate: same(dir, TEMPLATE_ROOT),
      };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
