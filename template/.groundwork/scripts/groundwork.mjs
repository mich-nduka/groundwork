#!/usr/bin/env node
// Set up, grow and check a Groundwork project's documents. Node.js 18+,
// standard library only: it ships inside every project, so any machine with
// Node can run it without installing anything.
//
// Commands:
//   profiles [ID]       every profile: purpose, when to use it, its documents
//                       and its checks (`list` is the same).
//   init PROFILE...     choose the active profiles (or `init none` for core
//                       only). Records them in PROJECT.md (with --why, the
//                       reason too) and adds the profiles' checks to the
//                       tooling table in AGENTS.md. It creates no documents:
//                       each one is written when the project has something to
//                       put in it (`add`). Run it again with a new list to add
//                       a profile later.
//   add PATH            create one document of core or an active profile from
//                       its template, once there is something to write in it,
//                       for example `add docs/product/PRD.md`.
//   new DEST            create a new project in DEST from this copy of
//                       Groundwork: copies the files in .groundwork/manifest.json
//                       (a handful of entry files plus .groundwork/ itself),
//                       fills in the project name, description and date, and
//                       writes .groundwork/config.json. With --profiles it also
//                       runs `init`; without, profiles are chosen later, once
//                       discovery shows what the system does.
//   config              this project's Groundwork configuration: name,
//                       profiles, version, and which recorded files changed.
//   status              where documentation onboarding stands: discovery, each
//                       document's progress, what needs confirming, and the
//                       next thing to ask. --brief prints a few lines for an
//                       agent's session-start hook.
//   docs [PATH]         every document in use with its status; with PATH, its
//                       purpose, sections and questions.
//   mark TARGET... STATE
//                       record progress in .groundwork/state.json. TARGET is a
//                       question ID, a document PATH, a section PATH#ID, or
//                       `discovery`. Add --note for the reason (required for
//                       assumed). `mark --repair` rebuilds a
//                       damaged state file, keeping every valid entry.
//   connect [AGENT...]  add thin instruction files for agents that don't read
//                       AGENTS.md by themselves (claude, gemini). Without an
//                       agent, shows which are connected.
//   validate            check the documentation (see checks.mjs).
//
// Choosing profiles is a judgement call; see .groundwork/profiles/README.md.
// This script only does the mechanical part. It never overwrites or deletes
// a file: documents that already exist are kept as they are, and documents
// of a profile you drop stay until you delete them (`validate` warns about
// them). `new` builds the project in a temporary folder next to DEST and
// moves it into place only when every step succeeded.
//
// Add --dry-run to see what would change without writing anything, and
// --json for machine-readable output (one JSON object; exit 1 on errors).
// The `groundwork` command-line tool uses that output.
//
// Profile order never matters: profiles are always recorded and applied in
// sorted order.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as docs from "./checks.mjs";
import * as ob from "./onboarding.mjs";

const { ROOT, CORE, exists, isDir, isFile, readText, splitLines, sorted, sortedObject } = docs;
const ENGINE_FILE = fileURLToPath(import.meta.url);
const CONFIG_FILE = ob.CONFIG_FILE;
const CONFIG_SCHEMA = 1;
const NAME_BULLET = /^\s*-\s*Name:\s*(.*?)\s*$/;
const WHY_BULLET = /^\s*-\s*Why:/;
// How the docs tell people to run this engine without the CLI installed.
const RUN = "node .groundwork/scripts/groundwork.mjs";

/** A problem that stops a command; the message is shown to the user. */
class Failure extends Error {}

// --- Output -----------------------------------------------------------------

const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;
const LETTER = String.raw`[\p{L}_]`;
const WORD_PUNCT = String.raw`[\p{L}\p{N}_!"'&.,?]`;
const SPACE = String.raw`[\t\n\x0b\x0c\r ]`;
const NOT_SPACE = String.raw`[^\t\n\x0b\x0c\r ]`;
// Python's textwrap word separator (break_on_hyphens=True).
const WORDSEP = new RegExp(
  `(${SPACE}+` +
    `|(?<=${WORD_PUNCT})-{2,}(?=${WORD_CHAR})` +
    `|${NOT_SPACE}+?(?:-(?:(?<=${LETTER}{2}-)|(?<=${LETTER}-${LETTER}-))(?=${LETTER}-?${LETTER})` +
    `|(?=${SPACE}|$)` +
    `|(?<=${WORD_PUNCT})(?=-{2,}${WORD_CHAR})))`,
  "u",
);

/** Python's textwrap.fill(text, width=88, initial_indent=indent,
 * subsequent_indent=indent + "  "). */
function wrap(text, indent) {
  const width = 88;
  let munged = "";
  let column = 0;
  for (const ch of text) {
    if (ch === "\t") {
      const pad = 8 - (column % 8);
      munged += " ".repeat(pad);
      column += pad;
    } else if ("\n\x0b\x0c\r".includes(ch)) {
      munged += " ";
      column = 0;
    } else {
      munged += ch;
      column += 1;
    }
  }
  const chunks = munged.split(WORDSEP).filter((chunk) => chunk);
  chunks.reverse();
  const lines = [];
  while (chunks.length) {
    const line = [];
    let length = 0;
    const lead = lines.length ? indent + "  " : indent;
    const room = width - lead.length;
    if (chunks[chunks.length - 1].trim() === "" && lines.length) chunks.pop();
    while (chunks.length) {
      const size = chunks[chunks.length - 1].length;
      if (length + size <= room) {
        line.push(chunks.pop());
        length += size;
      } else break;
    }
    if (chunks.length && chunks[chunks.length - 1].length > room) {
      const spaceLeft = room < 1 ? 1 : room - length;
      let end = spaceLeft;
      const chunk = chunks[chunks.length - 1];
      if (chunk.length > spaceLeft) {
        const hyphen = chunk.lastIndexOf("-", spaceLeft - 1);
        if (hyphen > 0 && [...chunk.slice(0, hyphen)].some((c) => c !== "-")) end = hyphen + 1;
      }
      line.push(chunk.slice(0, end));
      chunks[chunks.length - 1] = chunk.slice(end);
    }
    if (line.length && line[line.length - 1].trim() === "") {
      length -= line[line.length - 1].length;
      line.pop();
    }
    if (line.length) lines.push(lead + line.join(""));
  }
  return lines.join("\n");
}

function print(text = "") {
  console.log(text);
}

function emitJson(data) {
  console.log(JSON.stringify(data, null, 2));
  return data.ok ? 0 : 1;
}

function fail(errors, asJson, hint = "") {
  if (asJson) return emitJson({ ok: false, errors });
  for (const error of errors) print(`FAIL: ${error}`);
  if (hint) print(hint);
  return 1;
}

/** Python's json.dumps(value) with its default separators and ASCII escapes. */
function pyDumps(value) {
  if (Array.isArray(value)) return `[${value.map(pyDumps).join(", ")}]`;
  if (docs.isPlainObject(value)) {
    return `{${Object.entries(value)
      .map(([key, item]) => `${pyDumps(key)}: ${pyDumps(item)}`)
      .join(", ")}}`;
  }
  if (typeof value === "string") {
    return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  }
  return JSON.stringify(value);
}

// --- Loading ----------------------------------------------------------------

/** [valid profiles, document owners, any problems with them]. */
function load() {
  if (!isDir(docs.PROFILES_DIR)) {
    return [{}, {}, [".groundwork/profiles/: missing — this project has no Groundwork profiles to work from"]];
  }
  const [profiles, problems] = docs.loadProfiles();
  const [owners, ownershipProblems] = docs.documentOwners(profiles);
  return [profiles, owners, [...problems, ...ownershipProblems]];
}

