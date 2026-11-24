// Profile resolution: manifests, dependencies, incompatibilities, ownership,
// composition and determinism — exercised through the real commands.

import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { editJson, groundwork, newProject, engine, readJson, snapshot, TEMPLATE, tempDir, templateCopy } from "./helpers";

describe("manifests", () => {
  test("the four profiles and core load from their manifests", () => {
    const result = groundwork(["profiles", "--json"], TEMPLATE);
    expect(result.status).toBe(0);
    const ids = JSON.parse(result.stdout).map((p: { id: string }) => p.id);
    expect(ids).toEqual(["core", "ai-systems", "application", "backend-api", "content-site"]);
  });

  test("profile details come from profile.json", () => {
    const manifest = readJson(join(TEMPLATE, ".groundwork/profiles/content-site/profile.json"));
    const result = groundwork(["profiles", "content-site"], TEMPLATE);
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
    editJson(join(template, ".groundwork/profiles/application/profile.json"), (d) => {
      d.colour = "red";
      delete d.documents.find((doc: any) => !doc.required).when;
    });
    const result = engine(template, ["validate"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("unknown field 'colour'");
    expect(result.stdout).toContain("an optional document needs a 'when'");
  });

  test("a second owner for a document is rejected", () => {
    const template = templateCopy();
    mkdirSync(join(template, ".groundwork/profiles/content-site/templates/docs/design"), { recursive: true });
    copyFileSync(
      join(template, ".groundwork/profiles/core/templates/docs/design/DESIGN.md"),
      join(template, ".groundwork/profiles/content-site/templates/docs/design/DESIGN.md"),
    );
    const result = engine(template, ["list"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("docs/design/DESIGN.md: owned by both the core and content-site profiles");
  });
});

describe("selection", () => {
  test("AI Systems alone is rejected (it requires another profile)", () => {
    const parent = tempDir();
    const result = groundwork(["create", "x", "--profiles", "ai-systems", "--yes"], parent);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ai-systems profile requires one of application, backend-api, content-site");
    expect(readdirSync(parent)).toEqual([]);
  });

  test("unknown and duplicate profiles are rejected", () => {
    const project = newProject("none");
    const result = groundwork(["init", "content-site", "content-site", "mobile"], project);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("profile 'content-site' is listed twice");
    expect(result.stdout).toContain("unknown profile 'mobile'");
  });

  test("the old web ID still selects the content-site profile", () => {
    const project = newProject("web");
    const projectFile = join(project, "PROJECT.md");
    expect(readFileSync(projectFile, "utf8")).toContain("- Profiles: content-site");
    expect(engine(project, ["init", "web", "ai-systems"]).status).toBe(0);
    expect(readFileSync(projectFile, "utf8")).toContain("- Profiles: ai-systems, content-site");
    // A PROJECT.md that still says web keeps working, with a hygiene warning.
    writeFileSync(projectFile, readFileSync(projectFile, "utf8").replace("- Profiles: ai-systems, content-site", "- Profiles: ai-systems, web"));
    const status = JSON.parse(engine(project, ["status", "--json"]).stdout);
    expect(status.active).toEqual(["core", "ai-systems", "content-site"]);
    const strict = engine(project, ["validate", "--strict"]);
    expect(strict.status).toBe(1);
    expect(strict.stdout).toContain("PROJECT.md: the web profile is now called content-site");
  });

  test("declared incompatibilities are enforced", () => {
    const template = templateCopy();
    editJson(join(template, ".groundwork/profiles/content-site/profile.json"), (d) => (d.incompatible_with = ["application"]));
    const result = engine(template, ["init", "content-site", "application", "--dry-run"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("the application and content-site profiles are declared incompatible");
  });

  test("a new profile works without any code change", () => {
    const template = templateCopy();
    const dir = join(template, ".groundwork/profiles/data-pipeline");
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
    const result = engine(template, ["init", "data-pipeline", "--dry-run"]);
    expect(result.stdout).toContain("docs/data-pipeline/LINEAGE.md");
    expect(result.stdout).toContain("Data quality (data-pipeline profile)");
    expect(result.status).toBe(0);
  });
});

describe("composition", () => {
  test("shared documents are listed once, and checks are merged by name", () => {
    const project = newProject("content-site,application");
    const agents = snapshot(project)["AGENTS.md"]!;
    expect(agents.match(/\| Accessibility \(/g)?.length).toBe(1);
    const plan = JSON.parse(engine(project, ["init", "content-site", "application", "--dry-run", "--json"]).stdout);
    expect(plan.documents.filter((d: { path: string }) => d.path === "docs/design/DESIGN.md").length).toBe(1);
  });

  test("profile order never changes the result", () => {
    const a = snapshot(newProject("backend-api,ai-systems,application"));
    const b = snapshot(newProject("application,backend-api,ai-systems"));
    // generatedAt and hashes are identical too: same day, same content.
    expect(a).toEqual(b);
    expect(a["PROJECT.md"]).toContain("- Profiles: ai-systems, application, backend-api");
  });

  test("required documents are the union of core and every active profile", () => {
    const project = newProject("ai-systems,content-site");
    const plan = JSON.parse(engine(project, ["init", "ai-systems", "content-site", "--dry-run", "--json"]).stdout);
    const required = new Set<string>();
    for (const id of ["core", "ai-systems", "content-site"]) {
      for (const doc of readJson(join(project, `.groundwork/profiles/${id}/profile.json`)).documents) {
        if (doc.required) required.add(doc.path);
      }
    }
    expect(new Set(plan.documents.map((d: { path: string }) => d.path))).toEqual(required);
    // Listed, not created: each is written when there is something to put in it.
    expect(plan.documents.every((d: { path: string; action: string }) => (["PROJECT.md", "AGENTS.md"].includes(d.path) ? d.action === "keep" : d.action === "pending"))).toBe(true);
  });
});
