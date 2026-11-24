// Command parsing and dispatch for both executables.
//   create-groundwork [dir] [options]      → create
//   groundwork <command> [options]         → create | profiles | init | add | validate | config
//                                            | status | docs | mark | connect

import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import {
  findProject,
  GroundworkError,
  legacyMessage,
  type Profile,
  type Project,
  type ProfileList,
  runEngine,
  runScript,
  TEMPLATE_ROOT,
  VERSION,
} from "./engine.js";
import { formatProfile, formatProfileList } from "./profiles.js";
import { Cancelled, clackPrompter, type Prompter } from "./prompter.js";
import { create } from "./scaffold.js";
import { red } from "./text.js";

const CREATE_HELP = `Create a new Groundwork project.

Usage:
  npx create-groundwork [folder] [options]
  groundwork create [folder] [options]

Without options, a short guided setup asks for the name, description and
folder. Give everything as options to skip the questions.

A new project starts lean: README.md, PROJECT.md, AGENTS.md, GROUNDWORK.md
and .gitignore, with Groundwork's own files in .groundwork/. Profiles are
chosen after discovery, and each document is written once there is something
to put in it.

Options:
  --name <name>            Project name (default: the folder name)
  --description <text>     One-line description
  --profiles <ids>         Choose profiles now instead of after discovery:
                           comma-separated IDs, or "none" for core only
                           (see: groundwork profiles)
  --agents <ids>           Agent adapters to add: claude, gemini (comma-separated).
                           AGENTS.md works without one for most agents.
  -y, --yes                Don't ask anything; requires a folder
  --dry-run                Show what would be created, write nothing
  -h, --help               Show this help
  -v, --version            Show the version

Examples:
  npx create-groundwork
  npx create-groundwork parkmate
  npx create-groundwork parkmate --description "Parking management platform" --yes
  npx create-groundwork parkmate --profiles application,backend-api --yes

After creating the project, open it with your AI coding agent: AGENTS.md and
GROUNDWORK.md guide it through documenting the project with you.

Groundwork never overwrites files: the folder must be new or empty.
Every project carries its own engine in .groundwork/scripts/, so its checks
run anywhere Node.js 18+ is installed, with or without this CLI.`;

const MAIN_HELP = `Groundwork ${VERSION} — minimum sufficient engineering documentation,
adapted to what you're building through composable profiles.

Usage: groundwork <command> [options]

Commands:
  create [folder]          Create a new project (same as npx create-groundwork)
  profiles [id]            List profiles, or show one in detail
  init <id...> | none      Choose this project's profiles (after discovery)
  add <path>[#section]     Create a document from its template, when there's something to write in it
  validate                 Check the documentation
  config                   Show this project's Groundwork configuration
  status                   Where documentation onboarding stands, and what's next
  docs [path]              Documents in use, or one document's sections and questions
  mark <target...> <state> Record onboarding progress (used by agents; see GROUNDWORK.md)
  connect [agent...]       Add instruction files for Claude Code or Gemini CLI

Run "groundwork <command> --help" for details. Every command except create
and profiles works inside a Groundwork project (or any folder below one).`;

