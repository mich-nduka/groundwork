// Profile resolution: manifests, dependencies, incompatibilities, ownership,
// composition and determinism — exercised through the real commands.

import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { editJson, groundwork, newProject, python, readJson, snapshot, TEMPLATE, tempDir, templateCopy } from "./helpers";

describe("manifests", () => {
  test("the four profiles and core load from their manifests", () => {
    const result = groundwork(["profiles", "--json"], TEMPLATE);
    expect(result.status).toBe(0);
    const ids = JSON.parse(result.stdout).map((p: { id: string }) => p.id);
    expect(ids).toEqual(["core", "ai-systems", "application", "backend-api", "web"]);
  });

  test("profile details come from profile.json", () => {
    const manifest = readJson(join(TEMPLATE, "profiles/web/profile.json"));
    const result = groundwork(["profiles", "web"], TEMPLATE);
    expect(result.status).toBe(0);
    for (const doc of manifest.documents) expect(result.stdout).toContain(doc.path);
    for (const check of manifest.checks) expect(result.stdout).toContain(check.name);
    expect(result.stdout).toContain(manifest.use_when[0].slice(0, 40));
  });

  test("an unknown profile name in `profiles` fails", () => {
    const result = groundwork(["profiles", "mobile"], TEMPLATE);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown profile 'mobile'");
  });

  test("schema errors are reported, not ignored", () => {
    const template = templateCopy();
    editJson(join(template, "profiles/web/profile.json"), (d) => {
      d.colour = "red";
      delete d.documents[4].when;
    });
    const result = python(template, "check_docs.py", []);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("unknown field 'colour'");
    expect(result.stdout).toContain("an optional document needs a 'when'");
  });

  test("a second owner for a document is rejected", () => {
    const template = templateCopy();
    mkdirSync(join(template, "profiles/web/templates/docs/design"), { recursive: true });
    copyFileSync(
      join(template, "profiles/core/templates/docs/design/DESIGN.md"),
      join(template, "profiles/web/templates/docs/design/DESIGN.md"),
    );
    const result = python(template, "groundwork.py", ["list"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("docs/design/DESIGN.md: owned by both the core and web profiles");
  });
});

describe("selection", () => {
  test("AI Systems alone is rejected (it requires another profile)", () => {
    const parent = tempDir();
    const result = groundwork(["create", "x", "--profiles", "ai-systems", "--yes"], parent);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ai-systems profile requires one of web, application, backend-api");
    expect(readdirSync(parent)).toEqual([]);
  });

  test("unknown and duplicate profiles are rejected", () => {
    const project = newProject("none");
    const result = groundwork(["init", "web", "web", "mobile"], project);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("profile 'web' is listed twice");
    expect(result.stdout).toContain("unknown profile 'mobile'");
  });

  test("declared incompatibilities are enforced", () => {
    const template = templateCopy();
    editJson(join(template, "profiles/web/profile.json"), (d) => (d.incompatible_with = ["application"]));
    const result = python(template, "groundwork.py", ["init", "web", "application", "--dry-run"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("the application and web profiles are declared incompatible");
  });

  test("a new profile works without any code change", () => {
    const template = templateCopy();
    const dir = join(template, "profiles/data-pipeline");
    mkdirSync(join(dir, "templates/docs/data-pipeline"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Data Pipeline Profile\n");
    writeFileSync(join(dir, "templates/docs/data-pipeline/LINEAGE.md"), "# Lineage\n");
    writeFileSync(
      join(dir, "profile.json"),
      JSON.stringify({
        schema: 1,
        id: "data-pipeline",
        name: "Data Pipeline",
        purpose: "Batch and streaming data pipelines.",
        use_when: ["The system moves and transforms data on a schedule."],
        not_when: [],
        requires: [],
        incompatible_with: [],
        documents: [{ path: "docs/data-pipeline/LINEAGE.md", required: true }],
        checks: [{ name: "Data quality", what: "Row counts and schemas are checked on every run." }],
      }),
    );
    const result = python(template, "groundwork.py", ["init", "data-pipeline", "--dry-run"]);
    expect(result.stdout).toContain("docs/data-pipeline/LINEAGE.md");
    expect(result.stdout).toContain("Data quality (data-pipeline profile)");
    expect(result.status).toBe(0);
  });
});

describe("composition", () => {
  test("shared documents are created once, and checks are merged by name", () => {
    const project = newProject("web,application");
    const agents = snapshot(project)["AGENTS.md"]!;
    expect(agents.match(/\| Accessibility \(/g)?.length).toBe(1);
    const manifest = readJson(join(project, "scaffold-manifest.json"));
    expect(manifest.files.filter((f: string) => f === "docs/design/DESIGN.md").length).toBe(1);
  });

  test("profile order never changes the result", () => {
    const a = snapshot(newProject("backend-api,ai-systems,application"));
    const b = snapshot(newProject("application,backend-api,ai-systems"));
    // generatedAt and hashes are identical too: same day, same content.
    expect(a).toEqual(b);
    expect(a["PROJECT.md"]).toContain("- Profiles: ai-systems, application, backend-api");
  });

  test("required documents are the union of core and every active profile", () => {
    const project = newProject("ai-systems,web");
    const plan = JSON.parse(python(project, "groundwork.py", ["init", "ai-systems", "web", "--dry-run", "--json"]).stdout);
    const required = new Set<string>();
    for (const id of ["core", "ai-systems", "web"]) {
      for (const doc of readJson(join(project, `profiles/${id}/profile.json`)).documents) {
        if (doc.required) required.add(doc.path);
      }
    }
    expect(new Set(plan.documents.map((d: { path: string }) => d.path))).toEqual(required);
    expect(plan.documents.every((d: { exists: boolean }) => d.exists)).toBe(true);
  });
});
