// Documentation onboarding: the definitions in profiles/<id>/onboarding.json,
// the state in .groundwork/state.json, `status`, `docs`, `mark` and
// `connect`, and the developer scenarios from the specification, replayed as
// the commands an agent would run.

import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGroundwork, editJson, groundwork, newProject, engine, readJson, TEMPLATE, tempDir, templateCopy } from "./helpers";

const gw = (project: string, args: string[]) => engine(project, args);
const check = (project: string, args: string[] = []) => engine(project, ["validate", ...args]);

function status(project: string): any {
  const result = gw(project, ["status", "--json"]);
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout);
}

function mark(project: string, ...args: string[]): void {
  const result = gw(project, ["mark", ...args]);
  if (result.status !== 0) throw new Error(`mark ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
}

const PROFILES = (ids: string) => `- Profiles: ${ids}\n- Why: people manage their own records`;
const doc = (report: any, path: string) => report.documents.find((d: any) => d.path === path);
const section = (report: any, path: string, id: string) => doc(report, path).sections.find((s: any) => s.id === id);

/** Replace a section's body (everything under its heading) with text,
 * creating the document first if needed, as an agent would. */
function writeSection(project: string, path: string, heading: string, body: string): void {
  const file = join(project, path);
  if (!existsSync(file)) expect(gw(project, ["add", path]).status).toBe(0);
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.findIndex((l) => l.replace(/^#+\s*/, "") === heading);
  if (start < 0) throw new Error(`no heading ${heading} in ${path}`);
  const level = lines[start]!.match(/^#+/)![0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i]!.match(/^(#+)\s/);
    if (m && m[1]!.length <= level) {
      end = i;
      break;
    }
  }
  lines.splice(start + 1, end - start - 1, body, "");
  writeFileSync(file, lines.join("\n"));
}

describe("onboarding definitions", () => {
  test("every document of every profile has one, written by its owner, with sections anchored to its headings", () => {
    const owned: string[] = [];
    for (const id of readdirSync(join(TEMPLATE, ".groundwork", "profiles")).filter((d) => existsSync(join(TEMPLATE, ".groundwork", "profiles", d, "profile.json")))) {
      const manifest = readJson(join(TEMPLATE, ".groundwork", "profiles", id, "profile.json"));
      const onboarding = readJson(join(TEMPLATE, ".groundwork", "profiles", id, "onboarding.json"));
      const docs = Object.keys(onboarding.documents);
      owned.push(...docs);
      for (const path of docs) {
        // Owned: core lists it, or the profile has its template.
        const template = join(TEMPLATE, ".groundwork", "profiles", id, "templates", path);
        expect(`${id} ${path} ${id === "core" ? manifest.documents.some((d: any) => d.path === path) : existsSync(template)}`).toBe(`${id} ${path} true`);
        const text = readFileSync(existsSync(template) ? template : join(TEMPLATE, path), "utf8");
        const headings = text.split("\n").filter((l) => /^#{1,6} /.test(l)).map((l) => l.replace(/^#+\s*/, "").replace(/^\d+(\.\d+)*\.?\s+/, "").toLowerCase());
        for (const s of onboarding.documents[path].sections) {
          expect(`${path}: ${headings.includes(s.heading.replace(/^\d+(\.\d+)*\.?\s+/, "").toLowerCase())}`).toBe(`${path}: true`);
          if (s.required) expect(s.done_when).toBeTruthy();
        }
      }
    }
    // Every document any manifest lists has an onboarding definition.
    const listed = new Set<string>();
    for (const id of ["core", "content-site", "application", "backend-api", "ai-systems"]) {
      for (const d of readJson(join(TEMPLATE, ".groundwork", "profiles", id, "profile.json")).documents) {
        if (!d.path.startsWith(".github/")) listed.add(d.path); // CI files have nothing to ask
      }
    }
    expect([...listed].filter((p) => !owned.includes(p))).toEqual([]);
    expect(owned.length).toBe(19);
  });

  test("the checker rejects broken definitions with a clear message", () => {
    const cases: [string, (data: any) => void, string][] = [
      ["question asked twice", (d) => d.documents["docs/product/PRD.md"].sections[1].questions.push("problem"), "is asked in both"],
      ["unknown heading", (d) => (d.documents["docs/architecture/SYSTEM_DESIGN.md"].sections[2].heading = "Nope"), "is not in the template"],
      [
        "a part that appears only when needed, marked required",
        (d) => (d.documents["docs/architecture/SYSTEM_DESIGN.md"].sections.find((s: any) => s.id === "domain").required = true),
        "has 'required': false",
      ],
      ["dependency cycle", (d) => d.documents["PROJECT.md"].depends_on = ["docs/product/PRD.md"], "dependencies form a cycle"],
      ["required section without done_when", (d) => delete d.documents["PROJECT.md"].sections[0].done_when, "needs 'done_when'"],
      ["another profile's document", (d) => (d.documents["docs/content-site/SEO.md"] = d.documents["PROJECT.md"]), "only a document's owner defines its onboarding"],
      ["unused question", (d) => (d.questions.orphan = { ask: "?" }), "is never asked"],
    ];
    for (const [name, edit, message] of cases) {
      const copy = templateCopy();
      editJson(join(copy, ".groundwork/profiles/core/onboarding.json"), edit);
      const result = check(copy);
      expect(`${name}: ${result.status}`).toBe(`${name}: 1`);
      expect(result.stdout).toContain(message);
    }
  });

  test("a profile without onboarding.json (a project's own profile) stays valid", () => {
    const project = newProject("content-site");
    cpSync(join(project, ".groundwork/profiles/content-site"), join(project, ".groundwork/profiles/kiosk"), { recursive: true });
    editJson(join(project, ".groundwork/profiles/kiosk/profile.json"), (d) => {
      d.id = "kiosk";
      d.documents = [{ path: "docs/kiosk/SCREENS.md", required: true }];
    });
    cpSync(join(project, ".groundwork/profiles/content-site/templates/docs/content-site/SEO.md"), join(project, ".groundwork/profiles/kiosk/templates/docs/kiosk/SCREENS.md"));
    for (const f of ["onboarding.json", "templates/docs/content-site"]) {
      const target = join(project, ".groundwork/profiles/kiosk", f);
      if (existsSync(target)) require("node:fs").rmSync(target, { recursive: true });
    }
    editJson(join(project, ".groundwork/manifest.json"), (m) => {
      m.files = [...m.files.filter((f: string) => !f.startsWith(".groundwork/profiles/kiosk/")), ".groundwork/profiles/kiosk/README.md", ".groundwork/profiles/kiosk/profile.json", ".groundwork/profiles/kiosk/templates/docs/kiosk/SCREENS.md"].sort();
    });
    expect(gw(project, ["init", "content-site", "kiosk"]).status).toBe(0);
    expect(gw(project, ["add", "docs/kiosk/SCREENS.md"]).status).toBe(0);
    const result = check(project, ["--strict"]);
    expect(result.stdout).toContain("OK:");
    expect(doc(status(project), "docs/kiosk/SCREENS.md").status).toBe("untracked");
  });
});

describe("a new project", () => {
  test("has the agent workflow, configuration and onboarding state, and nothing optional", () => {
    const project = newProject("application,backend-api", ["--description", "Savings for a cooperative"]);
    expect(readFileSync(join(project, "AGENTS.md"), "utf8")).toContain("follow `GROUNDWORK.md`");
    expect(readFileSync(join(project, "GROUNDWORK.md"), "utf8")).toContain("- Autonomy: balanced");
    const state = readJson(join(project, ".groundwork/state.json"));
    // What the developer told create-groundwork is recorded, not asked again.
    expect(state.questions.what_building).toMatchObject({ state: "answered", setup: true });
    expect(state.questions.profile_fit).toMatchObject({ state: "confirmed", setup: true });
    const report = status(project);
    expect(report.discovery).toBe("not-started");
    expect(report.focus.document).toBe("PROJECT.md");
    expect(report.focus.questions.map((q: any) => q.id)).toEqual(["project_status", "project_owner"]);
    // Profiles given up front come with a factual reason, so a fresh project
    // has nothing to flag about itself.
    expect(readFileSync(join(project, "PROJECT.md"), "utf8")).toContain("- Why: Chosen when the project was created, before discovery.");
    expect(section(report, "PROJECT.md", "profiles").status).toBe("complete");
    expect(report.attention).toEqual([]);
    expect(doc(report, "docs/backend-api/DATA.md").status).toBe("available");
    expect(existsSync(join(project, "docs/backend-api/DATA.md"))).toBe(false);
    expect(existsSync(join(project, "CLAUDE.md"))).toBe(false);
    // Profile documents of unselected profiles are not part of it.
    expect(doc(report, "docs/content-site/SEO.md")).toBeUndefined();
    const brief = gw(project, ["status", "--brief"]).stdout;
    expect(brief).toContain("Onboarding hasn't started");
    expect(brief).toContain("Follow GROUNDWORK.md");
  });

  test("--agents adds thin adapters that point at AGENTS.md, and validation still passes", () => {
    const project = newProject("content-site", ["--agents", "claude,gemini"]);
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toContain("@AGENTS.md");
    const hook = readJson(join(project, ".claude/settings.json")).hooks.SessionStart[0].hooks[0].command;
    expect(hook).toContain('node "$CLAUDE_PROJECT_DIR/.groundwork/scripts/groundwork.mjs" status --brief');
    expect(readJson(join(project, ".gemini/settings.json")).context.fileName).toContain("AGENTS.md");
    expect(check(project, ["--strict"]).status).toBe(0);
    expect(gw(project, ["connect"]).stdout).toContain("claude (Claude Code): connected");
  });

  test("connect never overwrites an existing file and says what to add", () => {
    const project = newProject("content-site");
    writeFileSync(join(project, "CLAUDE.md"), "# Mine\n");
    const result = gw(project, ["connect", "claude"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CLAUDE.md: exists and was left unchanged — add a line `@AGENTS.md`");
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toBe("# Mine\n");
    expect(existsSync(join(project, ".claude/settings.json"))).toBe(true);
    expect(gw(project, ["connect", "cursor"]).stderr + gw(project, ["connect", "cursor"]).stdout).toContain("unknown agent 'cursor'");
  });
});

describe("recording progress", () => {
  test("the six states stay distinct, older names become deferred with their meaning kept, and the guards hold", () => {
    const project = newProject("application");
    mark(project, "problem", "answered");
    mark(project, "existing_alternatives", "confirmed");
    mark(project, "success_measures", "deferred", "--note", "after the pilot");
    mark(project, "key_journeys", "not_applicable");
    // Names from before 4.0 still work: each is deferred, with its meaning in the note.
    mark(project, "primary_users", "skipped");
    mark(project, "user_types", "unknown");
    mark(project, "product_risks", "blocked", "--note", "waiting on the funding decision");
    const report = status(project);
    const questions = Object.fromEntries(
      doc(report, "docs/product/PRD.md").sections.flatMap((s: any) => s.questions).map((q: any) => [q.id, q]),
    );
    const states = Object.fromEntries(Object.entries(questions).map(([id, q]: [string, any]) => [id, q.state]));
    expect(states).toMatchObject({
      problem: "answered", existing_alternatives: "confirmed", primary_users: "deferred", user_types: "deferred",
      success_measures: "deferred", product_risks: "deferred", key_journeys: "not_applicable", capabilities: "unasked",
    });
    expect(questions.primary_users.note).toBe("skipped");
    expect(questions.user_types.note).toBe("unknown");
    expect(questions.product_risks.note).toBe("blocked: waiting on the funding decision");
    expect(report.open.map((o: any) => `${o.state} ${o.target}`)).toEqual(
      expect.arrayContaining(["deferred primary_users", "deferred user_types", "deferred success_measures", "deferred product_risks"]),
    );

    const refused = (args: string[], message: string) => {
      const result = gw(project, ["mark", ...args]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(message);
    };
    refused(["capabilities", "assumed"], "assumed needs --note");
    refused(["existing_alternatives", "assumed", "--note", "x"], "confirmed by the developer");
    refused(["docs/product/PRD.md", "not_applicable"], "required by core, so it can't be not applicable");
    refused(["docs/product/PRD.md#nope", "answered"], "unknown section");
    refused(["nonsense", "answered"], "not a question ID");
    refused(["problem", "maybe"], "use one of unasked, answered, confirmed, assumed, not_applicable, deferred");
    // --reopen is the deliberate way back.
    mark(project, "existing_alternatives", "assumed", "--note", "Members use a spreadsheet", "--reopen");
  });

  test("progress survives separate sessions, and deferred items stay deferred", () => {
    const project = newProject("content-site");
    mark(project, "docs/content-site/SEO.md#redirects", "deferred", "--note", "no old site yet");
    // A later session: the state file is all that carries over.
    const report = status(project);
    expect(section(report, "docs/content-site/SEO.md", "redirects")).toMatchObject({ status: "deferred", note: "no old site yet" });
    expect(readJson(join(project, ".groundwork/state.json")).documents["docs/content-site/SEO.md"].sections.redirects.state).toBe("deferred");
  });

  test("unfinished or deferred documentation never fails validation", () => {
    const project = newProject("application,backend-api");
    mark(project, "docs/product/PRD.md", "deferred", "--note", "after the client workshop");
    mark(project, "docs/backend-api/DATA.md", "not_applicable", "--note", "one managed database");
    mark(project, "docs/product/SPEC.md#non-functional", "deferred");
    const result = check(project, ["--strict", "--strict-coverage"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Onboarding: discovery in progress; 0 of 10 documents complete");
    // A required document that was deferred is not reported as complete.
    expect(doc(status(project), "docs/product/PRD.md").status).toBe("deferred");
    // An optional document ruled out is no longer offered, and was not created.
    const report = status(project);
    expect(report.available.map((d: any) => d.path)).not.toContain("docs/backend-api/DATA.md");
    expect(existsSync(join(project, "docs/backend-api/DATA.md"))).toBe(false);
  });

  test("once PROJECT.md says Development, required documents nobody wrote or deferred are hygiene warnings", () => {
    const project = newProject("application");
    const setStatus = (value: string) => {
      const file = join(project, "PROJECT.md");
      writeFileSync(file, readFileSync(file, "utf8").replace(/^- Status: .*$/m, `- Status: ${value}`));
    };
    const unwritten = () => check(project).stdout.split("\n").filter((l) => l.includes("but nothing is written in it")).map((l) => l.split(":")[1]!.trim());
    expect(unwritten()).toEqual([]);
    setStatus("Development");
    expect(unwritten()).toEqual(["docs/architecture/SYSTEM_DESIGN.md", "docs/design/DESIGN.md", "docs/engineering/SECURITY.md", "docs/product/PRD.md", "docs/product/SPEC.md"]);
    expect(check(project, ["--strict"]).status).toBe(1);
    // Writing a document, or deferring it with a reason, settles it.
    writeSection(project, "docs/product/PRD.md", "Problem", "Members lose track of their savings.");
    mark(project, "docs/design/DESIGN.md", "deferred", "--note", "using the component library's defaults for now");
    expect(unwritten()).not.toContain("docs/product/PRD.md");
    expect(unwritten()).not.toContain("docs/design/DESIGN.md");
    // Once the project has shipped, every required document counts.
    setStatus("Production");
    expect(unwritten()).toContain("BUILD.md");
  });

  test("questions needing confirmation wait for it, and assumptions are listed", () => {
    const project = newProject("content-site");
    mark(project, "capabilities", "answered");
    mark(project, "scope_out", "assumed", "--note", "No online payments in the first version");
    const report = status(project);
    expect(section(report, "docs/product/PRD.md", "capabilities").status).toBe("needs-confirmation");
    expect(report.attention.map((a: any) => `${a.kind} ${a.target}`)).toEqual(
      expect.arrayContaining(["confirm capabilities", "confirm scope_out"]),
    );
    expect(report.attention.find((a: any) => a.target === "scope_out").text).toBe("No online payments in the first version");
  });
});

describe("documents and state", () => {
  test("a section written by hand is noticed, and the agent is told to review it rather than ask", () => {
    const project = newProject("content-site");
    writeSection(project, "docs/product/PRD.md", "Problem", "Visitors can't find the opening hours.");
    const report = status(project);
    expect(section(report, "docs/product/PRD.md", "problem")).toMatchObject({ content: "written", status: "review" });
    expect(section(report, "docs/product/PRD.md", "users")).toMatchObject({ content: "template", status: "not-started" });
    expect(report.attention.some((a: any) => a.kind === "review" && a.target === "docs/product/PRD.md#problem")).toBe(true);
    expect(report.discovery).toBe("in-progress");
  });

  test("answered but unwritten sections are flagged; written and answered sections are complete", () => {
    const project = newProject("content-site");
    mark(project, "project_constraints", "answered");
    expect(section(status(project), "PROJECT.md", "constraints").status).toBe("ready-to-write");
    writeSection(project, "PROJECT.md", "Project constraints", "- Launch before the September intake.");
    expect(section(status(project), "PROJECT.md", "constraints").status).toBe("complete");
  });

  test("a damaged state file is reported, refused for writing, and repaired without losing valid entries", () => {
    const project = newProject("content-site");
    mark(project, "problem", "answered");
    mark(project, "primary_users", "deferred");
    writeSection(project, "PROJECT.md", "Project constraints", "- One developer, evenings only.");
    const statePath = join(project, ".groundwork/state.json");
    editJson(statePath, (s) => {
      s.questions.primary_users.state = "maybe";
      s.questions.ghost = { state: "answered" };
    });
    const validate = check(project);
    expect(validate.status).toBe(1);
    expect(validate.stdout).toContain("question 'primary_users': state 'maybe'");
    expect(validate.stdout).toContain("question 'ghost' is not defined");
    // status keeps working; writing is refused until repaired.
    expect(status(project).warnings.join("\n")).toContain("run `groundwork mark --repair`");
    expect(gw(project, ["mark", "scope_in", "answered"]).stdout).toContain("mark --repair");
    const repair = gw(project, ["mark", "--repair"]);
    expect(repair.stdout).toContain("dropped: question primary_users");
    expect(readJson(statePath).questions.problem.state).toBe("answered");
    expect(readdirSync(join(project, ".groundwork")).some((f) => f.startsWith("state.json.bak-"))).toBe(true);
    expect(check(project).status).toBe(0);

    // Unreadable: progress is rebuilt from the documents, whose fingerprints
    // live in config.json, so the writing is still recognised.
    writeFileSync(statePath, "{broken");
    expect(section(status(project), "PROJECT.md", "constraints").content).toBe("written");
    expect(gw(project, ["mark", "--repair"]).status).toBe(0);
    expect(readJson(statePath).schema).toBe(1);
    // Missing: same.
    require("node:fs").rmSync(statePath);
    expect(section(status(project), "PROJECT.md", "constraints").status).toBe("review");
    mark(project, "scope_in", "answered");
    expect(existsSync(statePath)).toBe(true);
  });

  test("Groundwork's own edits don't look like the project's writing", () => {
    const parent = tempDir();
    expect(createGroundwork(["app", "--yes"], parent).status).toBe(0);
    const project = join(parent, "app");
    // init adds tooling rows to AGENTS.md and changes the Profiles line.
    expect(gw(project, ["init", "content-site"]).status).toBe(0);
    expect(gw(project, ["init", "content-site", "application"]).status).toBe(0);
    const report = status(project);
    expect(section(report, "AGENTS.md", "tooling").content).toBe("template");
    expect(section(report, "PROJECT.md", "profiles").content).toBe("template");
  });

  test("init --why records the reason, which counts as the project's writing", () => {
    const parent = tempDir();
    expect(createGroundwork(["app", "--yes"], parent).status).toBe(0);
    const project = join(parent, "app");
    expect(groundwork(["init", "application", "--why", "People sign in and manage their own records."], project).status).toBe(0);
    mark(project, "profile_fit", "confirmed");
    const text = readFileSync(join(project, "PROJECT.md"), "utf8");
    expect(text).toContain("- Profiles: application\n- Why: People sign in and manage their own records.");
    const report = status(project);
    expect(section(report, "PROJECT.md", "profiles").status).toBe("complete");
    expect(report.attention.filter((a: any) => a.document === "PROJECT.md")).toEqual([]);
  });
});

describe("parts of a document that only some projects need", () => {
  const SD = "docs/architecture/SYSTEM_DESIGN.md";
  const headingsOf = (project: string) =>
    readFileSync(join(project, SD), "utf8").split("\n").filter((l) => l.startsWith("## ")).map((l) => l.slice(3));

  test("a new document holds only the parts the active profiles need, and lists the others", () => {
    const core = newProject("none");
    expect(gw(core, ["add", SD]).stdout).toContain("Left out, as no active profile needs them");
    expect(headingsOf(core)).toEqual(["Status", "Summary", "Context", "Cross-cutting concerns", "Key decisions", "Open questions and risks"]);
    expect(doc(status(core), SD).addable.map((p: any) => p.id)).toEqual(["domain", "behaviour", "architecture", "execution", "operations", "ui"]);

    const service = newProject("backend-api");
    gw(service, ["add", SD]);
    expect(headingsOf(service)).not.toContain("UI and interaction mapping");
    const report = status(service);
    expect(section(report, SD, "execution")).toMatchObject({ required: true, neededBy: ["backend-api"] });
    expect(section(report, SD, "ui")).toBeUndefined();
    expect(check(service, ["--strict"]).status).toBe(0);
  });

  test("a part added by hand is tracked as optional; `add PATH#ID` adds one from the template, in place", () => {
    const project = newProject("none");
    gw(project, ["add", SD]);
    expect(gw(project, ["add", `${SD}#execution`]).status).toBe(0);
    expect(headingsOf(project)).toEqual(["Status", "Summary", "Context", "Execution and resilience", "Cross-cutting concerns", "Key decisions", "Open questions and risks"]);
    expect(section(status(project), SD, "execution")).toMatchObject({ required: false, content: "template" });
    expect(gw(project, ["add", `${SD}#nope`]).stdout).toContain("unknown section");
    // Groundwork's own addition keeps the file recorded as unchanged.
    expect(JSON.parse(gw(project, ["config", "--json"]).stdout).config.files.modified).toEqual([]);
  });

  test("a profile added later: its parts are asked for, and once answered `add` copies them in", () => {
    const project = newProject("none");
    gw(project, ["add", SD]);
    expect(gw(project, ["init", "backend-api"]).status).toBe(0);
    let report = status(project);
    expect(section(report, SD, "execution")).toMatchObject({ content: "missing-heading", status: "not-started" });
    // A part waiting for answers is not a lost heading.
    expect(report.attention).toEqual([]);
    mark(project, "runtime_model", "failure_handling", "recovery", "failure_tolerance", "confirmed");
    report = status(project);
    expect(section(report, SD, "execution").status).toBe("ready-to-write");
    expect(report.attention).toContainEqual(expect.objectContaining({ kind: "write", target: `${SD}#execution` }));
    expect(report.attention.find((a: any) => a.target === `${SD}#execution`).text).toContain(`groundwork add ${SD}#execution`);
    expect(JSON.parse(gw(project, ["add", SD, "--json"]).stdout).added).toEqual([
      "Domain and state", "Behaviour and rules", "Architecture and interfaces", "Execution and resilience", "Operations and scaling",
    ]);
    expect(headingsOf(project)).toEqual([
      "Status", "Summary", "Context", "Domain and state", "Behaviour and rules", "Architecture and interfaces",
      "Execution and resilience", "Operations and scaling", "Cross-cutting concerns", "Key decisions", "Open questions and risks",
    ]);
    expect(gw(project, ["add", SD]).stdout).toContain("already exists — nothing to do");
  });

  test("the checker rejects needs and extensions that don't fit", () => {
    const cases: [string, (data: any) => void, string][] = [
      ["unknown section", (d) => d.needs["docs/architecture/SYSTEM_DESIGN.md"].push("nope"), "needs unknown section"],
      ["a section every project has", (d) => d.needs["docs/architecture/SYSTEM_DESIGN.md"].push("summary"), "every project has anyway"],
      ["an extension of a part it doesn't need", (d) => (d.needs["docs/architecture/SYSTEM_DESIGN.md"] = ["domain", "behaviour", "ui"]), "list it under 'needs' too"],
      ["a document it doesn't list", (d) => (d.needs["docs/product/PRD.md"] = ["problem"]), "does not list in profile.json"],
    ];
    for (const [name, edit, message] of cases) {
      const copy = templateCopy();
      editJson(join(copy, ".groundwork/profiles/application/onboarding.json"), edit);
      const result = check(copy);
      expect(`${name}: ${result.status}`).toBe(`${name}: 1`);
      expect(result.stdout).toContain(message);
    }
  });
});