const HELP: Record<string, string> = {
  profiles: `List Groundwork profiles, or show one in detail.

Usage:
  groundwork profiles            Purpose, selection guidance and dependencies of each
  groundwork profiles <id>       Everything about one profile: documents, checks, dependencies

Inside a project, the project's own .groundwork/profiles/ folder is used;
elsewhere, the profiles bundled with this version of Groundwork.

Options:
  --json         Print the manifests as JSON
  -h, --help     Show this help`,
  init: `Choose this project's profiles.

Usage:
  groundwork init <id> [<id> ...] [--why TEXT] [--dry-run]
  groundwork init none           Groundwork Core only

Run it once discovery shows what the system does. Records the profiles in
PROJECT.md and adds the profiles' checks to the AGENTS.md tooling table. It
creates no documents: the profiles' documents appear in "groundwork status",
and each is created with "groundwork add" once there is something to write in
it. Never overwrites or deletes: run it again with a new list to add or drop
a profile. Profile order does not matter.
Same as: node .groundwork/scripts/groundwork.mjs init

Options:
  --why TEXT     Why these profiles fit, written to the Why line in PROJECT.md
  --dry-run      Show what would change, write nothing
  --json         Print the plan as JSON
  -h, --help     Show this help`,
  add: `Create a document from its template, once there is something to write in it.

Usage:
  groundwork add <path>[#section] [--dry-run]

Examples:
  groundwork add docs/product/PRD.md
  groundwork add docs/ai-systems/RETRIEVAL.md
  groundwork add docs/architecture/SYSTEM_DESIGN.md#execution

The document must belong to core or an active profile ("groundwork docs"
lists them; "groundwork profiles <id>" shows each optional document's
condition). A new document holds only the parts the active profiles need.
On a document that exists, add copies in the parts the active profiles need
and it lacks, or with #section the one part named; it never changes text
already there. Same as: node .groundwork/scripts/groundwork.mjs add

Options:
  --dry-run      Show what would change, write nothing
  --json         Print the result as JSON
  -h, --help     Show this help`,
  validate: `Check the project's documentation.

Usage:
  groundwork validate [--strict] [--strict-coverage]

Runs the project's own engine, so results and exit codes are identical to
running it directly (node .groundwork/scripts/groundwork.mjs validate).

Options:
  --strict            Hygiene warnings fail too
  --strict-coverage   Coverage warnings fail too (use both to fail on everything)
  -h, --help          Show this help`,
  config: `Show this project's Groundwork configuration.

Usage:
  groundwork config [--json]

Shows the project name and profiles (from PROJECT.md), the Groundwork version,
and which files Groundwork generated that have since changed or been deleted
(from .groundwork/config.json). Same as: node .groundwork/scripts/groundwork.mjs config`,
  status: `Show where the project's documentation onboarding stands.

Usage:
  groundwork status [--brief] [--json]

Shows discovery progress, each document's state, items waiting for
confirmation or review, deferred items, and the next questions to ask. AI agents run this at the start of a session (see GROUNDWORK.md).
Same as: node .groundwork/scripts/groundwork.mjs status

Options:
  --brief        A few lines, for an agent's session-start hook
  --json         Everything as JSON
  -h, --help     Show this help`,
  docs: `List the documents in use, or show one in detail.

Usage:
  groundwork docs                Every document of core and the active profiles, with its status
  groundwork docs <path>         One document: purpose, sections, questions and their states

Same as: node .groundwork/scripts/groundwork.mjs docs

Options:
  --json         Print as JSON
  -h, --help     Show this help`,
  mark: `Record onboarding progress in .groundwork/state.json.

Usage:
  groundwork mark <target> [<target> ...] <state> [--note <text>]
  groundwork mark --repair

Targets: a question ID (problem), a document (docs/product/PRD.md), a section
(docs/product/PRD.md#scope), or discovery.
States: answered, confirmed, assumed, not_applicable, deferred, or clear.
Deferred covers everything not settled yet (skipped for now, not known yet,
waiting on something); say why with --note. A whole document takes deferred
or not_applicable; discovery takes declined or complete.

The state file records progress only; answers belong in the documents. A
confirmed item changes back only with --reopen. Same as:
node .groundwork/scripts/groundwork.mjs mark

Options:
  --note <text>     Why (required for assumed)
  --source <who>    developer, repository or agent
  --reopen          Allow changing something the developer confirmed
  --repair          Rebuild a damaged state file, keeping every valid entry
  --dry-run         Show what would change, write nothing
  --json            Print the result as JSON
  -h, --help        Show this help`,
  connect: `Add thin instruction files for agents that don't read AGENTS.md on their own.

Usage:
  groundwork connect                 Show which agents are connected
  groundwork connect claude gemini   Add their files

claude: CLAUDE.md (imports AGENTS.md) and a session-start hook in
.claude/settings.json that shows the onboarding status.
gemini: .gemini/settings.json, so Gemini CLI reads AGENTS.md.
Codex, Cursor, GitHub Copilot and most other agents read AGENTS.md already.
Existing files are never overwritten; you're told what to add instead.

Options:
  --dry-run      Show what would change, write nothing
  --json         Print the result as JSON
  -h, --help     Show this help`,
};

