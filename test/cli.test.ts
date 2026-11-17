// The command-line interface: help, arguments, exit codes, project
// detection, and the interactive wizard (driven by scripted answers).

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { create } from "../dist/scaffold.js";
import type { Choice, Prompter } from "../dist/prompter.js";
import { createGroundwork, groundwork, newProject, readJson, REPO, TEMPLATE, tempDir } from "./helpers";

const VERSION = readJson(join(REPO, "package.json")).version;

describe("help and version", () => {
  test("every command has help", () => {
    for (const args of [[], ["--help"], ["help", "init"], ["profiles", "--help"], ["init", "--help"], ["add", "--help"], ["validate", "--help"], ["config", "--help"], ["create", "--help"]]) {
      const result = groundwork(args, tempDir());
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage");
    }
    const result = createGroundwork(["--help"], tempDir());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("npx create-groundwork [folder] [options]");
  });

  test("--version matches package.json and the bundled template", () => {
    expect(groundwork(["--version"], tempDir()).stdout.trim()).toBe(VERSION);
    expect(createGroundwork(["--version"], tempDir()).stdout.trim()).toBe(VERSION);
    expect(readJson(join(TEMPLATE, "scaffold-manifest.json")).version).toBe(VERSION);
  });
});

describe("arguments and exit codes", () => {
  test("usage errors exit 2", () => {
    const dir = tempDir();
    expect(groundwork(["frobnicate"], dir).status).toBe(2);
    expect(groundwork(["create", "--bogus"], dir).status).toBe(2);
    expect(createGroundwork(["a", "b", "--profiles", "web"], dir).status).toBe(2);
    const noProfiles = createGroundwork(["app", "--yes"], dir);
    expect(noProfiles.status).toBe(2);
    expect(noProfiles.stderr).toContain("--profiles");
    expect(existsSync(join(dir, "app"))).toBe(false);
  });

  test("profiles accept commas or repeated flags, and `none` means core only", () => {
    const parent = tempDir();
    expect(createGroundwork(["a", "--profiles", "web", "--profiles", "application", "--yes"], parent).status).toBe(0);
    expect(readFileSync(join(parent, "a/PROJECT.md"), "utf8")).toContain("- Profiles: application, web");
    expect(createGroundwork(["b", "--profiles", "none", "--yes"], parent).status).toBe(0);
    expect(readFileSync(join(parent, "b/PROJECT.md"), "utf8")).toContain("- Profiles: none");
  });

  test("--name sets the name independently of the folder", () => {
    const parent = tempDir();
    expect(createGroundwork(["park-app", "--name", "Parkmate", "--profiles", "web", "--yes"], parent).status).toBe(0);
    expect(readFileSync(join(parent, "park-app/PROJECT.md"), "utf8")).toContain("- Name: Parkmate");
  });

  test("an invalid profile exits 1 and creates nothing", () => {
    const parent = tempDir();
    const result = createGroundwork(["app", "--profiles", "mobile", "--yes"], parent);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown profile 'mobile'");
    expect(existsSync(join(parent, "app"))).toBe(false);
  });

  test("the folder's parent must exist", () => {
    const result = createGroundwork(["missing/app", "--profiles", "web", "--yes"], tempDir());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not exist");
  });
});

