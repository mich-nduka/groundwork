// `groundwork validate` must give exactly the results of the project's own
// engine, in every mode, on the Groundwork template itself and on projects
// with errors and warnings.

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { groundwork, newProject, engine, TEMPLATE } from "./helpers";

const MODES = [[], ["--strict"], ["--strict-coverage"], ["--strict", "--strict-coverage"]];

function scenarios(): Record<string, string> {
  const warnings = newProject("content-site");
  groundwork(["add", "docs/content-site/SEO.md"], warnings);
  groundwork(["init", "none"], warnings); // leaves a content-site document behind: hygiene warnings

  const coverage = newProject("none");
  const spec = join(coverage, "docs/product/SPEC.md");
  const prd = join(coverage, "docs/product/PRD.md");
  mkdirSync(join(coverage, "docs/product"), { recursive: true });
  writeFileSync(prd, "# PRD\n\n| ID | What it does | Why users care | Priority |\n|---|---|---|---|\n| CAP-001 | Save | Find | Must |\n");
  writeFileSync(spec, "# Spec\n\n| ID | Serves | Requirement | Priority | Verification |\n|---|---|---|---|---|\n| SYS-FR-001 | CAP-001 | Store links. | Must | Test |\n");

  const errors = newProject("application");
  mkdirSync(join(errors, "docs/product/specs/search"), { recursive: true });
  writeFileSync(join(errors, "docs/product/specs/search/SPEC.md"), "# Search\n"); // no SPEC.md to index it
  writeFileSync(join(errors, "docs/README.md"), "[broken](missing.md) and CAP-9999\n");

  return { template: TEMPLATE, clean: newProject("ai-systems,application,backend-api"), warnings, coverage, errors };
}

describe("validate matches the project's own engine", () => {
  const cases = scenarios();
  for (const [name, root] of Object.entries(cases)) {
    for (const mode of MODES) {
      test(`${name} ${mode.join(" ") || "(default)"}`, () => {
        const expected = engine(root, ["validate", ...mode]);
        const actual = groundwork(["validate", ...mode], root);
        expect(actual.stdout).toBe(expected.stdout);
        expect(actual.status).toBe(expected.status);
      });
    }
  }

  test("the scenarios cover passing, warning and failing runs", () => {
    expect(engine(cases.template!, ["validate", "--strict", "--strict-coverage"]).status).toBe(0);
    expect(engine(cases.warnings!, ["validate"]).status).toBe(0);
    expect(engine(cases.warnings!, ["validate", "--strict"]).status).toBe(1);
    expect(engine(cases.coverage!, ["validate", "--strict"]).status).toBe(0);
    expect(engine(cases.coverage!, ["validate", "--strict-coverage"]).status).toBe(1);
    expect(engine(cases.errors!, ["validate"]).status).toBe(1);
  });
});

describe("requirement references in code", () => {
  const write = (root: string, path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };

  test("are found wherever the code lives, not only in src/ and tests/", () => {
    const project = newProject("application,backend-api");
    write(project, "apps/mobile/tests/login.test.ts", 'test("AUTH-FR-001", () => {});\n');
    write(project, "services/api/main.py", "# serves CAP-042\n");
    const out = engine(project, ["validate"]).stdout;
    expect(out).toContain("apps/mobile/tests/login.test.ts: requirement ID AUTH-FR-001 is not defined");
    expect(out).toContain("services/api/main.py: capability CAP-042 is not defined");
  });

  test("skip dependencies, build output, hidden folders and virtual environments", () => {
    const project = newProject("none");
    for (const path of [
      "node_modules/pkg/index.js",
      "apps/web/dist/bundle.js",
      "apps/mobile/build/out.js",
      "vendor/lib.go",
      ".cache/x.js",
      "env/lib/thing.py",
    ]) {
      write(project, path, "AUTH-FR-001 CAP-042\n");
    }
    write(project, "env/pyvenv.cfg", "home = /usr\n");
    const result = engine(project, ["validate"]);
    expect(result.stdout).not.toContain("FAIL");
    expect(result.status).toBe(0);
  });
});