const HELP_OPTION = { help: { type: "boolean", short: "h" } } as const;

function parse<O extends ParseArgsOptionsConfig>(args: string[], options: O) {
  try {
    return parseArgs({ args, options: { ...HELP_OPTION, ...options }, allowPositionals: true });
  } catch (error) {
    throw new GroundworkError(`${(error as Error).message}\nRun with --help for usage.`, 2);
  }
}

function needProject(command: string, modifies: boolean): Project {
  const project = findProject();
  if (!project) {
    throw new GroundworkError(
      `Not inside a Groundwork project (no .groundwork/ folder with Groundwork's scripts here or above).\n` +
        "Create one with: npx create-groundwork",
    );
  }
  if (project.legacy) throw new GroundworkError(legacyMessage(project.root));
  if (modifies && project.isBundledTemplate) {
    throw new GroundworkError(
      "This is the template bundled with Groundwork itself, not a project. Create a project with: groundwork create",
    );
  }
  return project;
}

const CREATE_OPTIONS = {
  name: { type: "string" },
  description: { type: "string" },
  profiles: { type: "string", multiple: true },
  agents: { type: "string", multiple: true },
  yes: { type: "boolean", short: "y" },
  "dry-run": { type: "boolean" },
  version: { type: "boolean", short: "v" },
} as const;

export async function runCreate(args: string[], prompter: Prompter | null = clackPrompter): Promise<number> {
  const { values, positionals } = parse(args, CREATE_OPTIONS);
  if (values.help) return print(CREATE_HELP);
  if (values.version) return print(VERSION);
  if (positionals.length > 1) throw new GroundworkError(`Expected one folder, got: ${positionals.join(" ")}`, 2);
  const list = (given: string[] | undefined) =>
    given?.flatMap((value) => value.split(",")).map((id) => id.trim()).filter(Boolean);
  const profiles = list(values.profiles);
  const interactive = !values.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;
  return create(
    {
      dir: positionals[0],
      name: values.name,
      description: values.description,
      profiles,
      agents: list(values.agents),
      yes: values.yes ?? false,
      dryRun: values["dry-run"] ?? false,
    },
    interactive ? prompter : null,
  );
}

function print(text: string): number {
  console.log(text);
  return 0;
}

function profilesCommand(args: string[]): number {
  const { values, positionals } = parse(args, { json: { type: "boolean" } });
  if (values.help) return print(HELP.profiles!);
  const project = findProject();
  const root = project?.root ?? TEMPLATE_ROOT;
  const source =
    project && !project.isBundledTemplate
      ? `${project.root}/${existsSync(join(project.root, ".groundwork", "profiles")) ? ".groundwork/profiles" : "profiles"}`
      : `Groundwork ${VERSION}`;
  if (project?.legacy) throw new GroundworkError(legacyMessage(project.root));
  const list = runEngine<ProfileList>(root, ["list"]);
  if (!list.ok) throw new GroundworkError((list.errors ?? []).map((e) => `FAIL: ${e}`).join("\n"));
  const [id] = positionals;
  let shown: Profile[] | Profile = list.profiles;
  if (id) {
    const profile = list.profiles.find((p) => p.id === id);
    if (!profile) {
      const known = list.profiles.map((p) => p.id).join(", ");
      throw new GroundworkError(`Unknown profile '${id}'. Known profiles: ${known}`);
    }
    shown = profile;
  }
  if (values.json) return print(JSON.stringify(shown, null, 2));
  return print(Array.isArray(shown) ? formatProfileList(shown, source) : formatProfile(shown, list.profiles, source));
}