/** `none` means no profiles; otherwise the IDs as given, by their current names. */
function normalise(requested) {
  return requested.length === 1 && requested[0].toLowerCase() === "none" ? [] : requested.map(docs.currentId);
}

function templateVersion(root = ROOT) {
  try {
    const version = docs.readJson(join(root, ".groundwork", "manifest.json")).version;
    if (version === undefined) return "unknown";
    return String(version);
  } catch {
    return "unknown";
  }
}

function unique(items) {
  return [...new Set(items)];
}

// --- Managed-file records (.groundwork/config.json) -------------------------
// The config records which files Groundwork generated and their SHA-256 at
// that moment. A recorded file whose content still matches is
// framework-managed; one that differs was changed by the project; a file that
// isn't recorded belongs to the project. A future `update` can use this to
// avoid overwriting anyone's edits. Active profiles live in PROJECT.md, not
// here, so there is one source of truth for them.

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function configPath(root = ROOT) {
  return join(root, ...CONFIG_FILE.split("/"));
}

function readConfig(root = ROOT) {
  const path = configPath(root);
  if (!isFile(path)) return null;
  let data;
  try {
    data = docs.readJson(path);
  } catch (error) {
    throw new Failure(`${CONFIG_FILE}: not valid JSON (${error.message})`);
  }
  if (!docs.isPlainObject(data) || data.schema !== CONFIG_SCHEMA || !docs.isPlainObject(data.files)) {
    throw new Failure(`${CONFIG_FILE}: not a schema ${CONFIG_SCHEMA} Groundwork config`);
  }
  return data;
}

function writeConfig(config, root = ROOT) {
  config.files = sortedObject(config.files);
  ob.writeJson(configPath(root), config);
}

/** managed (unchanged since generated), modified, user (not recorded) or missing. */
function fileStatus(path, config, root = ROOT) {
  const target = join(root, ...path.split("/"));
  if (!exists(target)) return "missing";
  const recorded = (config?.files ?? {})[path];
  if (recorded === undefined) return "user";
  return digest(target) === recorded ? "managed" : "modified";
}

/** Paths still exactly as Groundwork generated them. */
function pristine(paths, config) {
  return new Set(paths.filter((path) => fileStatus(path, config) === "managed"));
}

/** Record new files, and refresh edited files nobody else had changed. */
function record(config, created, edited, wasPristine) {
  if (config === null) return;
  for (const path of [...created, ...edited.filter((p) => wasPristine.has(p))]) {
    const target = join(ROOT, ...path.split("/"));
    if (isFile(target)) config.files[path] = digest(target);
  }
  writeConfig(config);
}

// --- Onboarding records -----------------------------------------------------
// The config also keeps a fingerprint of each section as Groundwork generated
// it, so `status` can tell template text from the project's own writing.
// .groundwork/state.json holds progress only; the documents hold the content.

/** Fingerprint documents Groundwork just wrote, and start the state file.
 *
 * Does nothing in projects without .groundwork/config.json, and leaves a
 * broken state file for `mark --repair`. */
function updateState(profiles, owners, before = null) {
  const [registry, problems] = ob.loadDefinitions(profiles, owners);
  if (problems.length) return;
  let config;
  try {
    config = readConfig();
  } catch (error) {
    if (error instanceof Failure) return;
    throw error;
  }
  if (config === null) return;
  for (const [path, text] of Object.entries(before ?? {})) {
    ob.refreshBaselines(config, registry, path, text, readText(join(ROOT, path)));
  }
  ob.addBaselines(config, registry, sorted(Object.keys(registry.documents)));
  writeConfig(config);
  const [state, stateProblems] = ob.readState();
  if (state === null && !stateProblems.length) ob.writeState(ob.emptyState());
}

// --- Small file edits shared by init and add --------------------------------

/** PROJECT.md with the `- Profiles:` line set, adding a section if needed.
 * With `why`, the `- Why:` line after it is set too (added if missing). */
function projectLines(selected, why = "") {
  const value = selected.join(", ") || "none";
  const lines = splitLines(readText(docs.PROJECT));
  for (let index = 0; index < lines.length; index++) {
    if (docs.PROFILES_BULLET.test(lines[index])) {
      lines[index] = `- Profiles: ${value}`;
      if (why) {
        const following = index + 1;
        if (following < lines.length && WHY_BULLET.test(lines[following])) lines[following] = `- Why: ${why}`;
        else lines.splice(following, 0, `- Why: ${why}`);
      }
      return lines;
    }
  }
  const section = ["## Profiles", `- Profiles: ${value}`, why ? `- Why: ${why}` : "- Why:", ""];
  let at = lines.findIndex((line) => line.trim() === "## Links");
  if (at < 0) at = lines.length;
  if (at === lines.length && lines.length && lines[lines.length - 1].trim()) section.unshift("");
  lines.splice(at, 0, ...section);
  return lines;
}

/** [AGENTS.md lines with rows appended, the rows], or null without a tooling table. */
function toolingLines(missing) {
  const lines = splitLines(readText(docs.AGENTS));
  let inside = false;
  let lastRow = null;
  let columns = 3;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.trimStart().startsWith("#")) {
      if (inside && lastRow !== null) break;
      inside = line.toLowerCase().includes("tooling");
      continue;
    }
    if (inside && docs.TABLE_LINE.test(line)) {
      if (lastRow === null) columns = docs.stripChars(line.trim(), "|").split("|").length;
      lastRow = index;
    }
  }
  if (lastRow === null) return null;
  const rows = missing.map(([profileId, check]) => `| ${check.name} (${profileId} profile) |` + " |".repeat(columns - 1));
  lines.splice(lastRow + 1, 0, ...rows);
  return [lines, rows];
}

function writeLines(path, lines) {
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
}

// --- profiles (list) --------------------------------------------------------

function cmdList(profiles, asJson) {
  const order = [CORE, ...sorted(Object.keys(profiles).filter((p) => p !== CORE))];
  if (asJson) {
    return emitJson({
      ok: true,
      groundworkVersion: templateVersion(),
      profiles: order.map((p) => ({
        ...profiles[p],
        readme: p === CORE ? ".groundwork/profiles/README.md" : `.groundwork/profiles/${p}/README.md`,
      })),
    });
  }
  for (const profileId of order) {
    const data = profiles[profileId];
    let title = `${profileId} — ${data.name}`;
    if (profileId === CORE) title += " (always active)";
    print(title);
    print(wrap(data.purpose, "  "));
    if (profileId !== CORE) {
      for (const [heading, key] of [
        ["Use when", "use_when"],
        ["Not when", "not_when"],
      ]) {
        print(`  ${heading}:`);
        for (const item of data[key]) print(wrap(`- ${item}`, "    "));
      }
      const requires = data.requires.map((entry) => (typeof entry === "string" ? entry : "one of " + entry.join(", ")));
      if (requires.length) print(`  Requires: ${requires.join("; ")}`);
      if (data.incompatible_with.length) print(`  Incompatible with: ${data.incompatible_with.join(", ")}`);
    }
    const required = data.documents.filter((doc) => doc.required).map((doc) => doc.path);
    const optional = data.documents.filter((doc) => !doc.required);
    if (required.length) {
      print("  Required documents:");
      for (const path of required) print(`    - ${path}`);
    }
    if (optional.length) {
      print("  Optional documents (create when the condition holds):");
      for (const doc of optional) print(wrap(`- ${doc.path}: ${doc.when}`, "    "));
    }
    if (data.checks?.length) {
      print("  Checks:");
      for (const check of data.checks) print(wrap(`- ${check.name}: ${check.what}`, "    "));
    }
    print();
  }
  print("Choose by what the system does, not by its technology: see .groundwork/profiles/README.md.");
  return 0;
}

// --- init -------------------------------------------------------------------

