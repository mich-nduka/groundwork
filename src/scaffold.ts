// Creating a new project: the interactive wizard and the non-interactive
// path. Both end in the same engine call (`groundwork.mjs new`), which builds
// the project in a staging folder and moves it into place only if everything
// succeeded. A new project is lean: a few entry files, with profiles chosen
// and documents written later, once discovery has something to put in them.

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
  /** Profile IDs; ["none"] means core only. Undefined means "chosen after discovery". */
  profiles?: string[];
  /** Agent adapters (claude, gemini). Undefined means "not given": the wizard asks. */
  agents?: string[];
  yes: boolean;
  dryRun: boolean;
}

interface Answers {
  name: string;
  description: string;
  destination: string;
  /** Undefined: chosen after discovery. [] means core only. */
  profiles?: string[];
  agents: string[];
}

export const AGENTS: { id: string; name: string; hint: string }[] = [
  { id: "claude", name: "Claude Code", hint: "CLAUDE.md plus a hook that shows the documentation status at session start" },
  { id: "gemini", name: "Gemini CLI", hint: "a setting so it reads AGENTS.md" },
];

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
  const profiles = answers.profiles === undefined ? [] : ["--profiles", ...(answers.profiles.length ? answers.profiles : ["none"])];
  return runEngine<NewResult>(TEMPLATE_ROOT, [
    "new",
    answers.destination,
    `--name=${answers.name}`,
    `--description=${answers.description}`,
    ...(dryRun ? ["--dry-run"] : []),
    ...(answers.agents.length ? ["--agents", ...answers.agents] : []),
    ...profiles,
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

function profileText(answers: Answers, all: Profile[]): string {
  if (answers.profiles === undefined) return "chosen with your agent, once it's clear what the system does";
  return ["Core (always)", ...profileNames(answers.profiles, all)].join(", ");
}

function reviewText(answers: Answers, plan: NewResult, all: Profile[]): string {
  const lines = [
    `Project:      ${answers.name}`,
    ...(answers.description ? [`Description:  ${answers.description}`] : []),
    `Folder:       ${display(answers.destination)}`,
    `Profiles:     ${profileText(answers, all)}`,
    "",
    "Files:",
    ...plan.visibleFiles.map((path) => `  + ${path}`),
    "  + .groundwork/  (Groundwork's scripts, profiles and templates)",
    "",
    "No other documents yet: each is written once you've said what goes in it.",
  ];
  const deps = (plan.init?.profiles ?? []).flatMap((id) => {
    const profile = all.find((p) => p.id === id);
    return profile ? describeRequires(profile, all).map((r) => `${profile.name} requires ${r} — satisfied`) : [];
  });
  if (deps.length) lines.push("", "Dependencies:", ...deps.map((d) => `  ✓ ${d}`));
  lines.push("", `Agent files:  ${agentText(answers.agents)}`);
  return lines.join("\n");
}

function agentText(ids: string[]): string {
  if (!ids.length) return "none — AGENTS.md works with Codex, Cursor, Copilot and most agents";
  return ids.map((id) => AGENTS.find((a) => a.id === id)?.name ?? id).join(", ") + " (plus AGENTS.md for every agent)";
}

function completionText(answers: Answers, result: NewResult, all: Profile[], validated: boolean, check: string): string {
  const lines = [
    `Project:  ${answers.name}`,
    `Profiles: ${profileText(answers, all)}`,
    `Files:    ${result.visibleFiles.join(", ")}, plus .groundwork/`,
    `Agents:   ${agentText(result.agents ?? answers.agents)}`,
    "",
  ];
  if (validated) lines.push(`${green("✓")} Documentation check passed`);
  else lines.push(`${red("✗")} The documentation check reported problems:`, ...check.trim().split("\n").map((l) => `  ${l}`));
  lines.push(
    "",
    "Next step:",
    `  cd ${display(result.destination)}`,
    "  Open this project with your AI coding agent. It asks about the project",
    "  first, and writes each document only once you've given it something to",
    "  put there.",
    "",
    "Any time:  groundwork status",
  );
  return lines.join("\n");
}

function finish(answers: Answers, result: NewResult, all: Profile[]) {
  const check = runScript(result.destination, ["validate"], "capture");
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
  const agents =
    options.agents ??
    (options.yes
      ? []
      : await p.multiselect({
          message:
            "Add files for a specific AI coding agent? (optional: AGENTS.md already works with Codex, Cursor, Copilot and most others)",
          options: AGENTS.map((a) => ({ value: a.id, label: a.name, hint: a.hint })),
          initialValues: [],
        }));

  // Profiles are chosen after discovery unless given as an option; "change
  // profiles" in the review step offers the guided selection.
  let profiles = options.profiles?.filter((id) => id !== "none");
  for (;;) {
    const answers: Answers = { name: name.trim(), description: description.trim(), destination, profiles, agents };
    const plan = generate(answers, true);
    if (!plan.ok) {
      // Selection problems (unknown IDs, dependencies, conflicts) go back to
      // selection; anything else stops here.
      const errors = plan.errors ?? [];
      for (const error of errors) p.error(error.replace(/^PROJECT\.md: /, ""));
      if (!errors.length || !errors.every((e) => e.startsWith("PROJECT.md: "))) return null;
      profiles = await chooseProfiles(p, all, profiles ?? []);
      continue;
    }
    p.note(reviewText(answers, plan, all), "Review");
    if (options.yes) return answers;
    const next = await p.select({
      message: options.dryRun ? "Dry run — nothing will be written. Continue?" : "Create the project?",
      options: [
        { value: "create", label: options.dryRun ? "Show the result" : "Create it" },
        {
          value: "change",
          label: profiles === undefined ? "Choose profiles now" : "Change profiles",
          hint: profiles === undefined ? "optional: your agent can recommend them after discovery" : undefined,
        },
        { value: "cancel", label: "Cancel" },
      ],
      initialValue: "create",
    });
    if (next === "create") return answers;
    if (next === "cancel") return null;
    profiles = await chooseProfiles(p, all, profiles ?? []);
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
      prompter.outro(`${display(answers.destination)} would be created with ${result.visibleFiles.length} files plus .groundwork/.`);
      return 0;
    }
    spin.stop("Project created.");
    const done = finish(answers, result, all);
    prompter.note(done.text, "Groundwork is ready");
    prompter.outro(done.ok ? "Your project is ready." : "Created, but the documentation check found problems.");
    return done.ok ? 0 : 1;
  }

  // Non-interactive: a folder (or name) is required; profiles are optional.
  if (!options.dir && !options.name) {
    throw new GroundworkError("Give a project folder, for example: create-groundwork my-project", 2);
  }
  const name = options.name ?? options.dir!.split(/[\\/]/).filter(Boolean).at(-1)!;
  const answers: Answers = {
    name,
    description: options.description ?? "",
    destination: resolve(options.dir ?? slug(name)),
    profiles: options.profiles?.filter((id) => id !== "none"),
    agents: options.agents ?? [],
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
  console.log(`${bold(`Groundwork ${VERSION} is ready.`)}\n`);
  console.log(done.text);
  console.log(`\n${done.ok ? "Your project is ready." : "Created, but the documentation check found problems."}`);
  return done.ok ? 0 : 1;
}
