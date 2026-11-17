// Generating projects: templates, placeholders, config, safety, dry runs
// and recovery from failures.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  createGroundwork,
  editJson,
  groundwork,
  newProject,
  python,
  readJson,
  snapshot,
  TEMPLATE,
  tempDir,
  templateCopy,
} from "./helpers";

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("new projects", () => {
  test("contain every template file, with placeholders filled in", () => {
    const parent = tempDir();
    const result = createGroundwork(
      ["parkmate", "--profiles", "none", "--description", "Parking management platform", "--yes"],
      parent,
    );
    expect(result.status).toBe(0);
    const project = join(parent, "parkmate");
    for (const file of readJson(join(TEMPLATE, "scaffold-manifest.json")).files) {
      expect(existsSync(join(project, file))).toBe(true);
    }
    const doc = readFileSync(join(project, "PROJECT.md"), "utf8");
    expect(doc).toContain("- Name: parkmate\n- Description: Parking management platform\n");
    expect(doc).toMatch(/- Last updated: \d{4}-\d{2}-\d{2}\n/);
    expect(doc).toContain("- Profiles: none");
    expect(JSON.stringify(snapshot(project))).not.toContain("{{PROJECT_");
  });

  test("non-Markdown files are copied byte for byte, with permissions", () => {
    const project = newProject("web");
    for (const file of ["scripts/check_docs.py", "profiles/web/profile.json", ".github/workflows/docs-check.yml", ".gitignore"]) {
      expect(sha(join(project, file))).toBe(sha(join(TEMPLATE, file)));
    }
    expect(statSync(join(project, "scripts/groundwork.py")).mode).toBe(statSync(join(TEMPLATE, "scripts/groundwork.py")).mode);
  });

  test("pass the strictest documentation check for every profile combination", () => {
    for (const profiles of ["none", "web", "application", "backend-api", "application,backend-api", "ai-systems,web", "ai-systems,application,backend-api"]) {
      const project = newProject(profiles);
      const result = python(project, "check_docs.py", ["--strict", "--strict-coverage"]);
      expect(`${profiles}: ${result.stdout}`).toContain("OK:");
      expect(result.status).toBe(0);
    }
  });

  test("record Groundwork's identity and every generated file in .groundwork/config.json", () => {
    const project = newProject("application,backend-api");
    const config = readJson(join(project, ".groundwork/config.json"));
    expect(Object.keys(config).sort()).toEqual(["files", "generatedAt", "groundworkVersion", "schema"]);
    expect(config.schema).toBe(1);
    expect(config.groundworkVersion).toBe(readJson(join(TEMPLATE, "scaffold-manifest.json")).version);
    expect(config.files["docs/design/DESIGN.md"]).toBe(sha(join(project, "docs/design/DESIGN.md")));
    // Files init edited after copying (PROJECT.md, AGENTS.md) are recorded as they are now.
    for (const [path, hash] of Object.entries(config.files)) expect(sha(join(project, path))).toBe(hash as string);
  });
});