describe("project detection", () => {
  test("project commands outside a project fail clearly", () => {
    for (const command of [["validate"], ["init", "web"], ["add", "docs/x.md"], ["config"]]) {
      const result = groundwork(command, tempDir());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Not inside a Groundwork project");
    }
  });

  test("a folder with look-alike files is not a project", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "scripts"));
    writeFileSync(join(dir, "scripts/check_docs.py"), "print('not groundwork')\n");
    writeFileSync(join(dir, "scaffold-manifest.json"), JSON.stringify({ name: "Something else", files: [] }));
    expect(groundwork(["validate"], dir).stderr).toContain("Not inside a Groundwork project");
  });

  test("commands work from any folder inside a project", () => {
    const project = newProject("web");
    const result = groundwork(["validate"], join(project, "docs", "web"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("(profiles: web)");
  });

  test("a Groundwork 2.x project can be validated but not initialised", () => {
    const project = newProject("none");
    // A 2.x project has the checker but no engine script.
    const legacy = join(tempDir(), "legacy");
    mkdirSync(join(legacy, "scripts"), { recursive: true });
    writeFileSync(join(legacy, "scripts/check_docs.py"), readFileSync(join(project, "scripts/check_docs.py")));
    writeFileSync(join(legacy, "scaffold-manifest.json"), JSON.stringify({ name: "Groundwork", files: [] }));
    expect(groundwork(["init", "web"], legacy).stderr).toContain("predates Groundwork 3.0 profiles");
  });

  test("a Groundwork 3.0 project (engine without --json or config) still works", () => {
    const project = newProject("none");
    // Stand-in for the 3.0 engine: list/init/add only, text output only.
    writeFileSync(
      join(project, "scripts/groundwork.py"),
      [
        "import sys",
        "if sys.argv[1:] == ['list']: print('3.0 listing')",
        "elif sys.argv[1] == 'init': print('3.0 init', *sys.argv[2:])",
        "else: sys.exit(2)",
      ].join("\n") + "\n",
    );
    expect(groundwork(["profiles"], project).stdout).toBe("3.0 listing\n");
    expect(groundwork(["init", "web", "--dry-run"], project).stdout).toBe("3.0 init web --dry-run\n");
    const config = groundwork(["config"], project);
    expect(config.status).toBe(1);
    expect(config.stderr).toContain("from Groundwork 3.0, which has no config command");
    expect(groundwork(["profiles", "web"], project).stderr).toContain("can only list all profiles");
  });
});

// --- The interactive wizard --------------------------------------------------------

type Answer = string | boolean | string[];

/** Answers prompts in order, and records what was shown. */
class Scripted implements Prompter {
  shown: string[] = [];
  asked: string[] = [];
  constructor(private answers: Answer[]) {}
  private next(message: string): Answer {
    this.asked.push(message);
    if (!this.answers.length) throw new Error(`No scripted answer for: ${message}`);
    return this.answers.shift()!;
  }
  intro = (t: string) => void this.shown.push(t);
  outro = (t: string) => void this.shown.push(t);
  note = (t: string, title?: string) => void this.shown.push(`${title ?? ""}\n${t}`);
  info = (t: string) => void this.shown.push(t);
  warn = (t: string) => void this.shown.push(t);
  error = (t: string) => void this.shown.push(`ERROR ${t}`);
  success = (t: string) => void this.shown.push(t);
  async text(o: { message: string; initialValue?: string; validate?: (v: string) => string | undefined }) {
    let value = this.next(o.message) as string;
    if (value === "") value = o.initialValue ?? "";
    const problem = o.validate?.(value);
    if (problem) throw new Error(`Rejected "${value}": ${problem}`);
    return value;
  }
  async confirm(o: { message: string }) {
    return this.next(o.message) as boolean;
  }
  async select<T extends string>(o: { message: string; options: Choice<T>[] }) {
    const value = this.next(o.message) as T;
    expect(o.options.map((c) => c.value)).toContain(value);
    return value;
  }
  async multiselect<T extends string>(o: { message: string; options: Choice<T>[]; initialValues?: T[] }) {
    this.shown.push(`preselected: ${(o.initialValues ?? []).join(",")}`);
    return this.next(o.message) as T[];
  }
  spinner() {
    return { start: (m: string) => void this.shown.push(m), stop: (m: string) => void this.shown.push(m) };
  }
}