/** Everything `init` would do, decided before anything is written. */
function planInit(requested, profiles, owners) {
  const errors = docs.checkSelection(requested, profiles);
  if (errors.length) return { ok: false, errors };
  const selected = sorted(unique(requested));
  const config = readConfig();
  const active = docs.activeProfiles(selected, profiles);
  const required = docs.requiredDocuments(active, profiles);

  // Documents are listed, not created: each is written once the project has
  // something to put in it (`add`), so nothing is generated up front.
  const documents = [];
  for (const path of sorted(Object.keys(required))) {
    const owner = owners[path] ?? CORE;
    const template = docs.templateFor(owner, path);
    const present = exists(join(ROOT, path));
    if (!present && !isFile(template)) {
      errors.push(`${path}: required by core but missing, and it has no template — restore it from the Groundwork release`);
    }
    documents.push({
      path,
      owner,
      template: isFile(template) ? docs.rel(template) : null,
      requiredBy: required[path],
      exists: present,
      status: fileStatus(path, config),
      action: present ? "keep" : "pending",
    });
  }

  const missing = docs.missingChecks(active, profiles);
  const missingNames = new Set(missing.map(([, check]) => check.name.toLowerCase()));
  const checks = [];
  const seen = new Set();
  for (const profileId of active) {
    for (const check of profiles[profileId].checks ?? []) {
      if (seen.has(check.name.toLowerCase())) continue;
      seen.add(check.name.toLowerCase());
      const action = missingNames.has(check.name.toLowerCase()) ? "add-row" : "present";
      checks.push({ profile: profileId, name: check.name, what: check.what, action });
    }
  }
  const table = toolingLines(missing);

  const optional = [];
  const shown = new Set(Object.keys(required));
  for (const profileId of active) {
    if (profileId === CORE) continue;
    for (const doc of profiles[profileId].documents) {
      if (!doc.required && !shown.has(doc.path) && !exists(join(ROOT, doc.path))) {
        shown.add(doc.path);
        optional.push({ path: doc.path, owner: owners[doc.path] ?? CORE, when: doc.when });
      }
    }
  }

  return {
    ok: !errors.length,
    errors,
    profiles: selected,
    previous: docs.declaredProfiles(),
    documents,
    checks,
    toolingTable: table !== null,
    toolingRows: table ? table[1] : [],
    optional,
    inactive: docs.checkInactiveDocuments(selected, active, owners).map((w) => w.split(":")[0]),
  };
}

function applyInit(plan, profiles, owners, why = "") {
  const config = readConfig();
  const edited = ["PROJECT.md", "AGENTS.md"];
  const wasPristine = pristine(edited, config);
  const before = Object.fromEntries(edited.map((path) => [path, readText(join(ROOT, path))]));
  writeLines(docs.PROJECT, projectLines(plan.profiles));
  const toAdd = plan.checks.filter((c) => c.action === "add-row").map((c) => [c.profile, c]);
  const table = toAdd.length ? toolingLines(toAdd) : null;
  if (table) writeLines(docs.AGENTS, table[0]);
  record(config, [], edited, wasPristine);
  updateState(profiles, owners, before);
  if (why) {
    // The reason is the developer's own words, written after the template
    // fingerprint has moved past Groundwork's edit, so `status` sees the
    // Profiles section as written rather than as template text.
    writeLines(docs.PROJECT, projectLines(plan.profiles, why));
    // A file nobody else had changed stays recorded as Groundwork's.
    record(readConfig(), [], ["PROJECT.md"], wasPristine);
  }
}

function reportInit(plan, dryRun, hasWhy = false) {
  const say = (done, would) => (dryRun ? would : done);
  const previous = plan.previous;
  const before = previous === null ? "not chosen yet" : previous.join(", ") || "none";
  const pending = plan.documents.filter((d) => d.action === "pending").map((d) => d.path);
  print(dryRun ? "Dry run — nothing written." : "Done.");
  print(`Profiles: ${plan.profiles.join(", ") || "none (core only)"}  (before: ${before})`);
  if (pending.length) {
    print("Documents still to write — each is created once there is something to put in it");
    print("(`groundwork status` says what's next; `groundwork add PATH` creates one):");
    for (const path of pending) print(`  - ${path}`);
  }
  const addedChecks = plan.checks.filter((c) => c.action === "add-row");
  if (addedChecks.length && !plan.toolingTable) {
    print("No tooling table found in AGENTS.md. Add a row for each of these checks:");
    for (const check of addedChecks) print(wrap(`- ${check.name} (${check.profile}): ${check.what}`, "  "));
  } else if (plan.toolingRows.length) {
    print(say("Added", "Would add") + " rows to the tooling table in AGENTS.md (fill in the tool):");
    for (const row of plan.toolingRows) print(`  ${row}`);
  }
  if (plan.optional.length) {
    print("Optional documents — add one only when its condition holds:");
    for (const doc of plan.optional) print(wrap(`- ${doc.path}: ${doc.when}`, "  "));
  }
  if (plan.inactive.length) {
    print("Documents from profiles that are no longer active (kept; delete them if unused):");
    for (const path of plan.inactive) print(`  - ${path}`);
  }
  if (hasWhy) {
    print("Next: read each profile's README in .groundwork/profiles/.");
  } else {
    print("Next: write why these profiles fit under '- Why:' in PROJECT.md (or pass --why),");
    print("and read each profile's README in .groundwork/profiles/.");
  }
}

function cmdInit(requested, why, profiles, owners, dryRun, asJson) {
  let plan = planInit(normalise(requested), profiles, owners);
  why = why.split(/\s+/).filter(Boolean).join(" ");
  if (why && (why.includes("{{") || why.includes("}}"))) {
    plan = { ...plan, ok: false, errors: [...(plan.errors ?? []), "--why must not contain '{{' or '}}'"] };
  }
  if (!plan.ok) return fail(plan.errors, asJson, `Run \`${RUN} profiles\` to see the profiles.`);
  if (!dryRun) applyInit(plan, profiles, owners, why);
  if (asJson) return emitJson({ ...plan, why, dryRun });
  reportInit(plan, dryRun, Boolean(why));
  return 0;
}

// --- add --------------------------------------------------------------------