describe("developer scenarios", () => {
  test("A: an idea only — discovery starts with the project and moves on as answers arrive", () => {
    const project = newProject("application,backend-api");
    let report = status(project);
    expect(report.focus.document).toBe("PROJECT.md");
    mark(project, "what_building", "project_status", "project_owner", "answered");
    writeSection(project, "PROJECT.md", "The basics", "- Name: app\n- Status: Discovery");
    mark(project, "project_constraints", "answered");
    writeSection(project, "PROJECT.md", "Project constraints", "- None yet.");
    report = status(project);
    // The profiles and their reason were recorded at creation, so PROJECT.md
    // is done and discovery moves on to the product.
    expect(report.focus.document).toBe("docs/product/PRD.md");
    expect(report.focus.section).toBe("problem");
    // Never a database or deployment question during discovery.
    expect(report.focus.questions.map((q: any) => q.id)).toEqual(["problem", "existing_alternatives"]);
    expect(report.focus.uses).toEqual(["what_building"]);
  });

  test("B: an existing brief — answered questions are not asked again", () => {
    const project = newProject("content-site");
    mark(project, "problem", "existing_alternatives", "primary_users", "user_types", "desired_outcomes", "answered", "--source", "repository");
    const report = status(project);
    const asked = report.documents.flatMap((d: any) => d.sections).flatMap((s: any) => s.questions).filter((q: any) => q.state === "unasked").map((q: any) => q.id);
    for (const id of ["problem", "existing_alternatives", "primary_users", "user_types", "desired_outcomes"]) expect(asked).not.toContain(id);
    expect(readJson(join(project, ".groundwork/state.json")).questions.problem.source).toBe("repository");
  });

  test("C: no offline support — the offline question is not applicable and no offline design is produced", () => {
    const project = newProject("application");
    // The Application profile adds its offline question to the architecture part of SYSTEM_DESIGN.md.
    expect(gw(project, ["add", "docs/architecture/SYSTEM_DESIGN.md"]).status).toBe(0);
    let part = section(status(project), "docs/architecture/SYSTEM_DESIGN.md", "architecture");
    expect(part.questions.map((q: any) => q.id)).toEqual(["components", "communication", "technology_choices", "client_platforms", "offline_use"]);
    mark(project, "offline_use", "not_applicable", "--note", "No offline access in this version");
    part = section(status(project), "docs/architecture/SYSTEM_DESIGN.md", "architecture");
    expect(part.questions.find((q: any) => q.id === "offline_use").state).toBe("not_applicable");
    expect(part.status).toBe("not-started");
    // No profile needs the execution part, so the document doesn't have it.
    expect(readFileSync(join(project, "docs/architecture/SYSTEM_DESIGN.md"), "utf8")).not.toContain("## Execution and resilience");
  });

  test("D: an undecided architecture — deferred with the reason, and kept visible", () => {
    const project = newProject("application");
    mark(project, "architecture_known", "deferred", "--note", "Not sure whether a separate backend is needed");
    const report = status(project);
    expect(report.open).toContainEqual(
      expect.objectContaining({ target: "architecture_known", state: "deferred", note: "Not sure whether a separate backend is needed" }),
    );
    expect(section(report, "docs/architecture/SYSTEM_DESIGN.md", "summary").status).toBe("in-progress");
  });

  test("E: a new AI feature — the profile is added on agreement, and its documents and questions appear", () => {
    const project = newProject("application");
    let report = status(project);
    expect(doc(report, "docs/ai-systems/MODEL_INTEGRATION.md")).toBeUndefined();
    expect(section(report, "docs/architecture/SYSTEM_DESIGN.md", "architecture").questions.map((q: any) => q.id)).not.toContain("ai_in_architecture");
    expect(gw(project, ["init", "ai-systems", "application"]).status).toBe(0);
    report = status(project);
    expect(doc(report, "docs/ai-systems/MODEL_INTEGRATION.md").status).toBe("pending");
    expect(existsSync(join(project, "docs/ai-systems"))).toBe(false);
    expect(doc(report, "docs/ai-systems/RETRIEVAL.md").status).toBe("available");
    expect(section(report, "docs/architecture/SYSTEM_DESIGN.md", "architecture").questions.map((q: any) => q.id)).toContain("ai_in_architecture");
    expect(section(report, "docs/architecture/SYSTEM_DESIGN.md", "architecture").neededBy).toEqual(["ai-systems", "application"]);
    expect(check(project, ["--strict"]).status).toBe(0);
  });

  test("F: the developer wants to start coding — discovery is declined and never pushed again", () => {
    const project = newProject("content-site");
    mark(project, "discovery", "declined", "--note", "Knows what they are building; start coding");
    const report = status(project);
    expect(report.discovery).toBe("declined");
    expect(report.focus).toBeNull();
    const brief = gw(project, ["status", "--brief"]).stdout;
    expect(brief).not.toContain("Next:");
    expect(brief).not.toContain("hasn't started");
    expect(gw(project, ["status"]).stdout).toContain("raise documentation gaps only when they affect the task");
    mark(project, "discovery", "clear");
    expect(status(project).discovery).toBe("not-started");
  });

  test("G: returning to an unfinished project — the next step follows what's complete", () => {
    const project = newProject("application");
    const report0 = status(project);
    for (const path of ["PROJECT.md", "docs/product/PRD.md"]) {
      for (const s of doc(report0, path).sections) {
        writeSection(project, path, s.heading, s.id === "profiles" ? PROFILES("application") : `Written ${s.id}.`);
        mark(project, `${path}#${s.id}`, "confirmed");
      }
    }
    const report = status(project);
    expect(report.discovery).toBe("complete");
    expect(doc(report, "docs/product/PRD.md").status).toBe("complete");
    // Design-stage documents come next, in priority order: SPEC first.
    expect(report.focus.document).toBe("docs/product/SPEC.md");
    expect(gw(project, ["status", "--brief"]).stdout).toContain("discovery complete");
  });
});

