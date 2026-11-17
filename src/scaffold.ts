// Creating a new project: the interactive wizard and the non-interactive
// path. Both end in the same engine call (`groundwork.py new`), which
// validates the selection, builds the project in a staging folder and moves
// it into place only if everything succeeded.

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  GroundworkError,
  type NewResult,
  type Profile,
  type ProfileList,
  runEngine,
  runScript,
  TEMPLATE_ROOT,
  VERSION,
} from "./engine.js";
import { CORE, describeRequires, summary } from "./profiles.js";
import type { Prompter } from "./prompter.js";
import { bold, green, red } from "./text.js";

export interface CreateOptions {
  dir?: string;
  name?: string;
  description?: string;
  /** Profile IDs; ["none"] or [] means core only. Undefined means "not given". */
  profiles?: string[];
  yes: boolean;
  dryRun: boolean;
}

interface Answers {
  name: string;
  description: string;
  destination: string;
  profiles: string[];
}

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function display(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel && !rel.startsWith("..") ? `./${rel}` : path;
}

export function loadProfiles(): Profile[] {
  const list = runEngine<ProfileList>(TEMPLATE_ROOT, ["list"]);
  if (!list.ok) throw new GroundworkError(`The bundled Groundwork template is invalid:\n${(list.errors ?? []).join("\n")}`);
  return list.profiles;
}

function generate(answers: Answers, dryRun: boolean): NewResult {
  const ids = answers.profiles.length ? answers.profiles : ["none"];
  return runEngine<NewResult>(TEMPLATE_ROOT, [
    "new",
    answers.destination,
    `--name=${answers.name}`,
    `--description=${answers.description}`,
    ...(dryRun ? ["--dry-run"] : []),
    "--profiles",
    ...ids,
  ]);
}

// --- Validation used while prompting (the engine re-checks everything) --------

function checkName(value: string): string | undefined {
  if (!value.trim()) return "Enter a project name.";
  if (value.length > 100) return "Keep it to 100 characters or fewer.";
  if (value.includes("{{") || value.includes("}}")) return "The name can't contain {{ or }}.";
  return undefined;
}

function checkDestination(value: string): string | undefined {
  if (!value.trim()) return "Enter a folder.";
  const path = resolve(value);
  if (existsSync(path) && (!statSync(path).isDirectory() || readdirSync(path).length > 0)) {
    return "That folder already exists and isn't empty. Groundwork never overwrites files — choose another.";
  }
  if (!existsSync(dirname(path))) return `${dirname(path)} doesn't exist. Create it first, or choose another folder.`;
  return undefined;
}

// --- Summaries -----------------------------------------------------------------

function profileNames(ids: string[], all: Profile[]): string[] {
  return ids.map((id) => all.find((p) => p.id === id)?.name ?? id);
}

function reviewText(answers: Answers, plan: NewResult, all: Profile[]): string {
  const init = plan.init;
  const created = init.documents.filter((d) => d.action === "create").map((d) => d.path);
  const lines = [
    `Project:      ${answers.name}`,
    ...(answers.description ? [`Description:  ${answers.description}`] : []),
    `Folder:       ${display(answers.destination)}`,
    `Profiles:     ${["Core (always)", ...profileNames(init.profiles, all)].join(", ")}`,
  ];
  const deps = init.profiles.flatMap((id) => {
    const profile = all.find((p) => p.id === id);
    return profile ? describeRequires(profile, all).map((r) => `${profile.name} requires ${r} — satisfied`) : [];
  });
  if (deps.length) lines.push("", "Dependencies:", ...deps.map((d) => `  ✓ ${d}`));
  lines.push("", `Files: ${plan.files} from Groundwork (core documents, profiles, scripts)${created.length ? ", plus:" : ""}`);
  lines.push(...created.map((path) => `  + ${path}`));
  const checks = init.checks;
  if (checks.length) {
    lines.push("", "Engineering checks added to AGENTS.md:", ...checks.map((c) => `  - ${c.name} (${c.profile})`));
  }
  if (init.optional.length) {
    lines.push("", "Optional documents, for later (groundwork add <path>):", ...init.optional.map((o) => `  - ${o.path}`));
  }
  return lines.join("\n");
}