function normalisePath(path) {
  path = path.split("\\").join("/").replace(/\/+/g, "/");
  while (path.startsWith("./")) path = path.slice(2);
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

/** `add PATH` creates a document from its template, leaving out the parts no
 * active profile needs. On a document that exists, it adds the parts the
 * active profiles need and it lacks; `add PATH#SECTION` adds one part. */
function cmdAdd(path, profiles, owners, dryRun, asJson) {
  let sectionId = null;
  if (path.includes("#")) {
    sectionId = path.slice(path.indexOf("#") + 1);
    path = path.slice(0, path.indexOf("#"));
  }
  path = normalisePath(path);
  const active = docs.activeProfiles(docs.declaredProfiles(), profiles);
  const listedBy = active.filter((p) => profiles[p].documents.some((doc) => doc.path === path));
  const owner = owners[path];
  if (owner === undefined) {
    return fail([`${path}: no profile has this document — run \`${RUN} profiles\``], asJson);
  }
  if (!listedBy.length) {
    return fail(
      [`${path}: belongs to the ${owner} profile, which PROJECT.md does not list — run \`${RUN} init\` with ${owner} added first`],
      asJson,
    );
  }
  const template = docs.templateFor(owner, path);
  if (!isFile(template)) {
    return fail(
      [`${path}: every project starts with this document, so it has no template — restore it from the Groundwork release`],
      asJson,
    );
  }
  const [registry, problems] = ob.loadDefinitions(profiles, owners);
  if (problems.length) return fail(problems, asJson, `Fix the onboarding definitions first: ${RUN} validate`);
  const definition = registry.documents[path];
  let wanted = null;
  if (sectionId !== null) {
    wanted = (definition?.sections ?? []).find((s) => s.id === sectionId);
    if (wanted === undefined) {
      const ids = (definition?.sections ?? []).map((s) => s.id);
      return fail([`${path}#${sectionId}: unknown section — ${path} has: ${ids.join(", ") || "none"}`], asJson);
    }
  }
  const [needed, other] = ob.optionalParts(registry, path, active);
  const source = docs.rel(template);
  const templateText = readText(template);
  const target = join(ROOT, ...path.split("/"));
  const result = { ok: true, path, owner, dryRun, template: source };

  if (!exists(target)) {
    const leftOut = other.filter((s) => s !== wanted);
    if (!dryRun) {
      const config = readConfig();
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, leftOut.length ? ob.removeSections(templateText, leftOut) : templateText, "utf8");
      record(config, [path], [], new Set());
      updateState(profiles, owners);
    }
    const omitted = leftOut.map((s) => s.heading);
    if (asJson) return emitJson({ ...result, action: "create", omitted });
    print(`${dryRun ? "Would create" : "Created"} ${path} from ${source}`);
    if (omitted.length) {
      print(wrap(`Left out, as no active profile needs them: ${omitted.join(", ")}. Add one with \`groundwork add ${path}#SECTION\` if it applies.`, "  "));
    }
    return 0;
  }

  const text = readText(target);
  const missing = (wanted ? [wanted] : needed).filter((s) => !ob.hasSection(text, s));
  if (!missing.length) {
    if (asJson) return emitJson({ ...result, action: "keep", added: [] });
    print(wanted ? `${path}: already has '${wanted.heading}' — nothing to do` : `${path}: already exists — nothing to do`);
    return 0;
  }
  const added = missing.map((s) => s.heading);
  if (!dryRun) {
    const config = readConfig();
    const wasPristine = pristine([path], config);
    writeFileSync(target, ob.insertSections(text, templateText, missing), "utf8");
    record(config, [], [path], wasPristine);
    updateState(profiles, owners);
  }
  if (asJson) return emitJson({ ...result, action: "add-parts", added });
  print(wrap(`${dryRun ? "Would add" : "Added"} to ${path} from ${source}: ${added.join(", ")}`, ""));
  return 0;
}

// --- new --------------------------------------------------------------------

// The Why line when profiles are given to create-groundwork: a fact, not an
// invented reason. The developer or the agent can replace it later.
const PROFILES_UP_FRONT = "Chosen when the project was created, before discovery.";

function checkText(value, label, limit, required) {
  if (required && !value.trim()) return [`${label} is required`];
  if (value.includes("\n") || value.includes("\r")) return [`${label} must be one line`];
  if ([...value].length > limit) return [`${label} must be at most ${limit} characters`];
  if (value.includes("{{") || value.includes("}}")) return [`${label} must not contain '{{' or '}}'`];
  return [];
}

/** Fill in {{PLACEHOLDER}}s; lines that held one lose trailing spaces. */
function render(text, values) {
  return text
    .split("\n")
    .map((line) => {
      if (!line.includes("{{")) return line;
      for (const [key, value] of Object.entries(values)) line = line.split(`{{${key}}}`).join(value);
      return line.trimEnd();
    })
    .join("\n");
}

function isInside(path, parent) {
  const r = relative(parent, path);
  return r === "" || (!r.startsWith("..") && !r.startsWith(sep) && !/^[A-Za-z]:/.test(r));
}

/** npm packages can't contain `.gitignore` files, so the npm package of
 * Groundwork ships `_gitignore` instead; `new` restores the real name. */
function packagedName(path) {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = path.slice(slash + 1);
  if (!name.startsWith(".")) return path;
  return folder ? `${folder}/_${name.slice(1)}` : `_${name.slice(1)}`;
}

/** Copy every manifest file into staging; returns {path: sha256}. */
function copyTemplate(staging, values) {
  const manifest = docs.readJson(docs.MANIFEST);
  const hashes = {};
  for (const path of manifest.files) {
    let source = join(ROOT, ...path.split("/"));
    const target = join(staging, ...path.split("/"));
    if (!isFile(source)) source = join(ROOT, ...packagedName(path).split("/"));
    if (!isFile(source)) throw new Failure(`${path}: listed in this Groundwork's manifest but missing — the template is incomplete`);
    mkdirSync(dirname(target), { recursive: true });
    if (path.endsWith(".md")) writeFileSync(target, render(readText(source), values), "utf8");
    else copyFileSync(source, target);
    chmodSync(target, statSync(source).mode & 0o7777);
    hashes[path] = digest(target);
  }
  return hashes;
}

/** Files a new project shows outside Groundwork's own .groundwork/ folder. */
function visibleFiles(hashes) {
  return sorted(Object.keys(hashes).filter((path) => !path.startsWith(".groundwork/")));
}

/** Run a command of the engine in a new project's staging folder. */
function runIn(engine, args) {
  return spawnSync(process.execPath, [engine, ...args], { encoding: "utf8" });
}