describe("the groundwork command", () => {
  test("status, docs, mark and connect pass through with identical results", () => {
    const project = newProject("content-site");
    expect(groundwork(["status", "--json"], project).stdout).toBe(gw(project, ["status", "--json"]).stdout);
    expect(groundwork(["docs", "docs/content-site/SEO.md"], project).stdout).toBe(gw(project, ["docs", "docs/content-site/SEO.md"]).stdout);
    const marked = groundwork(["mark", "problem", "deferred", "--note", "after interviews"], project);
    expect(marked.status).toBe(0);
    expect(readJson(join(project, ".groundwork/state.json")).questions.problem).toMatchObject({ state: "deferred", note: "after interviews" });
    expect(groundwork(["mark", "problem"], project).status).toBe(2);
    expect(groundwork(["connect", "claude", "--dry-run"], project).stdout).toContain("Would create CLAUDE.md");
    expect(existsSync(join(project, "CLAUDE.md"))).toBe(false);
    for (const command of ["status", "docs", "mark", "connect"]) {
      expect(groundwork([command, "--help"], project).stdout).toContain("Usage");
    }
  });

  test("a pre-release 4.0 project with Python scripts in .groundwork/ gets a clear message", () => {
    const project = newProject("content-site");
    rmSync(join(project, ".groundwork/scripts/groundwork.mjs"));
    writeFileSync(join(project, ".groundwork/scripts/check_docs.py"), "print('old')\n");
    const result = groundwork(["status"], project);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("python3 .groundwork/scripts/groundwork.py <command>");
  });
});

