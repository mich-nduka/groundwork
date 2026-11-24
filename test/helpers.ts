// Shared helpers: temporary folders, and running the built CLI and the
// Python scripts exactly as a user would.

import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll } from "bun:test";

export const REPO = resolve(import.meta.dir, "..");
export const TEMPLATE = join(REPO, "template");
const CREATE = join(REPO, "dist", "create.js");
const GROUNDWORK = join(REPO, "dist", "groundwork.js");

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A new empty temporary folder, removed after the test file finishes. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "groundwork-test-"));
  made.push(dir);
  return dir;
}

export interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], cwd: string, env: Record<string, string> = {}): Run {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

export const createGroundwork = (args: string[], cwd: string, env?: Record<string, string>) =>
  run("node", [CREATE, ...args], cwd, env);
export const groundwork = (args: string[], cwd: string, env?: Record<string, string>) =>
  run("node", [GROUNDWORK, ...args], cwd, env);
/** Run a project's own engine directly, as a user without the CLI would. */
export const engine = (root: string, args: string[], cwd = root) =>
  run("node", [join(root, ".groundwork", "scripts", "groundwork.mjs"), ...args], cwd);

/** Create a project non-interactively and return its folder. */
export function newProject(profiles: string, extra: string[] = []): string {
  const parent = tempDir();
  const result = createGroundwork(["app", "--profiles", profiles, "--yes", ...extra], parent);
  if (result.status !== 0) throw new Error(`create failed:\n${result.stdout}\n${result.stderr}`);
  return join(parent, "app");
}

/** Every file under `root` with its content, for comparing whole trees. */
export function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else out[relative(root, path)] = readFileSync(path, "utf8");
    }
  };
  walk(root);
  return out;
}

/** A private copy of the bundled template, for tests that break it on purpose. */
export function templateCopy(): string {
  const dir = join(tempDir(), "template");
  cpSync(TEMPLATE, dir, { recursive: true });
  return dir;
}

export function editJson(path: string, edit: (data: any) => void): void {
  const data = JSON.parse(readFileSync(path, "utf8"));
  edit(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}