function cmdNew(dest, name, description, requested, agentArgs, dryRun, asJson) {
  const [profiles, , problems] = load();
  if (problems.length) return fail(problems, asJson);
  const target = resolve(dest.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  name = (name || basename(target)).trim();
  description = description.trim();
  const requestedRaw = [...requested];
  requested = normalise(requested);
  const selected = sorted(unique(requested));
  const errors = [...checkText(name, "Project name", 100, true), ...checkText(description, "Description", 300, false)];
  errors.push(...docs.checkSelection(requested, profiles));
  const agents = sorted(
    unique(
      agentArgs.flatMap((agent) =>
        agent
          .split(",")
          .filter((a) => a.trim())
          .map((a) => a.trim().toLowerCase()),
      ),
    ),
  );
  errors.push(...agents.filter((a) => !(a in ADAPTERS)).map((a) => `unknown agent '${a}' — available: ${Object.keys(ADAPTERS).join(", ")}`));
  if (exists(target) && (!isDir(target) || readdirSync(target).length)) {
    errors.push(`${target}: already exists and is not empty — choose a new or empty folder`);
  }
  if (isInside(target, ROOT)) errors.push(`${target}: is inside this copy of Groundwork — choose a folder outside ${ROOT}`);
  if (!isDir(dirname(target))) errors.push(`${dirname(target)}: does not exist — create it first, or choose another folder`);
  if (errors.length) return fail(errors, asJson);

  const staging = join(dirname(target), `.${basename(target)}.groundwork-${process.pid}`);
  const today = ob.today();
  const values = { PROJECT_NAME: name, PROJECT_DESCRIPTION: description, PROJECT_DATE: today };
  const version = templateVersion();
  try {
    mkdirSync(staging);
  } catch (error) {
    return fail([`${staging}: cannot create a staging folder (${error.message})`], asJson);
  }
  let hashes = {};
  let plan = null;
  try {
    hashes = copyTemplate(staging, values);
    writeConfig({ schema: CONFIG_SCHEMA, groundworkVersion: version, generatedAt: today, files: hashes }, staging);
    const engine = join(staging, relative(ROOT, ENGINE_FILE));
    if (requestedRaw.length) {
      // Profiles given up front (`--profiles`, `--profiles none`) are
      // recorded now; otherwise they are chosen after discovery.
      const args = ["init", ...(selected.length ? selected : ["none"]), "--why", PROFILES_UP_FRONT, "--json"];
      const result = runIn(engine, [...args, ...(dryRun ? ["--dry-run"] : [])]);
      try {
        plan = JSON.parse(result.stdout);
      } catch {
        throw new Failure(`init failed in the new project: ${(result.stderr || result.stdout).trim()}`);
      }
      if (!plan.ok) throw new Failure((plan.errors?.length ? plan.errors : ["init failed in the new project"]).join("; "));
    } else if (!dryRun) {
      // Fingerprint the starting documents and start the state file.
      const result = runIn(engine, ["setup"]);
      if (result.status !== 0) {
        throw new Failure(`setting up onboarding failed in the new project: ${(result.stderr || result.stdout).trim()}`);
      }
    }
    // What the developer already told create-groundwork counts as answered,
    // so the agent doesn't ask it again.
    const marks = [];
    if (description) marks.push(["what_building", "answered", "--note", "Description given to create-groundwork"]);
    if (requestedRaw.length) marks.push(["profile_fit", "confirmed", "--note", "Profiles chosen when the project was created"]);
    for (const markArgs of dryRun ? [] : marks) {
      const result = runIn(engine, ["mark", ...markArgs, "--setup", "--json"]);
      if (result.status !== 0) {
        throw new Failure(`recording onboarding state failed in the new project: ${(result.stderr || result.stdout).trim()}`);
      }
    }
    if (agents.length && !dryRun) {
      const result = runIn(engine, ["connect", ...agents, "--json"]);
      if (result.status !== 0) {
        throw new Failure(`connecting agents failed in the new project: ${(result.stderr || result.stdout).trim()}`);
      }
    }
    if (!dryRun) {
      if (exists(target)) rmdirSync(target); // checked above: an empty folder
      renameSync(staging, target);
    }
  } catch (error) {
    if (error instanceof Failure || error.code) return fail([String(error.message)], asJson);
    throw error;
  } finally {
    if (exists(staging)) rmSync(staging, { recursive: true, force: true });
  }

  const summary = {
    ok: true,
    dryRun,
    destination: target,
    name,
    description,
    groundworkVersion: version,
    files: Object.keys(hashes).length,
    visibleFiles: visibleFiles(hashes),
    agents,
    init: plan,
  };
  if (asJson) return emitJson(summary);
  print(`${dryRun ? "Dry run — nothing written. Would create" : "Created"} ${name} in ${target}`);
  const profileText = plan === null ? "chosen after discovery" : selected.join(", ") || "none (core only)";
  const visible = visibleFiles(hashes);
  print(`Groundwork ${version}: ${Object.keys(hashes).length} files, ${visible.length} of them outside .groundwork/; profiles: ${profileText}`);
  for (const path of visible) print(`  + ${path}`);
  if (agents.length) print(`Agent adapters: ${agents.join(", ")}`);
  if (!dryRun) {
    print(`Next: open ${target} with your AI coding agent. It asks about the project first, and`);
    print("writes each document only once you've given it something to put there.");
    print(`Without an agent: ${RUN} status`);
  }
  return 0;
}

// --- config -----------------------------------------------------------------

function projectName() {
  for (const line of splitLines(readText(docs.PROJECT))) {
    const match = line.match(NAME_BULLET);
    if (match) return match[1].startsWith("{{") || match[1].startsWith("[") ? "" : match[1];
  }
  return "";
}

function cmdConfig(asJson) {
  let config;
  try {
    config = readConfig();
  } catch (error) {
    if (error instanceof Failure) return fail([error.message], asJson);
    throw error;
  }
  const name = projectName();
  const selected = docs.declaredProfiles();
  const statuses = { managed: [], modified: [], missing: [] };
  for (const path of sorted(Object.keys(config?.files ?? {}))) statuses[fileStatus(path, config)].push(path);
  const data = {
    ok: true,
    root: ROOT,
    name,
    profiles: selected,
    templateVersion: templateVersion(),
    autonomy: ob.readAutonomy()[0],
    stateFile: isFile(ob.statePath()) ? ob.STATE_FILE : null,
    config:
      config === null
        ? null
        : {
            path: CONFIG_FILE,
            groundworkVersion: config.groundworkVersion ?? null,
            generatedAt: config.generatedAt ?? null,
            files: statuses,
          },
  };
  if (asJson) return emitJson(data);
  print(`Project: ${name || "(no name in PROJECT.md)"}`);
  print(`Folder: ${ROOT}`);
  print(`Profiles: ${profilesText(selected)}  (from PROJECT.md)`);
  print(`Groundwork version: ${templateVersion()}  (from .groundwork/manifest.json)`);
  print(`Agent autonomy: ${data.autonomy}  (from GROUNDWORK.md)`);
  if (config === null) {
    print(`No ${CONFIG_FILE}: this project predates Groundwork 3.1, so no files are recorded as managed.`);
    return 0;
  }
  print(`Generated: ${config.generatedAt ?? "None"} with Groundwork ${config.groundworkVersion ?? "None"}`);
  print(
    `Recorded files: ${statuses.managed.length} unchanged, ` +
      `${statuses.modified.length} changed by the project, ${statuses.missing.length} deleted`,
  );
  for (const [label, mark] of [
    ["modified", "~"],
    ["missing", "-"],
  ]) {
    for (const path of statuses[label]) print(`  ${mark} ${path}`);
  }
  return 0;
}

// --- status and docs --------------------------------------------------------

const STATUS_WORDS = {
  complete: "complete",
  "in-progress": "in progress",
  "not-started": "not started",
  missing: "missing",
  pending: "not written yet",
  available: "not created",
  untracked: "no onboarding definition",
  deferred: "deferred",
  not_applicable: "not applicable",
};

/** The full onboarding report, with every problem met on the way as a
 * warning: status keeps working with a broken state file or definition. */
function gather() {
  const [profiles, owners, problems] = load();
  if (problems.length) throw new Failure(problems.join("; "));
  const [registry, warnings] = ob.loadDefinitions(profiles, owners);
  let [state, stateProblems] = ob.readState();
  if (stateProblems.length) {
    warnings.push(...stateProblems.map((p) => `${p} — showing progress from the documents alone; run \`groundwork mark --repair\``));
  } else if (state !== null) {
    const [errors, stale] = ob.validateState(state, registry, owners);
    if (errors.length) {
      warnings.push(...errors, "state file has invalid entries — ignoring them; run `groundwork mark --repair`");
      state = ob.repairState(state, registry, owners)[0];
    }
    warnings.push(...stale);
  }
  const [autonomy, autonomyProblem] = ob.readAutonomy();
  if (autonomyProblem) warnings.push(autonomyProblem);
  const report = ob.buildStatus(profiles, owners, registry, state, docs.declaredProfiles());
  return {
    ...report,
    ok: true,
    name: projectName(),
    autonomy,
    stateFile: state !== null ? ob.STATE_FILE : null,
    groundworkVersion: templateVersion(),
    warnings,
  };
}

function countsText(report) {
  const order = ["complete", "in-progress", "not-started", "pending", "missing", "untracked", "deferred", "not_applicable"];
  return order.filter((k) => report.counts[k]).map((k) => `${report.counts[k]} ${STATUS_WORDS[k]}`).join(", ") || "none";
}

function discoveryText(report) {
  const text = {
    "not-started": "not started",
    "in-progress": "in progress",
    complete: "complete",
    declined: "declined by the developer",
  }[report.discovery];
  return text + (report.discoveryNote ? ` (${report.discoveryNote})` : "");
}

function profilesText(selected) {
  return selected === null ? "not chosen yet" : selected.join(", ") || "none (core only)";
}

function printQuestion(question, indent) {
  print(wrap(`? ${question.id}: ${question.ask}`, indent));
  if (question.why) print(wrap(`why: ${question.why}`, indent + "    "));
  if (question.explain) print(wrap(`explain: ${question.explain}`, indent + "    "));
  if (question.examples?.length) print(wrap("examples: " + question.examples.join("; "), indent + "    "));
  if (question.appliesWhen) print(wrap(`only when: ${question.appliesWhen}`, indent + "    "));
  if (question.confirm) print(`${indent}    needs explicit confirmation`);
}

function cmdStatus(brief, asJson) {
  let report;
  try {
    report = gather();
  } catch (error) {
    if (error instanceof Failure) return fail([error.message], asJson);
    throw error;
  }
  if (asJson) return emitJson(report);
  const inUse = report.documents.filter((d) => d.status !== "available");
  const focus = report.focus;
  if (brief) {
    print(`Groundwork: discovery ${discoveryText(report)}; profiles ${profilesText(report.profiles)}; autonomy ${report.autonomy}.`);
    for (const step of report.steps) print(`- ${step.text}`);
    if (report.discovery === "not-started") {
      print(
        "- Onboarding hasn't started: before other work, offer the developer guided discovery as GROUNDWORK.md describes. If they decline, run `groundwork mark discovery declined`.",
      );
    }
    if (focus) {
      let detail = focus.status === "review" ? "it already has content: review it before asking" : `${focus.questions.length} question(s) to ask`;
      if (!focus.exists) detail += "; not written yet — create it with `groundwork add` once you have answers";
      print(`- Next: ${focus.document} — ${focus.heading} (${detail}).`);
    }
    if (report.attention.length) print(`- ${report.attention.length} item(s) need confirmation or review.`);
    for (const warning of report.warnings) print(`- Warning: ${warning}`);
    print(`Follow GROUNDWORK.md. Details: \`groundwork status\` (or \`${RUN} status\`).`);
    return 0;
  }

  print(`Groundwork — ${report.name || "(no name in PROJECT.md)"}`);
  print(`Profiles: ${profilesText(report.profiles)}    Autonomy: ${report.autonomy} (GROUNDWORK.md)`);
  print(`Discovery: ${discoveryText(report)}`);
  print(`Documents in use (${inUse.length}): ${countsText(report)}`);
  for (const step of report.steps) print(wrap(`! ${step.text}`, ""));
  print();
  if (focus) {
    print(`Next: ${focus.document} — ${focus.heading}`);
    if (!focus.exists) {
      print(wrap(`Not written yet: ask first, then create it with \`groundwork add ${focus.document}\` and write the answers in.`, "  "));
    }
    if (focus.purpose) print(wrap(`Document: ${focus.purpose}`, "  "));
    if (focus.doneWhen) print(wrap(`Done when: ${focus.doneWhen}`, "  "));
    if (focus.uses.length) print(wrap("Builds on answers to: " + focus.uses.join(", ") + " (don't ask again)", "  "));
    for (const question of focus.questions) printQuestion(question, "  ");
    if (!focus.questions.length) print("  Its questions are settled: write or review the section.");
  } else if (report.discovery === "declined") {
    print("Discovery was declined: work from what's available, and raise documentation gaps only when they affect the task.");
  } else {
    print("No onboarding step is waiting. Keep the documents in step with the work as it changes.");
  }
  if (report.attention.length) {
    print("\nNeeds attention:");
    for (const item of report.attention) print(wrap(`! ${item.kind}: ${item.target} — ${item.text}`, "  "));
  }
  if (report.open.length) {
    print("\nDeferred, to come back to:");
    for (const item of report.open) {
      const note = item.note ? ` — ${item.note}` : "";
      print(wrap(`~ ${item.state}: ${item.target}${note}`, "  "));
    }
  }
  if (report.later.length) {
    print(`\nLater, when the work reaches them: ${report.later.length} document(s) — \`groundwork docs\` lists them.`);
  }
  if (report.available.length && ["not-started", "in-progress"].includes(report.discovery)) {
    // Not relevant while discovery is under way: a count, not a list.
    print(`\n${report.available.length} optional document(s) for later — \`groundwork docs\` lists them.`);
  } else if (report.available.length) {
    print("\nOptional documents, for when their condition holds (`groundwork add PATH`):");
    for (const doc of report.available) print(wrap(`- ${doc.path}: ${doc.when}`, "  "));
  }
  for (const warning of report.warnings) print(wrap(`WARN: ${warning}`, ""));
  return 0;
}

function cmdDocs(path, asJson) {
  let report;
  try {
    report = gather();
  } catch (error) {
    if (error instanceof Failure) return fail([error.message], asJson);
    throw error;
  }
  if (path === null) {
    if (asJson) return emitJson({ ok: true, documents: report.documents, warnings: report.warnings });
    print(`${"STATUS".padEnd(17)} ${"STAGE".padEnd(10)} ${"SECTIONS".padEnd(9)} DOCUMENT`);
    for (const doc of report.documents) {
      const done = doc.sections.filter((s) => ob.CLOSED_SECTION.has(s.status)).length;
      const sections = doc.sections.length ? `${done}/${doc.sections.length}` : "-";
      const kind = doc.required ? "" : "  (optional)";
      print(`${(STATUS_WORDS[doc.status] ?? doc.status).padEnd(17)} ${doc.stage.padEnd(10)} ${sections.padEnd(9)} ${doc.path}${kind}`);
    }
    for (const warning of report.warnings) print(wrap(`WARN: ${warning}`, ""));
    return 0;
  }
  path = normalisePath(path);
  const doc = report.documents.find((d) => d.path === path);
  if (doc === undefined) return fail([`${path}: not a document of the active profiles — \`groundwork docs\` lists them`], asJson);
  if (asJson) return emitJson({ ...doc, ok: true });
  print(`${doc.path} — ${STATUS_WORDS[doc.status] ?? doc.status}`);
  const owner = `owner: ${doc.owner}; ` + (doc.required ? "required by " + doc.requiredBy.join(", ") : "optional");
  print(`  ${owner}; stage: ${doc.stage}`);
  for (const [label, key] of [
    ["Purpose", "purpose"],
    ["When", "when"],
    ["If deferred", "skip"],
    ["Note", "note"],
  ]) {
    if (doc[key]) print(wrap(`${label}: ${doc[key]}`, "  "));
  }
  if (doc.dependsOn.length) print(`  Depends on: ${doc.dependsOn.join(", ")}`);
  for (const section of doc.sections) {
    let flag = section.required ? "required" : "optional";
    if (section.neededBy.length) flag = `needed by ${section.neededBy.join(", ")}`;
    print(`\n  #${section.id}  ${section.heading}  [${section.status}; ${flag}; content: ${section.content}]`);
    for (const [label, key] of [
      ["done when", "doneWhen"],
      ["applies when", "appliesWhen"],
      ["note", "note"],
    ]) {
      if (section[key]) print(wrap(`${label}: ${section[key]}`, "    "));
    }
    if (section.uses.length) print(wrap("uses answers to: " + section.uses.join(", "), "    "));
    for (const question of section.questions) {
      const note = question.note ? ` — ${question.note}` : "";
      print(wrap(`[${question.state}] ${question.id}: ${question.ask}${note}`, "    "));
    }
  }
  if (doc.addable.length) {
    print(`\n  Parts no active profile needs; add one when it applies (\`groundwork add ${doc.path}#ID\`):`);
    for (const part of doc.addable) {
      print(wrap(`#${part.id}  ${part.heading}` + (part.appliesWhen ? ` — ${part.appliesWhen}` : ""), "    "));
    }
  }
  return 0;
}

// --- mark -------------------------------------------------------------------

/** [kind, key, section] for a target, or throw a Failure explaining why it
 * can't take the value. */
function resolveTarget(target, value, registry, owners, profiles) {
  const clear = value === "clear" || value === "unasked";
  if (target === "discovery") {
    if (![...ob.DISCOVERY_STATES, "clear"].includes(value)) {
      throw new Failure(`discovery: use ${ob.DISCOVERY_STATES.join(", ")} or clear`);
    }
    return ["discovery", target, null];
  }
  if (target.includes("#")) {
    const at = target.indexOf("#");
    const path = normalisePath(target.slice(0, at));
    const sectionId = target.slice(at + 1);
    const sections = new Set((registry.documents[path]?.sections ?? []).map((s) => s.id));
    if (!sections.has(sectionId)) {
      throw new Failure(`${target}: unknown section — ${path} has: ${sorted(sections).join(", ") || "none"}`);
    }
    if (!clear && !ob.STATES.includes(value)) throw new Failure(`${target}: use one of ${ob.STATES.join(", ")} or clear`);
    return ["section", path, sectionId];
  }
  const path = normalisePath(target);
  if (path in owners) {
    if (!clear && !ob.DOCUMENT_STATES.includes(value)) {
      throw new Failure(
        `${path}: a document can be ${ob.DOCUMENT_STATES.join(", ")} or clear; record answers on its questions or sections`,
      );
    }
    const active = docs.activeProfiles(docs.declaredProfiles(), profiles);
    const neededBy = docs.requiredDocuments(active, profiles)[path];
    if (value === "not_applicable" && neededBy) {
      throw new Failure(
        `${path}: required by ${neededBy.join(", ")}, so it can't be not applicable — mark it deferred, or change the profiles if it truly doesn't apply`,
      );
    }
    return ["document", path, null];
  }
  if (target in registry.questions) {
    if (!clear && !ob.STATES.includes(value)) throw new Failure(`${target}: use one of ${ob.STATES.join(", ")} or clear`);
    return ["question", target, null];
  }
  throw new Failure(`${target}: not a question ID, document path, section (PATH#ID) or \`discovery\` — see \`groundwork docs PATH\``);
}

function cmdMark(args, note, source, reopen, repair, dryRun, asJson, setup = false) {
  const [profiles, owners, problems] = load();
  if (problems.length) return fail(problems, asJson);
  const [registry, definitionProblems] = ob.loadDefinitions(profiles, owners);
  if (definitionProblems.length) {
    return fail(definitionProblems, asJson, `Fix the onboarding definitions first: ${RUN} validate`);
  }
  let [state, stateProblems] = ob.readState();
  let invalid = [];
  if (state !== null) invalid = ob.validateState(state, registry, owners)[0];

  if (repair) {
    if (args.length) return fail(["mark --repair takes no targets"], asJson);
    let backup = null;
    const [fresh, dropped] = ob.repairState(state, registry, owners);
    if (isFile(ob.statePath()) && (stateProblems.length || dropped.length)) {
      backup = `${ob.STATE_FILE}.bak-${ob.today()}`;
      if (!dryRun) copyFileSync(ob.statePath(), join(ROOT, ...backup.split("/")));
    }
    if (!dryRun) ob.writeState(fresh);
    const result = { ok: true, dryRun, dropped, backup, unreadable: stateProblems };
    if (asJson) return emitJson(result);
    print((dryRun ? "Dry run — would rebuild " : "Rebuilt ") + ob.STATE_FILE);
    for (const problem of stateProblems) print(`  unreadable: ${problem}; progress is recovered from the documents`);
    for (const item of dropped) print(`  dropped: ${item}`);
    if (backup) print(`  the old file is kept as ${backup}`);
    return 0;
  }

  if (stateProblems.length || invalid.length) {
    return fail([...stateProblems, ...invalid], asJson, "Run `groundwork mark --repair` to rebuild the state file, keeping every valid entry.");
  }
  if (args.length < 2) return fail(["mark needs at least one TARGET and a STATE, for example: mark problem answered"], asJson);
  const targets = args.slice(0, -1);
  let value = args[args.length - 1];
  // Older names for deferred still work, and keep their meaning in the note.
  if (value in ob.LEGACY_STATES) {
    ({ state: value, note } = ob.upgradeEntry({ state: value, note }));
  }
  if (source && !ob.SOURCES.includes(source)) return fail([`--source must be one of ${ob.SOURCES.join(", ")}`], asJson);
  if (ob.NEEDS_NOTE.has(value) && !note.trim()) {
    return fail(
      [`${value} needs --note: ` + (value === "assumed" ? "the assumption, in one sentence" : "what it is waiting on")],
      asJson,
    );
  }
  state = state ?? ob.emptyState();
  const errors = [];
  const changes = [];
  for (const target of targets) {
    let kind, key, section;
    try {
      [kind, key, section] = resolveTarget(target, value, registry, owners, profiles);
    } catch (error) {
      if (!(error instanceof Failure)) throw error;
      errors.push(error.message);
      continue;
    }
    let current;
    if (kind === "discovery") current = state.discovery?.state;
    else if (kind === "question") current = state.questions[key]?.state;
    else if (kind === "section") current = state.documents[key]?.sections?.[section]?.state;
    else current = state.documents[key]?.state;
    if (current === "confirmed" && ["assumed", "unasked", "clear"].includes(value) && !reopen) {
      errors.push(`${target}: confirmed by the developer — pass --reopen only if they asked to revisit it`);
      continue;
    }
    changes.push([kind, key, section, target, current ?? null]);
  }
  if (errors.length) return fail(errors, asJson);

  for (const [kind, key, section] of changes) {
    let entry = null;
    if (value !== "clear" && value !== "unasked") {
      entry = { state: value, updated: ob.today() };
      if (note.trim()) entry.note = note.trim();
      const chosen = source || { assumed: "agent", answered: "developer", confirmed: "developer" }[value];
      if (chosen && (kind === "question" || kind === "section")) entry.source = chosen;
      if (setup) entry.setup = true;
    }
    if (kind === "discovery") {
      if (entry) state.discovery = entry;
      else delete state.discovery;
    } else if (kind === "question") {
      if (entry) state.questions[key] = entry;
      else delete state.questions[key];
    } else {
      const document = (state.documents[key] ??= {});
      if (kind === "section") {
        const sections = (document.sections ??= {});
        if (entry) sections[section] = entry;
        else {
          delete sections[section];
          if (!Object.keys(sections).length) delete document.sections;
        }
      } else {
        for (const field of ["state", "note", "updated"]) delete document[field];
        if (entry) for (const field of ["state", "note", "updated"]) if (field in entry) document[field] = entry[field];
      }
      if (!Object.keys(document).length) delete state.documents[key];
    }
  }
  if (!dryRun) ob.writeState(state);
  const result = {
    ok: true,
    dryRun,
    state: value,
    note: note.trim() || null,
    changes: changes.map(([kind, , , target, current]) => ({ target, kind, before: current || "unasked", after: value })),
  };
  if (asJson) return emitJson(result);
  for (const change of result.changes) {
    print(
      `${dryRun ? "Would record" : "Recorded"}: ${change.target}: ${change.before} -> ${value}` +
        (result.note ? ` (${result.note})` : ""),
    );
  }
  return 0;
}

// --- connect ----------------------------------------------------------------
// Thin adapters for agents that don't read AGENTS.md on their own. Each only
// points at AGENTS.md (or runs `status --brief`); none copies the workflow.

const CLAUDE_MD = `# Claude Code

@AGENTS.md

This file only imports \`AGENTS.md\`, which holds this project's instructions and points to \`GROUNDWORK.md\`. Keep shared rules there; add Claude-specific notes below.
`;

const CLAUDE_SETTINGS = {
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: 'node "$CLAUDE_PROJECT_DIR/.groundwork/scripts/groundwork.mjs" status --brief',
          },
        ],
      },
    ],
  },
};

