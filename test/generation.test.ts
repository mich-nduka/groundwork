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
  engine,
  readJson,
  snapshot,
  TEMPLATE,
  tempDir,
  templateCopy,
} from "./helpers";

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

// What a new project shows outside Groundwork's own .groundwork/ folder.
const ENTRY_FILES = [".gitignore", "AGENTS.md", "GROUNDWORK.md", "PROJECT.md", "README.md"];
const visible = (project: string) => readdirSync(project).filter((name) => name !== ".groundwork").sort();

describe("lean projects", () => {
  test("a new project has only its entry files, and no profiles until discovery", () => {
    const parent = tempDir();
    const result = createGroundwork(["app", "--description", "Parking management platform", "--yes"], parent);
    expect(result.status).toBe(0);
    const project = join(parent, "app");
    expect(visible(project)).toEqual(ENTRY_FILES);
    expect(readFileSync(join(project, "PROJECT.md"), "utf8")).toContain("- Profiles: [not chosen yet]");
    expect(readFileSync(join(project, "README.md"), "utf8")).toStartWith("# app\n\nParking management platform\n");
    expect(engine(project, ["validate", "--strict", "--strict-coverage"]).status).toBe(0);
  });

  test("init records profiles and checks, but writes no documents", () => {
    const project = newProject("application,backend-api");
    expect(visible(project)).toEqual(ENTRY_FILES);
    expect(readFileSync(join(project, "PROJECT.md"), "utf8")).toContain("- Profiles: application, backend-api");
    expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toContain("| API compatibility (backend-api profile) |");
    const plan = JSON.parse(engine(project, ["init", "application", "backend-api", "--dry-run", "--json"]).stdout);
    expect(plan.documents.every((d: { path: string; action: string }) => (["PROJECT.md", "AGENTS.md"].includes(d.path) ? d.action === "keep" : d.action === "pending"))).toBe(true);
  });

  test("a document is created when there is something to write, and only then", () => {
    const project = newProject("content-site");
    const status = JSON.parse(groundwork(["status", "--json"], project).stdout);
    const prd = status.documents.find((d: { path: string }) => d.path === "docs/product/PRD.md");
    expect(prd.status).toBe("pending");
    expect(prd.sections[0].questions.length).toBeGreaterThan(0);
    expect(groundwork(["add", "docs/product/PRD.md"], project).status).toBe(0);
    expect(readFileSync(join(project, "docs/product/PRD.md"), "utf8")).toBe(
      readFileSync(join(TEMPLATE, ".groundwork/profiles/core/templates/docs/product/PRD.md"), "utf8"),
    );
    expect(readdirSync(join(project, "docs"))).toEqual(["product"]);
  });
});

