// Bridge to the Groundwork engine: the Node.js scripts that ship inside
// every project (.groundwork/scripts/groundwork.mjs, with checks.mjs and
// onboarding.mjs). All profile rules, generation and validation live there,
// so the CLI and running the project's own engine directly always behave the
// same. This module runs that engine and works out which project a command
// applies to.

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

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

/** A project's own engine, relative to its root. */
export const ENGINE = ".groundwork/scripts/groundwork.mjs";

/** Run the project's own engine. "inherit" streams its output straight to the user. */
export function runScript(root: string, args: string[], mode: "inherit" | "capture"): RunResult {
  const result = spawnSync(process.execPath, [join(root, ENGINE), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: mode === "inherit" ? "inherit" : "pipe",
  });
  if (result.error) throw new GroundworkError(`Could not run ${ENGINE}: ${result.error.message}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export interface EngineResult {
  ok: boolean;
  errors?: string[];
}

/** Run the engine with --json and parse its single JSON object. */
export function runEngine<T extends EngineResult>(root: string, args: string[]): T {
  const result = runScript(root, [...args, "--json"], "capture");
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    const detail = (result.stderr || result.stdout).trim();
    throw new GroundworkError(`${ENGINE} ${args[0]} failed unexpectedly:\n${detail}`);
  }
}

// --- Engine data shapes (see .groundwork/scripts/groundwork.mjs) ---------------------------

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
  /** "pending": written later, once there is something to put in it. */
  documents: { path: string; owner: string; requiredBy: string[]; action: "pending" | "keep" }[];
  checks: { profile: string; name: string; what: string; action: "add-row" | "present" }[];
  optional: { path: string; owner: string; when: string }[];
}

export interface NewResult extends EngineResult {
  dryRun: boolean;
  destination: string;
  name: string;
  groundworkVersion: string;
  files: number;
  /** The files a new project shows outside .groundwork/. */
  visibleFiles: string[];
  agents: string[];
  /** Null when no profiles were given: they're chosen after discovery. */
  init: InitPlan | null;
}

// --- Projects -----------------------------------------------------------------

export interface Project {
  root: string;
  /** Made before Groundwork 4.0: its engine is Python scripts, which this CLI no longer runs. */
  legacy: boolean;
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

function isGroundworkManifest(path: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    return manifest?.name === "Groundwork" && Array.isArray(manifest.files);
  } catch {
    return false;
  }
}

/**
 * A folder is a Groundwork project only when it has Groundwork's engine and
 * either a .groundwork/config.json or a Groundwork manifest — never just
 * because some files look familiar. 4.0+ keeps everything in .groundwork/
 * with a Node.js engine; earlier versions had Python scripts (in scripts/,
 * with scaffold-manifest.json at the top, before 4.0's .groundwork/ layout).
 */
function projectKind(dir: string): "current" | "legacy" | null {
  const config = existsSync(join(dir, ".groundwork", "config.json"));
  const manifest = isGroundworkManifest(join(dir, ".groundwork", "manifest.json"));
  if (existsSync(join(dir, ENGINE))) return config || manifest ? "current" : null;
  const python =
    existsSync(join(dir, ".groundwork", "scripts", "check_docs.py")) || existsSync(join(dir, "scripts", "check_docs.py"));
  if (!python) return null;
  return config || manifest || isGroundworkManifest(join(dir, "scaffold-manifest.json")) ? "legacy" : null;
}

export function isProject(dir: string): boolean {
  return projectKind(dir) !== null;
}

/** The nearest Groundwork project at or above `start`, or null. */
export function findProject(start = process.cwd()): Project | null {
  let dir = resolve(start);
  for (;;) {
    const kind = projectKind(dir);
    if (kind) return { root: dir, legacy: kind === "legacy", isBundledTemplate: same(dir, TEMPLATE_ROOT) };
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The message for a project whose engine is Groundwork's old Python scripts. */
export function legacyMessage(root: string): string {
  const script = existsSync(join(root, ".groundwork", "scripts", "check_docs.py")) ? ".groundwork/scripts" : "scripts";
  return [
    `${root} was made with Groundwork before 4.0, whose engine is Python scripts; this version of the CLI runs Groundwork's Node.js engine.`,
    `Run that project's own scripts directly (python3 ${script}/groundwork.py <command>, python3 ${script}/check_docs.py),`,
    "or upgrade it to Groundwork 4 as MIGRATION.md in the create-groundwork package describes.",
  ].join("\n");
}