describe("state files from before 4.0", () => {
  test("skipped, unknown and blocked entries are read as deferred, keeping their meaning", () => {
    const project = newProject("application");
    writeFileSync(
      join(project, ".groundwork/state.json"),
      JSON.stringify({
        schema: 1,
        updated: "2026-01-01",
        questions: { problem: { state: "skipped" }, primary_users: { state: "blocked", note: "client call" } },
        documents: { "docs/product/SPEC.md": { state: "unknown" }, "docs/product/PRD.md": { sections: { scope: { state: "skipped" } } } },
      }),
    );
    expect(check(project).status).toBe(0);
    const report = status(project);
    expect(report.warnings).toEqual([]);
    const prd = doc(report, "docs/product/PRD.md");
    const question = (id: string) => prd.sections.flatMap((s: any) => s.questions).find((q: any) => q.id === id);
    expect(question("problem")).toMatchObject({ state: "deferred", note: "skipped" });
    expect(question("primary_users")).toMatchObject({ state: "deferred", note: "blocked: client call" });
    expect(section(report, "docs/product/PRD.md", "scope")).toMatchObject({ status: "deferred", note: "skipped" });
    expect(doc(report, "docs/product/SPEC.md")).toMatchObject({ status: "deferred", note: "unknown" });
    // The next write stores the new names.
    mark(project, "existing_alternatives", "answered");
    const saved = readJson(join(project, ".groundwork/state.json"));
    expect(saved.questions.problem.state).toBe("deferred");
    expect(saved.documents["docs/product/SPEC.md"].state).toBe("deferred");
  });
});