describe("new projects", () => {
  test("contain every template file, with placeholders filled in", () => {
    const parent = tempDir();
    const result = createGroundwork(
      ["parkmate", "--profiles", "none", "--description", "Parking management platform", "--yes"],
      parent,
    );
    expect(result.status).toBe(0);
    const project = join(parent, "parkmate");
    for (const file of readJson(join(TEMPLATE, ".groundwork/manifest.json")).files) {
      expect(existsSync(join(project, file))).toBe(true);
    }
    const doc = readFileSync(join(project, "PROJECT.md"), "utf8");
    expect(doc).toContain("- Name: parkmate\n- Description: Parking management platform\n");
    expect(doc).toMatch(/- Last updated: \d{4}-\d{2}-\d{2}\n/);
    expect(doc).toContain("- Profiles: none");
    expect(readFileSync(join(project, "README.md"), "utf8")).toStartWith("# parkmate\n");
    expect(JSON.stringify(snapshot(project))).not.toContain("{{PROJECT_");
  });

  test("non-Markdown files are copied byte for byte, with permissions", () => {
    const project = newProject("content-site");
    for (const file of [".groundwork/scripts/checks.mjs", ".groundwork/profiles/content-site/profile.json", ".groundwork/profiles/core/templates/.github/workflows/docs-check.yml", ".gitignore"]) {
      expect(sha(join(project, file))).toBe(sha(join(TEMPLATE, file)));
    }
    const script = ".groundwork/scripts/groundwork.mjs";
    expect(statSync(join(project, script)).mode).toBe(statSync(join(TEMPLATE, script)).mode);
    expect(statSync(join(project, script)).mode & 0o111).not.toBe(0);
  });

  test("pass the strictest documentation check for every profile combination", () => {
    for (const profiles of ["none", "content-site", "application", "backend-api", "application,backend-api", "ai-systems,content-site", "ai-systems,application,backend-api"]) {
      const project = newProject(profiles);
      const result = engine(project, ["validate", "--strict", "--strict-coverage"]);
      expect(`${profiles}: ${result.stdout}`).toContain("OK:");
      expect(result.status).toBe(0);
    }
  }, 60_000);

  test("record Groundwork's identity and every generated file in .groundwork/config.json", () => {
    const project = newProject("application,backend-api");
    const config = readJson(join(project, ".groundwork/config.json"));
    const current = () => readJson(join(project, ".groundwork/config.json"));
    expect(Object.keys(config).sort()).toEqual(["files", "generatedAt", "groundworkVersion", "schema", "sections"]);
    // A fingerprint of every section as generated, for every onboarded document.
    expect(Object.keys(config.sections["PROJECT.md"])).toEqual(["basics", "constraints", "profiles"]);
    expect(config.schema).toBe(1);
    expect(config.groundworkVersion).toBe(readJson(join(TEMPLATE, ".groundwork/manifest.json")).version);
    expect(config.files["docs/design/DESIGN.md"]).toBeUndefined();
    expect(groundwork(["add", "docs/design/DESIGN.md"], project).status).toBe(0);
    expect(readJson(join(project, ".groundwork/config.json")).files["docs/design/DESIGN.md"]).toBe(
      sha(join(project, "docs/design/DESIGN.md")),
    );
    // Files init edited after copying (PROJECT.md, AGENTS.md) are recorded as they are now.
    for (const [path, hash] of Object.entries(current().files)) expect(sha(join(project, path))).toBe(hash as string);
  });
});