function completionText(answers: Answers, result: NewResult, all: Profile[], validated: boolean, check: string): string {
  const created = result.init.documents.filter((d) => d.action === "create").map((d) => d.path);
  const names = profileNames(result.init.profiles, all);
  const lines = [
    `Project: ${answers.name}`,
    "",
    "Active profiles:",
    ...(names.length ? names.map((n) => `  - ${n}`) : ["  - none (Groundwork Core only)"]),
    "",
    `Generated: ${result.files} files from Groundwork (core documents, profiles, scripts)${created.length ? ", plus:" : ""}`,
    ...created.map((path) => `  + ${path}`),
    "",
    "Validation:",
  ];
  if (validated) {
    lines.push(
      `  ${green("✓")} Profile selection, dependencies and document ownership`,
      `  ${green("✓")} Required documents present`,
      `  ${green("✓")} Manifest, requirement IDs and links`,
    );
  } else {
    lines.push(`  ${red("✗")} The documentation check reported problems:`, ...check.trim().split("\n").map((l) => `    ${l}`));
  }
  lines.push(
    "",
    "Next steps:",
    `  cd ${display(result.destination)}`,
    "  groundwork validate          (or: python3 scripts/check_docs.py)",
    "  Fill in PROJECT.md, then docs/product/PRD.md, and read profiles/README.md.",
  );
  return lines.join("\n");
}

function finish(answers: Answers, result: NewResult, all: Profile[]) {
  const check = runScript(result.destination, "check_docs.py", [], "capture");
  return { ok: check.status === 0, text: completionText(answers, result, all, check.status === 0, check.stdout + check.stderr) };
}

// --- Interactive wizard --------------------------------------------------------------

async function chooseProfiles(p: Prompter, all: Profile[], current: string[]): Promise<string[]> {
  const selectable = all.filter((profile) => profile.id !== CORE);
  let recommended = current;
  if (!current.length) {
    const mode = await p.select({
      message: "How would you like to choose profiles?",
      options: [
        { value: "guided", label: "Guide me", hint: `one question per profile (${selectable.length})` },
        { value: "direct", label: "I know which profiles I need" },
      ],
      initialValue: "guided",
    });
    if (mode === "guided") {
      p.info("Choose by what the system must do and keep doing — not by the technology it uses.");
      recommended = [];
      for (const profile of selectable) {
        const guidance = [
          "Use it when:",
          ...(profile.use_when ?? []).map((s) => `  • ${s}`),
          "Not when:",
          ...(profile.not_when ?? []).map((s) => `  • ${s}`),
        ].join("\n");
        p.note(guidance, `${profile.name} — ${summary(profile)}`);
        if (await p.confirm({ message: `Does this describe a responsibility of your system?`, initialValue: false })) {
          recommended.push(profile.id);
        }
      }
    }
  }
  return p.multiselect({
    message: "Select profiles (space to toggle, enter to confirm; none selected = Groundwork Core only)",
    options: selectable.map((profile) => {
      const requires = describeRequires(profile, all);
      return {
        value: profile.id,
        label: profile.name,
        hint: [summary(profile), ...requires.map((r) => `requires ${r}`)].join(" · "),
      };
    }),
    initialValues: recommended,
  });
}