const GEMINI_SETTINGS = { context: { fileName: ["AGENTS.md", "GEMINI.md"] } };

const ADAPTERS = {
  claude: {
    name: "Claude Code",
    files: [
      ["CLAUDE.md", CLAUDE_MD, "@AGENTS.md", "add a line `@AGENTS.md` to it"],
      [
        ".claude/settings.json",
        JSON.stringify(CLAUDE_SETTINGS, null, 2) + "\n",
        "groundwork.mjs",
        "add this SessionStart hook to it: " + pyDumps(CLAUDE_SETTINGS.hooks.SessionStart[0]),
      ],
    ],
    note: "Claude Code reads CLAUDE.md; the session-start hook shows the onboarding status at the start of every session.",
  },
  gemini: {
    name: "Gemini CLI",
    files: [[".gemini/settings.json", JSON.stringify(GEMINI_SETTINGS, null, 2) + "\n", "AGENTS.md", 'add "AGENTS.md" to "context.fileName" in it']],
    note: "Gemini CLI reads GEMINI.md by default; this setting makes it read AGENTS.md too.",
  },
};
const NATIVE = "Codex, Cursor, GitHub Copilot, Windsurf, Amp and other agents read AGENTS.md without an adapter.";

function cmdConnect(requested, dryRun, asJson) {
  const unknown = requested.filter((a) => !(a in ADAPTERS));
  if (unknown.length) {
    return fail(unknown.map((a) => `unknown agent '${a}' — available: ${Object.keys(ADAPTERS).join(", ")}`), asJson, NATIVE);
  }
  const results = [];
  const created = [];
  for (const agent of requested.length ? requested : Object.keys(ADAPTERS)) {
    for (const [path, content, marker, manual] of ADAPTERS[agent].files) {
      const target = join(ROOT, ...path.split("/"));
      let action;
      if (!exists(target)) {
        action = requested.length ? "create" : "absent";
        if (requested.length && !dryRun) {
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, content, "utf8");
          created.push(path);
        }
      } else if (readText(target).includes(marker)) action = "present";
      else action = requested.length ? "manual" : "other";
      results.push({ agent, path, action, manual: action === "manual" ? manual : null });
    }
  }
  if (created.length) {
    let config = null;
    try {
      config = readConfig();
    } catch (error) {
      if (!(error instanceof Failure)) throw error;
    }
    record(config, created, [], new Set());
  }
  if (asJson) return emitJson({ ok: true, dryRun, files: results });
  if (!requested.length) {
    for (const [agent, adapter] of Object.entries(ADAPTERS)) {
      const files = results.filter((r) => r.agent === agent);
      const connected = files.every((r) => r.action === "present");
      print(`${agent} (${adapter.name}): ${connected ? "connected" : "not connected"} — ${adapter.note}`);
      for (const r of files) print(`  ${r.path}: ${r.action}`);
    }
    print(NATIVE);
    print("Connect one with: groundwork connect claude");
    return 0;
  }
  for (const r of results) {
    if (r.action === "create") print(`${dryRun ? "Would create" : "Created"} ${r.path} (${r.agent})`);
    else if (r.action === "present") print(`${r.path}: already connected`);
    else print(wrap(`${r.path}: exists and was left unchanged — ${r.manual}`, ""));
  }
  return 0;
}