describe("file safety", () => {
  test("never writes into an existing, non-empty folder", () => {
    const parent = tempDir();
    mkdirSync(join(parent, "app"));
    writeFileSync(join(parent, "app", "notes.txt"), "mine");
    const result = createGroundwork(["app", "--profiles", "content-site", "--yes"], parent);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("already exists and is not empty");
    expect(readdirSync(join(parent, "app"))).toEqual(["notes.txt"]);
  });

  test("an empty existing folder is fine", () => {
    const parent = tempDir();
    mkdirSync(join(parent, "app"));
    expect(createGroundwork(["app", "--profiles", "content-site", "--yes"], parent).status).toBe(0);
  });

  test("init and add never overwrite: edited documents survive re-running", () => {
    const project = newProject("content-site");
    expect(groundwork(["add", "docs/content-site/SEO.md"], project).status).toBe(0);
    writeFileSync(join(project, "docs/content-site/SEO.md"), "# My SEO notes\n");
    const before = snapshot(project);
    expect(groundwork(["init", "content-site"], project).status).toBe(0);
    expect(snapshot(project)).toEqual(before);
    expect(groundwork(["init", "content-site", "application"], project).status).toBe(0);
    expect(groundwork(["add", "docs/content-site/SEO.md"], project).stdout).toContain("already exists");
    expect(readFileSync(join(project, "docs/content-site/SEO.md"), "utf8")).toBe("# My SEO notes\n");
  });

  test("dropping a profile deletes nothing, and the checker warns", () => {
    const project = newProject("content-site");
    expect(groundwork(["add", "docs/content-site/SEO.md"], project).status).toBe(0);
    expect(groundwork(["init", "none"], project).status).toBe(0);
    expect(existsSync(join(project, "docs/content-site/SEO.md"))).toBe(true);
    const check = groundwork(["validate", "--strict"], project);
    expect(check.status).toBe(1);
    expect(check.stdout).toContain("docs/content-site/SEO.md: belongs to the content-site profile");
  });

  test("a failure part-way leaves nothing behind", () => {
    // Core's AGENTS.md (which has no template) is missing from this
    // template, so init fails inside the staging folder after every file
    // was copied.
    const template = templateCopy();
    rmSync(join(template, "AGENTS.md"));
    editJson(join(template, ".groundwork/manifest.json"), (m) => {
      m.files = m.files.filter((f: string) => f !== "AGENTS.md");
    });
    const parent = tempDir();
    const result = engine(template, ["new", join(parent, "app"), "--profiles", "content-site"], parent);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("AGENTS.md: required by core but missing");
    expect(readdirSync(parent)).toEqual([]);
  });

  test("refuses to create a project inside the bundled template", () => {
    const result = engine(TEMPLATE, ["new", join(TEMPLATE, "x")]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("is inside this copy of Groundwork");
  });

  test("modifying commands refuse to run on the bundled template", () => {
    const result = groundwork(["init", "content-site"], TEMPLATE);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bundled with Groundwork itself");
  });
});

describe("dry runs", () => {
  test("create --dry-run writes nothing and shows the plan", () => {
    const parent = tempDir();
    const result = createGroundwork(["app", "--profiles", "ai-systems,application", "--dry-run", "--yes"], parent);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("+ PROJECT.md");
    expect(result.stdout).toContain("Profiles:     Core (always), AI Systems, Application");
    expect(readdirSync(parent)).toEqual([]);
  });

  test("init and add --dry-run change nothing", () => {
    const project = newProject("ai-systems,backend-api");
    const before = snapshot(project);
    expect(groundwork(["init", "ai-systems", "backend-api", "content-site", "--dry-run"], project).stdout).toContain(
      "Documents still to write",
    );
    expect(groundwork(["add", "docs/ai-systems/RETRIEVAL.md", "--dry-run"], project).stdout).toContain("Would create");
    expect(snapshot(project)).toEqual(before);
  });
});

describe("optional documents and managed files", () => {
  test("add creates a document and records it", () => {
    const project = newProject("ai-systems,backend-api");
    expect(groundwork(["add", "docs/ai-systems/RETRIEVAL.md"], project).status).toBe(0);
    const config = readJson(join(project, ".groundwork/config.json"));
    expect(config.files["docs/ai-systems/RETRIEVAL.md"]).toBe(sha(join(project, "docs/ai-systems/RETRIEVAL.md")));
    expect(groundwork(["validate", "--strict", "--strict-coverage"], project).status).toBe(0);
  });

  test("add refuses documents of inactive profiles", () => {
    const project = newProject("content-site");
    const result = groundwork(["add", "docs/ai-systems/RETRIEVAL.md"], project);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("belongs to the ai-systems profile");
  });

  test("config separates unchanged, changed and deleted generated files", () => {
    const project = newProject("content-site");
    expect(groundwork(["add", "docs/content-site/SEO.md"], project).status).toBe(0);
    writeFileSync(join(project, "docs/content-site/SEO.md"), "changed\n");
    rmSync(join(project, "README.md"));
    const data = JSON.parse(groundwork(["config", "--json"], project).stdout);
    expect(data.name).toBe("app");
    expect(data.profiles).toEqual(["content-site"]);
    expect(data.config.files.modified).toEqual(["docs/content-site/SEO.md"]);
    expect(data.config.files.missing).toEqual(["README.md"]);
  });

  test("a file the project changed stays marked as changed after init edits it", () => {
    const project = newProject("content-site");
    const agents = join(project, "AGENTS.md");
    writeFileSync(agents, readFileSync(agents, "utf8") + "\nOur own rule.\n");
    expect(groundwork(["init", "application", "content-site"], project).status).toBe(0);
    const data = JSON.parse(groundwork(["config", "--json"], project).stdout);
    expect(data.config.files.modified).toContain("AGENTS.md");
    expect(data.config.files.modified).not.toContain("PROJECT.md");
  });
});