describe("interactive creation", () => {
  test("guided: questions come from the manifests, answers preselect profiles", async () => {
    const parent = tempDir();
    const cwd = process.cwd();
    process.chdir(parent);
    try {
      const p = new Scripted([
        "Parkmate", // name
        "Parking management platform", // description
        "", // folder: accept ./parkmate
        ["claude"], // agent files
        "guided",
        false, // ai-systems
        true, // application
        true, // backend-api
        false, // web
        ["application", "backend-api"], // keep the recommendation
        "create",
      ]);
      const code = await create({ yes: false, dryRun: false }, p);
      expect(code).toBe(0);
      // One guidance note per profile, quoting its manifest.
      const web = readJson(join(TEMPLATE, "profiles/web/profile.json"));
      expect(p.shown.join("\n")).toContain(web.use_when[0]);
      expect(p.shown).toContain("preselected: application,backend-api");
      const review = p.shown.find((s) => s.startsWith("Review"))!;
      expect(review).toContain("Profiles:     Core (always), Application, Backend/API");
      expect(review).toContain("+ docs/architecture/system-design/05-execution-and-resilience.md");
      expect(review).toContain("Integration tests (backend-api)");
      expect(review).toContain("docs/backend-api/DATA.md");
      expect(review).toContain("Agent files:  Claude Code (plus AGENTS.md for every agent)");
      expect(p.shown.at(-1)).toBe("Your project is ready.");
      expect(readFileSync(join(parent, "parkmate/PROJECT.md"), "utf8")).toContain("- Name: Parkmate");
      expect(readFileSync(join(parent, "parkmate/CLAUDE.md"), "utf8")).toContain("@AGENTS.md");
      const done = p.shown.find((s) => s.startsWith("Groundwork is ready"))!;
      expect(done).toContain("Core documents: 6");
      expect(done).toContain("Profile documents: 10");
      expect(done).toContain("Open this project with your AI coding agent");
    } finally {
      process.chdir(cwd);
    }
  });

  test("AI Systems alone is refused and selection is asked again", async () => {
    const parent = tempDir();
    const p = new Scripted(["ai-demo", "", join(parent, "ai-demo"), [], "direct", ["ai-systems"], ["ai-systems", "web"], "create"]);
    expect(await create({ yes: false, dryRun: false }, p)).toBe(0);
    expect(p.shown.some((s) => s.startsWith("ERROR") && s.includes("ai-systems profile requires one of"))).toBe(true);
    expect(readFileSync(join(parent, "ai-demo/PROJECT.md"), "utf8")).toContain("- Profiles: ai-systems, web");
  });

  test("core only, changing profiles from the review, and dependencies shown", async () => {
    const parent = tempDir();
    const p = new Scripted(["tool", "", join(parent, "tool"), [], "direct", ["ai-systems", "application"], "change", [], "create"]);
    expect(await create({ yes: false, dryRun: false }, p)).toBe(0);
    const reviews = p.shown.filter((s) => s.startsWith("Review"));
    expect(reviews[0]).toContain("AI Systems requires one of Web, Application or Backend/API — satisfied");
    expect(reviews[1]).toContain("Profiles:     Core (always)\n");
    expect(readFileSync(join(parent, "tool/PROJECT.md"), "utf8")).toContain("- Profiles: none");
  });

  test("cancelling at the review creates nothing", async () => {
    const parent = tempDir();
    const p = new Scripted(["x", "", join(parent, "x"), [], "direct", ["web"], "cancel"]);
    expect(await create({ yes: false, dryRun: false }, p)).toBe(1);
    expect(existsSync(join(parent, "x"))).toBe(false);
  });

  test("an existing non-empty folder is refused before any question about profiles", async () => {
    const parent = tempDir();
    mkdirSync(join(parent, "taken"));
    writeFileSync(join(parent, "taken", "file"), "");
    const p = new Scripted(["taken", "", join(parent, "taken")]);
    await expect(create({ yes: false, dryRun: false }, p)).rejects.toThrow("already exists and isn't empty");
  });

  test("a folder argument, --profiles and --agents skip those questions", async () => {
    const parent = tempDir();
    const p = new Scripted(["", "create"]);
    const options = { dir: join(parent, "svc"), name: "svc", profiles: ["backend-api"], agents: [], yes: false, dryRun: false };
    expect(await create(options, p)).toBe(0);
    expect(p.asked).toEqual(["One-line description (optional)", "Create the project?"]);
    expect(existsSync(join(parent, "svc/CLAUDE.md"))).toBe(false);
  });
});