// --- Arguments ----------------------------------------------------------------

class UsageError extends Error {}

/** A small argparse: `spec` maps option names to "flag", "value" or "list". */
function parseArgs(argv, spec) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--") || arg === "--") {
      if (arg.startsWith("-") && arg.length > 1 && !/^-\d/.test(arg)) throw new UsageError(`unrecognized arguments: ${arg}`);
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const kind = spec[name];
    if (kind === undefined) throw new UsageError(`unrecognized arguments: ${arg}`);
    if (kind === "flag") {
      if (eq >= 0) throw new UsageError(`argument --${name}: ignored explicit argument '${arg.slice(eq + 1)}'`);
      options[name] = true;
    } else if (kind === "value") {
      if (eq >= 0) options[name] = arg.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) options[name] = argv[++i];
      else throw new UsageError(`argument --${name}: expected one argument`);
    } else {
      const values = eq >= 0 ? [arg.slice(eq + 1)] : [];
      while (i + 1 < argv.length && !argv[i + 1].startsWith("-")) values.push(argv[++i]);
      options[name] = [...(options[name] ?? []), ...values];
    }
  }
  return { options, positionals };
}

const COMMANDS = {
  list: { json: "flag" },
  profiles: { json: "flag" },
  init: { json: "flag", "dry-run": "flag", why: "value" },
  add: { json: "flag", "dry-run": "flag" },
  new: { json: "flag", "dry-run": "flag", name: "value", description: "value", profiles: "list", agents: "list" },
  config: { json: "flag" },
  status: { json: "flag", brief: "flag" },
  docs: { json: "flag" },
  mark: { json: "flag", "dry-run": "flag", note: "value", source: "value", reopen: "flag", repair: "flag", setup: "flag" },
  setup: {},
  connect: { json: "flag", "dry-run": "flag" },
  validate: { strict: "flag", "strict-coverage": "flag" },
};

