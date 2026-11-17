// The real npm artifact: pack it, check its contents, install it somewhere
// unrelated to this repository, and run both executables from the install.
// Needs network access for the package's one dependency.

import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJson, REPO, TEMPLATE, tempDir } from "./helpers";

function sh(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

let tarball = "";
let contents: string[] = [];
let installed = "";

beforeAll(() => {
  const out = tempDir();
  const pack = sh("npm", ["pack", "--pack-destination", out, "--silent"], REPO);
  if (pack.status !== 0) throw new Error(pack.out);
  tarball = join(out, readdirSync(out).find((f) => f.endsWith(".tgz"))!);
  contents = sh("tar", ["tzf", tarball], out).out.trim().split("\n").map((f) => f.replace(/^package\//, ""));
  installed = tempDir();
  const install = sh("npm", ["install", "--no-audit", "--no-fund", "--silent", "--prefix", installed, tarball], installed);
  if (install.status !== 0) throw new Error(install.out);
}, 180_000);

describe("packed artifact", () => {
  test("contains the CLI and every template file, and nothing from development", () => {
    for (const file of readJson(join(TEMPLATE, "scaffold-manifest.json")).files as string[]) {
      const packed = file === ".gitignore" ? "template/_gitignore" : `template/${file}`;
      expect(contents).toContain(packed);
    }
    for (const file of ["dist/create.js", "dist/groundwork.js", "package.json", "CHANGELOG.md", "MIGRATION.md"]) {
      expect(contents).toContain(file);
    }
    expect(contents.some((f) => /^(src|test|node_modules)\/|__pycache__|\.tgz$/.test(f))).toBe(false);
  });

  test("the repository is left as it was (no packing leftovers)", () => {
    expect(readdirSync(join(REPO, "template"))).not.toContain("_gitignore");
  });

  test("installed executables create a project that passes the strictest check", () => {
    const bin = join(installed, "node_modules", ".bin");
    const work = tempDir();
    const created = sh(join(bin, "create-groundwork"), ["shop", "--profiles", "application,backend-api", "--yes"], work);
    expect(created.out).toContain("Your project is ready.");
    expect(created.status).toBe(0);
    const project = join(work, "shop");
    expect(readFileSync(join(project, ".gitignore"), "utf8")).toBe(readFileSync(join(TEMPLATE, ".gitignore"), "utf8"));
    expect(statSync(join(project, ".groundwork/config.json")).isFile()).toBe(true);
    const check = sh(join(bin, "groundwork"), ["validate", "--strict", "--strict-coverage"], project);
    expect(check.status).toBe(0);
    expect(sh(join(bin, "groundwork"), ["profiles", "web"], project).status).toBe(0);
    expect(sh(join(bin, "groundwork"), ["add", "docs/backend-api/DATA.md"], project).status).toBe(0);
    expect(sh(join(bin, "groundwork"), ["config"], project).out).toContain("Profiles: application, backend-api");
  });

  test("npm exec (what npx runs) works from the tarball", () => {
    const work = tempDir();
    const result = sh("npm", ["exec", "--yes", `--package=${tarball}`, "--", "create-groundwork", "site", "--profiles", "web", "--yes"], work);
    expect(result.status).toBe(0);
    expect(result.out).toContain("Your project is ready.");
  }, 120_000);
});