/** Pass a command through to the project's own engine. */
function engineCommand(command: "init" | "add" | "config", args: string[]): number {
  const { values, positionals } = parse(args, {
    json: { type: "boolean" },
    ...(command === "config" ? {} : { "dry-run": { type: "boolean" } }),
    ...(command === "init" ? { why: { type: "string" } } : {}),
  } as const);
  if (values.help) return print(HELP[command]!);
  if (command === "init" && positionals.length === 0) {
    throw new GroundworkError("Name at least one profile, or 'none'. See: groundwork profiles", 2);
  }
  if (command === "add" && positionals.length !== 1) throw new GroundworkError("Give exactly one document path.", 2);
  if (command === "config" && positionals.length) throw new GroundworkError("config takes no arguments.", 2);
  const project = needProject(command, command !== "config" && !(values as { "dry-run"?: boolean })["dry-run"]);
  const passthrough = [
    command,
    ...positionals,
    ...((values as { why?: string }).why ? ["--why", (values as { why: string }).why] : []),
    ...((values as { "dry-run"?: boolean })["dry-run"] ? ["--dry-run"] : []),
    ...(values.json ? ["--json"] : []),
  ];
  return runScript(project.root, passthrough, "inherit").status;
}

const ONBOARDING_OPTIONS = {
  status: { json: { type: "boolean" }, brief: { type: "boolean" } },
  docs: { json: { type: "boolean" } },
  mark: {
    json: { type: "boolean" },
    "dry-run": { type: "boolean" },
    note: { type: "string" },
    source: { type: "string" },
    reopen: { type: "boolean" },
    repair: { type: "boolean" },
  },
  connect: { json: { type: "boolean" }, "dry-run": { type: "boolean" } },
} as const;

/** Pass an onboarding command through to the project's own engine. */
function onboardingCommand(command: keyof typeof ONBOARDING_OPTIONS, args: string[]): number {
  const { values, positionals } = parse(args, ONBOARDING_OPTIONS[command]);
  if (values.help) return print(HELP[command]!);
  const flags = values as Record<string, string | boolean | undefined>;
  if (command === "status" && positionals.length) throw new GroundworkError("status takes no arguments.", 2);
  if (command === "docs" && positionals.length > 1) throw new GroundworkError("Give at most one document path.", 2);
  if (command === "mark" && !flags.repair && positionals.length < 2) {
    throw new GroundworkError("Give at least one target and a state, for example: groundwork mark problem answered", 2);
  }
  const modifies = (command === "mark" || (command === "connect" && positionals.length > 0)) && !flags["dry-run"];
  const project = needProject(command, modifies);
  const passthrough: string[] = [command, ...positionals];
  for (const [key, value] of Object.entries(flags)) {
    if (key === "help" || value === undefined || value === false) continue;
    passthrough.push(value === true ? `--${key}` : `--${key}=${value}`);
  }
  return runScript(project.root, passthrough, "inherit").status;
}

function validateCommand(args: string[]): number {
  const { values, positionals } = parse(args, {
    strict: { type: "boolean" },
    "strict-coverage": { type: "boolean" },
  });
  if (values.help) return print(HELP.validate!);
  if (positionals.length) throw new GroundworkError("validate takes no arguments.", 2);
  const project = needProject("validate", false);
  const flags = [...(values.strict ? ["--strict"] : []), ...(values["strict-coverage"] ? ["--strict-coverage"] : [])];
  return runScript(project.root, ["validate", ...flags], "inherit").status;
}

export async function runGroundwork(argv: string[], prompter: Prompter | null = clackPrompter): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      if (rest[0] === "create") return print(CREATE_HELP);
      if (rest[0] && HELP[rest[0]]) return print(HELP[rest[0]]!);
      return print(MAIN_HELP);
    case "-v":
    case "--version":
      return print(VERSION);
    case "create":
      return runCreate(rest, prompter);
    case "profiles":
      return profilesCommand(rest);
    case "init":
    case "add":
    case "config":
      return engineCommand(command, rest);
    case "validate":
      return validateCommand(rest);
    case "status":
    case "docs":
    case "mark":
    case "connect":
      return onboardingCommand(command, rest);
    default:
      throw new GroundworkError(`Unknown command '${command}'.\n\n${MAIN_HELP}`, 2);
  }
}

/** Run an entry point and turn errors into messages and exit codes. */
export async function main(run: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await run();
  } catch (error) {
    if (error instanceof Cancelled) {
      console.error(error.message);
      process.exitCode = 130;
    } else if (error instanceof GroundworkError) {
      console.error(`${red("Error:")} ${error.message}`);
      process.exitCode = error.exitCode;
    } else {
      throw error;
    }
  }
}