describe("file safety", () => {
  test("never writes into an existing, non-empty folder", () => {
    const parent = tempDir();
    mkdirSync(join(parent, "app"));
    writeFileSync(join(parent, "app", "notes.txt"), "mine");
    const result = createGroundwork(["app", "--profiles", "web", "--yes"], parent);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("already exists and is not empty");
    expect(readdirSync(join(parent, "app"))).toEqual(["notes.txt"]);
  });

  test("an empty existing folder is fine", () => {
    const parent = tempDir();
    mkdirSync(join(parent, "app"));
    expect(createGroundwork(["app", "--profiles", "web", "--yes"], parent).status).toBe(0);
  });

  test("init and add never overwrite: edited documents survive re-running", () => {
    const project = newProject("web");
    writeFileSync(join(project, "docs/web/SEO.md"), "# My SEO notes\n");
    const before = snapshot(project);
    expect(groundwork(["init", "web"], project).status).toBe(0);
    expect(snapshot(project)).toEqual(before);
    expect(groundwork(["init", "web", "application"], project).status).toBe(0);
    expect(readFileSync(join(project, "docs/web/SEO.md"), "utf8")).toBe("# My SEO notes\n");
  });

  test("dropping a profile deletes nothing, and the checker warns", () => {
    const project = newProject("web");
    expect(groundwork(["init", "none"], project).status).toBe(0);
    expect(existsSync(join(project, "docs/web/SEO.md"))).toBe(true);
    const check = groundwork(["validate", "--strict"], project);
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("docs/web/SEO.md: belongs to the web profile");
  });

  test("a failure part-way leaves nothing behind", () => {
    // Core's BUILD.md is missing from this template, so init fails inside the
    // staging folder after every file was copied.
    const template = templateCopy();
    rmSync(join(template, "BUILD.md"));
    editJson(join(template, "scaffold-manifest.json"), (m) => {
      m.files = m.files.filter((f: string) => f !== "BUILD.md");
      m.file_count = m.files.length;
    });
    const parent = tempDir();
    const result = python(template, "groundwork.py", ["new", join(parent, "app"), "--profiles", "web"], parent);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("BUILD.md: required by core but missing");
    expect(readdirSync(parent)).toEqual([]);
  });

  test("refuses to create a project inside the bundled template", () => {
    const result = python(TEMPLATE, "groundwork.py", ["new", join(TEMPLATE, "docs", "x")]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("is inside this copy of Groundwork");
  });

  test("modifying commands refuse to run on the bundled template", () => {
    const result = groundwork(["init", "web"], TEMPLATE);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bundled with Groundwork itself");
  });
});

describe("dry runs", () => {
  test("create --dry-run writes nothing and shows the plan", () => {
    const parent = tempDir();
    const result = createGroundwork(["app", "--profiles", "ai-systems,application", "--dry-run", "--yes"], parent);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("+ docs/ai-systems/SAFETY.md");
    expect(result.stdout).toContain("AI evaluation (ai-systems)");
    expect(readdirSync(parent)).toEqual([]);
  });

  test("init and add --dry-run change nothing", () => {
    const project = newProject("ai-systems,backend-api");
    const before = snapshot(project);
    expect(groundwork(["init", "ai-systems", "backend-api", "web", "--dry-run"], project).stdout).toContain(
      "Would create from templates:",
    );
    expect(groundwork(["add", "docs/ai-systems/RETRIEVAL.md", "--dry-run"], project).stdout).toContain("Would create");
    expect(snapshot(project)).toEqual(before);
  });
});

describe("optional documents and managed files", () => {
  test("add creates an optional document and records it", () => {
    const project = newProject("ai-systems,backend-api");
    expect(groundwork(["add", "docs/ai-systems/RETRIEVAL.md"], project).status).toBe(0);
    const config = readJson(join(project, ".groundwork/config.json"));
    expect(config.files["docs/ai-systems/RETRIEVAL.md"]).toBe(sha(join(project, "docs/ai-systems/RETRIEVAL.md")));
    expect(readJson(join(project, "scaffold-manifest.json")).files).toContain("docs/ai-systems/RETRIEVAL.md");
    expect(groundwork(["validate", "--strict", "--strict-coverage"], project).status).toBe(0);
  });

  test("add refuses documents of inactive profiles", () => {
    const project = newProject("web");
    const result = groundwork(["add", "docs/ai-systems/RETRIEVAL.md"], project);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("belongs to the ai-systems profile");
  });

  test("config separates unchanged, changed and deleted generated files", () => {
    const project = newProject("web");
    writeFileSync(join(project, "docs/web/SEO.md"), "changed\n");
    rmSync(join(project, "docs/examples/EXAMPLE.md"));
    const data = JSON.parse(groundwork(["config", "--json"], project).stdout);
    expect(data.name).toBe("app");
    expect(data.profiles).toEqual(["web"]);
    expect(data.config.files.modified).toEqual(["docs/web/SEO.md"]);
    expect(data.config.files.missing).toEqual(["docs/examples/EXAMPLE.md"]);
  });

  test("a file the project changed stays marked as changed after init edits it", () => {
    const project = newProject("web");
    const agents = join(project, "AGENTS.md");
    writeFileSync(agents, readFileSync(agents, "utf8") + "\nOur own rule.\n");
    expect(groundwork(["init", "application", "web"], project).status).toBe(0);
    const data = JSON.parse(groundwork(["config", "--json"], project).stdout);
    expect(data.config.files.modified).toContain("AGENTS.md");
    expect(data.config.files.modified).not.toContain("PROJECT.md");
  });
});