const USAGE = `usage: groundwork.mjs {${Object.keys(COMMANDS)
  .filter((c) => c !== "setup")
  .join(",")}} ...`;

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === "-h" || command === "--help") {
    print(USAGE);
    return command === undefined ? 2 : 0;
  }
  const spec = COMMANDS[command];
  if (spec === undefined) {
    console.error(`${USAGE}\ngroundwork.mjs: error: invalid choice: '${command}'`);
    return 2;
  }
  let options;
  let positionals;
  try {
    ({ options, positionals } = parseArgs(rest, spec));
    const counts = { list: [0, 0], profiles: [0, 0], init: [1, Infinity], add: [1, 1], new: [1, 1], config: [0, 0], status: [0, 0], docs: [0, 1], mark: [0, Infinity], setup: [0, 0], connect: [0, Infinity], validate: [0, 0] };
    const [min, max] = counts[command];
    if (positionals.length < min) throw new UsageError("the following arguments are required");
    if (positionals.length > max) throw new UsageError(`unrecognized arguments: ${positionals.slice(max).join(" ")}`);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}\ngroundwork.mjs ${command}: error: ${error.message}`);
    return 2;
  }
  const json = Boolean(options.json);
  const dryRun = Boolean(options["dry-run"]);

  if (command === "validate") return docs.validate({ strict: Boolean(options.strict), strictCoverage: Boolean(options["strict-coverage"]) });
  if (command === "new") {
    return cmdNew(positionals[0], options.name ?? "", options.description ?? "", options.profiles ?? [], options.agents ?? [], dryRun, json);
  }
  if (command === "config") return cmdConfig(json);
  if (command === "status") return cmdStatus(Boolean(options.brief), json);
  if (command === "docs") return cmdDocs(positionals[0] ?? null, json);
  if (command === "mark") {
    try {
      return cmdMark(positionals, options.note ?? "", options.source ?? "", Boolean(options.reopen), Boolean(options.repair), dryRun, json, Boolean(options.setup));
    } catch (error) {
      if (error instanceof Failure) return fail([error.message], json);
      throw error;
    }
  }
  if (command === "connect") return cmdConnect(positionals, dryRun, json);
  const [profiles, owners, problems] = load();
  if (problems.length) return fail(problems, json);
  try {
    if (command === "list" || command === "profiles") return cmdList(profiles, json);
    if (command === "setup") {
      updateState(profiles, owners);
      return 0;
    }
    if (command === "init") return cmdInit(positionals, options.why ?? "", profiles, owners, dryRun, json);
    return cmdAdd(positionals[0], profiles, owners, dryRun, json);
  } catch (error) {
    if (error instanceof Failure) return fail([error.message], json);
    throw error;
  }
}

process.exitCode = await main(process.argv.slice(2));
