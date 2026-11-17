// `groundwork validate` must give exactly the results of the Python
// checker, in every mode, on the Groundwork template itself and on projects
// with errors and warnings.

import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { groundwork, newProject, python, TEMPLATE } from "./helpers";

const MODES = [[], ["--strict"], ["--strict-coverage"], ["--strict", "--strict-coverage"]];

function scenarios(): Record<string, string> {
  const warnings = newProject("web");
  groundwork(["init", "none"], warnings); // leaves web documents behind: hygiene warnings

  const coverage = newProject("none");
  const spec = join(coverage, "docs/product/SPEC.md");
  const prd = join(coverage, "docs/product/PRD.md");
  writeFileSync(prd, "# PRD\n\n| ID | What it does | Why users care | Priority |\n|---|---|---|---|\n| CAP-001 | Save | Find | Must |\n");
  writeFileSync(spec, "# Spec\n\n| ID | Serves | Requirement | Priority | Verification |\n|---|---|---|---|---|\n| SYS-FR-001 | CAP-001 | Store links. | Must | Test |\n");

  const errors = newProject("application");
  rmSync(join(errors, "docs/design/DESIGN.md"));
  writeFileSync(join(errors, "docs/README.md"), "[broken](missing.md) and CAP-9999\n");

  return { template: TEMPLATE, clean: newProject("ai-systems,application,backend-api"), warnings, coverage, errors };
}

describe("validate matches check_docs.py", () => {
  const cases = scenarios();
  for (const [name, root] of Object.entries(cases)) {
    for (const mode of MODES) {
      test(`${name} ${mode.join(" ") || "(default)"}`, () => {
        const expected = python(root, "check_docs.py", mode);
        const actual = groundwork(["validate", ...mode], root);
        expect(actual.stdout).toBe(expected.stdout);
        expect(actual.status).toBe(expected.status);
      });
    }
  }

  test("the scenarios cover passing, warning and failing runs", () => {
    expect(python(cases.template!, "check_docs.py", ["--strict", "--strict-coverage"]).status).toBe(0);
    expect(python(cases.warnings!, "check_docs.py", []).status).toBe(0);
    expect(python(cases.warnings!, "check_docs.py", ["--strict"]).status).toBe(1);
    expect(python(cases.coverage!, "check_docs.py", ["--strict"]).status).toBe(0);
    expect(python(cases.coverage!, "check_docs.py", ["--strict-coverage"]).status).toBe(1);
    expect(python(cases.errors!, "check_docs.py", []).status).toBe(1);
  });
});
