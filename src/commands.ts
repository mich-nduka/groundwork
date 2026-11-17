// Command parsing and dispatch for both executables.
//   create-groundwork [dir] [options]      → create
//   groundwork <command> [options]         → create | profiles | init | add | validate | config

import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import {
  findProject,
  GroundworkError,
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

Without options, a short guided setup asks for the name, description,
folder and profiles. Give everything as options to skip the questions.

Options:
  --name <name>            Project name (default: the folder name)
  --description <text>     One-line description
  --profiles <ids>         Comma-separated profile IDs, or "none" for core only
                           (see: groundwork profiles)
  -y, --yes                Don't ask anything; requires a folder and --profiles
  --dry-run                Show what would be created, write nothing
  -h, --help               Show this help
  -v, --version            Show the version

Examples:
  npx create-groundwork
  npx create-groundwork parkmate
  npx create-groundwork parkmate --profiles application,backend-api --yes

Groundwork never overwrites files: the folder must be new or empty.
Requires Python 3.9+ (the checks ship inside every project as Python scripts).`;

const MAIN_HELP = `Groundwork ${VERSION} — minimum sufficient engineering documentation,
adapted to what you're building through composable profiles.

Usage: groundwork <command> [options]

Commands:
  create [folder]          Create a new project (same as npx create-groundwork)
  profiles [id]            List profiles, or show one in detail
  init <id...> | none      Choose this project's profiles and create their documents
  add <path>               Create an optional document from its template
  validate                 Check the documentation (scripts/check_docs.py)
  config                   Show this project's Groundwork configuration

Run "groundwork <command> --help" for details. Every command except create
and profiles works inside a Groundwork project (or any folder below one).`;

const HELP: Record<string, string> = {
  profiles: `List Groundwork profiles, or show one in detail.

Usage:
  groundwork profiles            Purpose, selection guidance and dependencies of each
  groundwork profiles <id>       Everything about one profile: documents, checks, dependencies

Inside a project, the project's own profiles/ folder is used; elsewhere, the
profiles bundled with this version of Groundwork.

Options:
  --json         Print the manifests as JSON
  -h, --help     Show this help`,
  init: `Choose this project's profiles and create the documents they require.

Usage:
  groundwork init <id> [<id> ...] [--dry-run]
  groundwork init none           Groundwork Core only

Records the profiles in PROJECT.md, creates each missing required document
from its template, adds the profiles' checks to the AGENTS.md tooling table,
and lists new files in scaffold-manifest.json. Never overwrites or deletes:
run it again with a new list to add or drop a profile. Profile order does
not matter. Same as: python3 scripts/groundwork.py init

Options:
  --dry-run      Show what would change, write nothing
  --json         Print the plan as JSON
  -h, --help     Show this help`,
  add: `Create an optional document from its template, when its condition holds.

Usage:
  groundwork add <path> [--dry-run]

Example:
  groundwork add docs/ai-systems/RETRIEVAL.md

The document must belong to core or an active profile ("groundwork profiles
<id>" lists each profile's optional documents and their conditions).
Same as: python3 scripts/groundwork.py add

Options:
  --dry-run      Show what would change, write nothing
  --json         Print the result as JSON
  -h, --help     Show this help`,
  validate: `Check the project's documentation.

Usage:
  groundwork validate [--strict] [--strict-coverage]

Runs the project's own scripts/check_docs.py, so results and exit codes are
identical to running it directly (python3 scripts/check_docs.py).

Options:
  --strict            Hygiene warnings fail too
  --strict-coverage   Coverage warnings fail too (use both to fail on everything)
  -h, --help          Show this help`,
  config: `Show this project's Groundwork configuration.

Usage:
  groundwork config [--json]

Shows the project name and profiles (from PROJECT.md), the Groundwork version,
and which files Groundwork generated that have since changed or been deleted
(from .groundwork/config.json). Same as: python3 scripts/groundwork.py config`,
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
      `Not inside a Groundwork project (no scripts/check_docs.py with a Groundwork scaffold-manifest.json here or above).\n` +
        "Create one with: npx create-groundwork",
    );
  }
  if (command !== "validate" && !project.hasEngine) {
    throw new GroundworkError(
      `${project.root} predates Groundwork 3.0 profiles (no scripts/groundwork.py).\n` +
        "See MIGRATION.md in the create-groundwork package for how to upgrade it.",
    );
  }
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
  yes: { type: "boolean", short: "y" },
  "dry-run": { type: "boolean" },
  version: { type: "boolean", short: "v" },
} as const;

export async function runCreate(args: string[], prompter: Prompter | null = clackPrompter): Promise<number> {
  const { values, positionals } = parse(args, CREATE_OPTIONS);
  if (values.help) return print(CREATE_HELP);
  if (values.version) return print(VERSION);
  if (positionals.length > 1) throw new GroundworkError(`Expected one folder, got: ${positionals.join(" ")}`, 2);
  const profiles = values.profiles?.flatMap((value) => value.split(",")).map((id) => id.trim()).filter(Boolean);
  const interactive = !values.yes && process.stdin.isTTY === true && process.stdout.isTTY === true;
  return create(
    {
      dir: positionals[0],
      name: values.name,
      description: values.description,
      profiles,
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
  const source = project && !project.isBundledTemplate ? `${project.root}/profiles` : `Groundwork ${VERSION}`;
  if (project && !project.hasEngine) throw new GroundworkError(`${project.root} predates Groundwork 3.0 profiles.`);
  if (project && !project.hasJsonEngine) {
    // A Groundwork 3.0 project: show its own listing as that version prints it.
    if (positionals.length || values.json) {
      throw new GroundworkError(
        "This project's scripts/groundwork.py is from Groundwork 3.0, which can only list all profiles.\n" +
          "Run `groundwork profiles`, or copy scripts/ from a newer Groundwork (see MIGRATION.md).",
      );
    }
    return runScript(project.root, "groundwork.py", ["list"], "inherit").status;
  }
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

/** Pass a command through to the project's own groundwork.py. */
function engineCommand(command: "init" | "add" | "config", args: string[]): number {
  const { values, positionals } = parse(args, {
    json: { type: "boolean" },
    ...(command === "config" ? {} : { "dry-run": { type: "boolean" } }),
  } as const);
  if (values.help) return print(HELP[command]!);
  if (command === "init" && positionals.length === 0) {
    throw new GroundworkError("Name at least one profile, or 'none'. See: groundwork profiles", 2);
  }
  if (command === "add" && positionals.length !== 1) throw new GroundworkError("Give exactly one document path.", 2);
  if (command === "config" && positionals.length) throw new GroundworkError("config takes no arguments.", 2);
  const project = needProject(command, command !== "config" && !(values as { "dry-run"?: boolean })["dry-run"]);
  if ((command === "config" || values.json) && !project.hasJsonEngine) {
    throw new GroundworkError(
      `This project's scripts/groundwork.py is from Groundwork 3.0, which has no ${command === "config" ? "config command" : "--json output"}.\n` +
        "Copy scripts/groundwork.py and scripts/check_docs.py from a newer Groundwork to get it (see MIGRATION.md).",
    );
  }
  const passthrough = [
    command,
    ...positionals,
    ...((values as { "dry-run"?: boolean })["dry-run"] ? ["--dry-run"] : []),
    ...(values.json ? ["--json"] : []),
  ];
  return runScript(project.root, "groundwork.py", passthrough, "inherit").status;
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
  return runScript(project.root, "check_docs.py", flags, "inherit").status;
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