async function wizard(options: CreateOptions, p: Prompter, all: Profile[]): Promise<Answers | null> {
  p.intro(` Groundwork ${VERSION} `);
  const name =
    options.name ??
    (await p.text({
      message: "Project name",
      initialValue: options.dir ? options.dir.split(/[\\/]/).filter(Boolean).at(-1) : undefined,
      placeholder: "parkmate",
      validate: checkName,
    }));
  const description =
    options.description ??
    (await p.text({ message: "One-line description (optional)", placeholder: "Parking management platform" }));
  const destination = resolve(
    options.dir ??
      (await p.text({ message: "Where should it go?", initialValue: `./${slug(name)}`, validate: checkDestination })),
  );

  const problem = checkName(name) ?? checkDestination(destination);
  if (problem) {
    p.error(problem);
    return null;
  }

  let profiles = options.profiles ? options.profiles.filter((id) => id !== "none") : [];
  let skipSelection = options.profiles !== undefined;
  for (;;) {
    if (!skipSelection) profiles = await chooseProfiles(p, all, profiles);
    skipSelection = false;
    const answers: Answers = { name: name.trim(), description: description.trim(), destination, profiles };
    const plan = generate(answers, true);
    if (!plan.ok) {
      // Selection problems (unknown IDs, dependencies, conflicts) go back to
      // selection; anything else stops here.
      const errors = plan.errors ?? [];
      for (const error of errors) p.error(error.replace(/^PROJECT\.md: /, ""));
      if (!errors.length || !errors.every((e) => e.startsWith("PROJECT.md: "))) return null;
      continue;
    }
    p.note(reviewText(answers, plan, all), "Review");
    if (options.yes) return answers;
    const next = await p.select({
      message: options.dryRun ? "Dry run — nothing will be written. Continue?" : "Create the project?",
      options: [
        { value: "create", label: options.dryRun ? "Show the result" : "Create it" },
        { value: "change", label: "Change profiles" },
        { value: "cancel", label: "Cancel" },
      ],
      initialValue: "create",
    });
    if (next === "create") return answers;
    if (next === "cancel") return null;
  }
}

// --- Entry point ------------------------------------------------------------------

export async function create(options: CreateOptions, prompter: Prompter | null): Promise<number> {
  const all = loadProfiles();

  if (prompter) {
    const answers = await wizard(options, prompter, all);
    if (!answers) {
      prompter.outro("Cancelled — nothing was created.");
      return 1;
    }
    const spin = prompter.spinner();
    spin.start(options.dryRun ? "Checking" : "Creating your project");
    const result = generate(answers, options.dryRun);
    if (!result.ok) {
      spin.stop("Nothing was created.");
      for (const error of result.errors ?? []) prompter.error(error);
      return 1;
    }
    if (options.dryRun) {
      spin.stop("Dry run complete — nothing was written.");
      prompter.outro(`${display(answers.destination)} would be created with ${result.files} files.`);
      return 0;
    }
    spin.stop("Project created.");
    const done = finish(answers, result, all);
    prompter.note(done.text, "Groundwork");
    prompter.outro(done.ok ? "Your project is ready." : "Created, but the documentation check found problems.");
    return done.ok ? 0 : 1;
  }

  // Non-interactive: everything must be given explicitly.
  if (!options.dir && !options.name) {
    throw new GroundworkError("Give a project folder, for example: create-groundwork my-project --profiles web", 2);
  }
  if (options.profiles === undefined) {
    throw new GroundworkError(
      "Choose profiles with --profiles (for example --profiles application,backend-api, or --profiles none for core only).\n" +
        "Run `groundwork profiles` to see them, or run without --yes in a terminal for guided selection.",
      2,
    );
  }
  const name = options.name ?? options.dir!.split(/[\\/]/).filter(Boolean).at(-1)!;
  const answers: Answers = {
    name,
    description: options.description ?? "",
    destination: resolve(options.dir ?? slug(name)),
    profiles: options.profiles.filter((id) => id !== "none"),
  };
  const result = generate(answers, options.dryRun);
  if (!result.ok) {
    for (const error of result.errors ?? []) console.error(`${red("Error:")} ${error}`);
    console.error("Nothing was created.");
    return 1;
  }
  if (options.dryRun) {
    console.log(`${bold("Dry run")} — nothing was written.\n`);
    console.log(reviewText(answers, result, all));
    return 0;
  }
  const done = finish(answers, result, all);
  console.log(`${bold(`Groundwork ${VERSION}`)}\n`);
  console.log(done.text);
  console.log(`\n${done.ok ? "Your project is ready." : "Created, but the documentation check found problems."}`);
  return done.ok ? 0 : 1;
}
