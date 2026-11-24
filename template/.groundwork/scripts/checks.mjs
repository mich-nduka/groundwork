// Groundwork's documentation checks: the rules `groundwork validate` applies,
// and the profile rules every other command shares. Node.js 18+, standard
// library only.
//
// What it checks (errors — exit 1):
// 1. `.groundwork/manifest.json` (Groundwork's own files): valid and sorted,
//    and every listed file under `.groundwork/` exists. Everything outside
//    `.groundwork/` belongs to the project: documents appear as the project
//    writes them, and nothing else needs listing.
// 2. The Feature Specification Index in `docs/product/SPEC.md` covers every
//    feature specification under `docs/product/specs/` (excluding
//    `_template`), and every indexed specification exists. Feature specs
//    without a `SPEC.md` to index them are an error.
// 3. Requirement IDs (`{SCOPE}-{TYPE}-NNN`, TYPE is FR, NFR or BR):
//    - grammar violations in markdown files;
//    - an ID defined more than once — an ID counts as defined only when it is
//      the first cell of a requirement table row in `docs/product/SPEC.md`, a
//      feature spec, or (for capabilities) `docs/product/PRD.md`;
//    - a feature spec's declared ID prefix must match the IDs it defines;
//    - an ID referenced in a document under `docs/`, or in a code file,
//      must be defined. Code files are the project's code, tests and
//      configuration wherever they live (`src/`, `tests/`, `apps/mobile/`,
//      `services/api/`...): every file outside `docs/`, hidden folders and
//      dependency, build and cache folders (`node_modules`, `vendor`, `dist`,
//      `build`, `target`, virtual environments and so on), except the
//      markdown files at the repository root and files over 1 MB;
//    - capability IDs (`CAP-NNN`) defined in the PRD must be unique, and a
//      `CAP-NNN` referenced in a spec, another document under `docs/`, or a
//      code file must be defined in the PRD;
//    - a `CAP-` token that is not exactly three digits (such as `CAP-9999`)
//      is a spelling error, checked in markdown and in code files. In code
//      files nothing is skipped. Requirement ID spelling is not checked in
//      code files, because code often holds tokens that only look like
//      requirement IDs.
// 4. Relative markdown links between repository files resolve.
// 5. Profiles (only when a `.groundwork/profiles/` folder exists; see
//    `.groundwork/profiles/README.md`):
//    - every `.groundwork/profiles/<id>/profile.json` is valid JSON and
//      matches the manifest schema, and its `id` matches its folder;
//    - every document has exactly one owner: core, or the one profile that
//      has a template for it. A profile may list only its own documents and
//      core documents; every template must be listed by its profile;
//    - the profiles named on the `- Profiles:` line in `PROJECT.md` exist,
//      their dependencies (`requires`) are active, and no two active
//      profiles are declared incompatible;
//    - `PROJECT.md` and `AGENTS.md`, which every project starts with, exist.
//    Other documents are created from their templates when the project has
//    something to write in them (`groundwork add PATH`), so a required
//    document that isn't written yet is never an error: `groundwork status`
//    lists it.
// 6. Onboarding (only when profiles have `onboarding.json` files; see
//    `GROUNDWORK.md`):
//    - every `.groundwork/profiles/<id>/onboarding.json` matches its schema,
//      defines only documents its profile owns, anchors each section to a
//      heading in the profile's template, asks each question in exactly one
//      section, gives every required section a `done_when`, and has no
//      dependency cycles;
//    - `.groundwork/state.json`, when present, is readable and uses only the
//      known states.
//    Unfinished onboarding is never an error: deferred items and documents
//    not written yet are reported by `groundwork status`, not here. Once
//    PROJECT.md says Development or later, required documents nobody wrote
//    or deferred are hygiene warnings.
//
// What it warns about (printed; only fails the run under the matching flag):
// - hygiene warnings — fail under `--strict`:
//   - a spec, `SYSTEM_DESIGN.md` or ADR status value outside the allowed
//     vocabulary (checked only once the placeholder text has been replaced);
//   - a capability in the PRD that no requirement serves;
//   - a document owned by a profile that is not active (only once profiles
//     are chosen in `PROJECT.md`);
//   - a check an active profile declares that has no row in the tooling
//     table in `AGENTS.md`;
//   - an unknown autonomy level in `GROUNDWORK.md`, and entries in
//     `.groundwork/state.json` for documents, sections or questions that no
//     longer exist (`groundwork mark --repair` drops them);
//   - a renamed profile's old ID in `PROJECT.md` (`web`, now `content-site`);
//   - a required document nobody has written or deferred, once `PROJECT.md`
//     says Development (discovery and design documents) or Production or
//     Maintenance (every required document).
// - coverage warnings — fail under `--strict-coverage`:
//   - a requirement defined but never referenced by any document under
//     `docs/` or any code file (placeholder rows in the root `SPEC.md` are
//     exempt). Tracing requirements into tests is optional: use this flag
//     only if the project has chosen to do it.
//
// Three modes: default (only errors fail), `--strict` (hygiene warnings fail
// too), `--strict-coverage` (coverage warnings fail too). `--strict-coverage`
// does not include `--strict`. Use both flags together to fail on everything.
//
// Illustrative text: on a line containing "for example", "such as" or "e.g.",
// IDs written inside inline code (backticks) are ignored. IDs outside inline
// code on such lines are still checked. Everything under `.groundwork/`
// (templates, blueprints, examples) is ignored by the ID and link checks;
// templates are checked once they are copied into place.
//
// Read-only.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GROUNDWORK_DIR = join(ROOT, ".groundwork");
export const MANIFEST = join(GROUNDWORK_DIR, "manifest.json");
export const PRD = join(ROOT, "docs", "product", "PRD.md");
export const SPEC = join(ROOT, "docs", "product", "SPEC.md");
export const SPECS_DIR = join(ROOT, "docs", "product", "specs");
export const DOCS = join(ROOT, "docs");
export const SYSTEM_DESIGN = join(ROOT, "docs", "architecture", "SYSTEM_DESIGN.md");
export const ADR_DIR = join(ROOT, "docs", "architecture", "adr");
const ADR_TEMPLATE = "0000-template.md";
export const PROJECT = join(ROOT, "PROJECT.md");
export const AGENTS = join(ROOT, "AGENTS.md");
export const PROFILES_DIR = join(GROUNDWORK_DIR, "profiles");
export const PROFILE_FILE = "profile.json";
export const PROFILE_TEMPLATES = "templates";
export const CORE = "core";
const PROFILE_SCHEMA = 1;
// Fields every manifest has; ordinary profiles add the selection fields.
const CORE_FIELDS = new Set(["schema", "id", "name", "purpose", "documents"]);
const PROFILE_FIELDS = new Set([...CORE_FIELDS, "use_when", "not_when", "requires", "incompatible_with", "checks"]);
const PROFILE_ID = /^[a-z][a-z0-9-]*$/;
// The active-profile line in PROJECT.md ("- Profiles: application, ai-systems").
export const PROFILES_BULLET = /^\s*-\s*Profiles:\s*(.*?)\s*$/;
// Profiles that were renamed: the old ID still selects the profile, unless
// the project has a profile of its own by that name.
const RENAMED = { web: "content-site" };

/** A profile ID as it is called now. */
export function currentId(profileId) {
  return profileId in RENAMED && !hasManifest(profileId) ? RENAMED[profileId] : profileId;
}

const PLACEHOLDER_TARGETS = new Set(["specs/feature-name/SPEC.md"]);

// Folders never scanned at all: Groundwork's own files, version control,
// installed dependencies, build output and caches. Any folder holding a
// Python virtual environment (a `pyvenv.cfg` file) is skipped too.
const SKIPPED_DIRS = new Set([
  ".groundwork",
  ".git",
  "node_modules",
  "bower_components",
  "vendor",
  "Pods",
  "DerivedData",
  "site-packages",
  "__pycache__",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
]);
// Code files larger than this (minified bundles, data dumps) are not scanned.
const MAX_CODE_FILE_BYTES = 1_000_000;

// {SCOPE}-{TYPE}-NNN, where TYPE is a requirement kind.
const ID_STRICT = /\b[A-Z][A-Z0-9]{1,9}-(?:FR|NFR|BR)-\d{3}\b/g;
// Tokens that resemble requirement IDs and must match the grammar above.
const ID_LOOKALIKE = /\b[A-Z]{2,10}-[A-Z]{2,10}-\d{1,4}\b/g;
// Product capability IDs: CAP-NNN.
const CAP_STRICT = /\bCAP-\d{3}\b/g;
// Any CAP- followed by digits; tokens must match CAP_STRICT.
const CAP_LOOKALIKE = /\bCAP-\d+\b/g;
// A line that starts a markdown table row.
export const TABLE_LINE = /^\s*\|/;
const FEATURE_INDEX_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const INLINE_CODE = /`[^`]*`/g;
const ILLUSTRATIVE = ["for example", "such as", "e.g."];
// ADR status bullets ("- Status: ...").
const STATUS_BULLET = /^\s*-\s*Status:\s*(.+?)\s*$/;

// Document and specification status values (see .groundwork/README.md).
const DOC_STATUS = ["Draft", "In Review", "Approved", "Superseded"];
// ADR status values (see .groundwork/README.md).
const ADR_STATUS = ["Proposed", "Accepted", "Rejected", "Superseded"];

// --- Small helpers shared by every module ----------------------------------

/** A path relative to the project root, always written with '/'. */
export function rel(path, root = ROOT) {
  return relative(root, path).split(sep).join("/");
}

export function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** A file's text with line endings normalised to \n, or "" when it can't be read as UTF-8. */
export function readText(path) {
  try {
    return UTF8.decode(readFileSync(path)).replace(/\r\n?/g, "\n");
  } catch {
    return "";
  }
}

/** Lines of a text, like Python's str.splitlines(): no trailing empty line. */
export function splitLines(text) {
  if (!text) return [];
  const lines = text.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (/(?:\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029])$/.test(text)) lines.pop();
  return lines;
}

/** Code-point order, like Python's sorted() on strings. */
export function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sorted(items) {
  return [...items].sort(byCodePoint);
}

/** A sorted copy of an object, by key. */
export function sortedObject(object) {
  return Object.fromEntries(Object.keys(object).sort(byCodePoint).map((key) => [key, object[key]]));
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isTextList(value, allowEmpty = true) {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string" && item.trim() !== "")
  );
}

/** The JSON of a value as Python's repr would show it in a message. */
export function pyRepr(value) {
  if (value === undefined || value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return `'${value}'`;
  return JSON.stringify(value);
}

function matchesOf(pattern, line) {
  pattern.lastIndex = 0;
  return [...line.matchAll(pattern)];
}

// --- Files ------------------------------------------------------------------

const walked = new Map();

/** Every file in the repository outside the skipped folders, walked once
 * with pruning so large dependency folders are never entered. With
 * `skipHidden`, folders whose names start with a dot are skipped too. */
function repositoryFiles(skipHidden) {
  const key = String(skipHidden);
  if (walked.has(key)) return walked.get(key);
  const found = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (dir !== ROOT && entries.some((e) => e.name === "pyvenv.cfg" && e.isFile())) return;
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name) || (skipHidden && entry.name.startsWith("."))) continue;
        visit(path);
      } else if (entry.isFile() || (entry.isSymbolicLink() && isFile(path))) {
        found.push(path);
      }
    }
  };
  visit(ROOT);
  const result = found.sort(byCodePoint);
  walked.set(key, result);
  return result;
}

function markdownFiles() {
  return repositoryFiles(false).filter((p) => p.endsWith(".md"));
}

function featureSpecs() {
  let names = [];
  try {
    names = readdirSync(SPECS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "_template")
      .map((e) => e.name);
  } catch {
    return [];
  }
  return names
    .map((name) => join(SPECS_DIR, name, "SPEC.md"))
    .filter(isFile)
    .sort(byCodePoint);
}

function definingFiles() {
  return new Set([SPEC, ...featureSpecs()]);
}

/** False for leftover `_template` folders, which are ignored. */
function checkableMarkdown(path) {
  return !path.split(sep).includes("_template");
}

function isUnder(path, folder) {
  const r = relative(folder, path);
  return r !== "" && !r.startsWith("..") && !r.startsWith(sep) && !/^[A-Za-z]:/.test(r);
}

/** Spans of inline code whose IDs count as illustrative and are skipped. */
function protectedSpans(line) {
  const lowered = line.toLowerCase();
  if (!ILLUSTRATIVE.some((marker) => lowered.includes(marker))) return [];
  return matchesOf(INLINE_CODE, line).map((m) => [m.index, m.index + m[0].length]);
}

function* iterTokens(line, pattern) {
  const spans = protectedSpans(line);
  for (const match of matchesOf(pattern, line)) {
    const start = match.index;
    const end = start + match[0].length;
    if (spans.some(([s, e]) => s <= start && end <= e)) continue;
    yield match;
  }
}

/** Cells of each markdown table row; non-table lines are skipped. */
export function* tableRows(text) {
  for (const line of splitLines(text)) {
    if (!TABLE_LINE.test(line)) continue;
    yield stripChars(line.trim(), "|").split("|").map((cell) => cell.trim());
  }
}

/** Python's str.strip(chars). */
export function stripChars(text, chars) {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start++;
  while (end > start && chars.includes(text[end - 1])) end--;
  return text.slice(start, end);
}

function isRequirementId(value) {
  return /^[A-Z][A-Z0-9]{1,9}-(?:FR|NFR|BR)-\d{3}$/.test(value);
}

function isCapabilityId(value) {
  return /^CAP-\d{3}$/.test(value);
}

/** A template row: every cell after the ID is empty or bracketed. */
function isPlaceholderRow(cells) {
  return cells.slice(1).every((cell) => cell === "" || cell.startsWith("["));
}

function isPlaceholderStatus(value) {
  value = value.trim();
  return !value || value.startsWith("[") || value.includes(" / ");
}

// --- Checks -------------------------------------------------------------------

/** Groundwork's own files, listed in `.groundwork/manifest.json`, are intact. */
function checkManifest() {
  const where = rel(MANIFEST);
  let files;
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    if (!isPlainObject(manifest) || !("files" in manifest)) throw new Error("'files'");
    files = manifest.files;
  } catch (error) {
    return [`${where}: missing or not valid (${error.message}) — restore it from the Groundwork release`];
  }
  if (!Array.isArray(files) || !files.every((f) => typeof f === "string")) {
    return [`${where}: 'files' must be a list of paths`];
  }
  const problems = [];
  if (files.join("\n") !== sorted(files).join("\n")) problems.push(`${where}: the file list is not sorted`);
  for (const path of files) {
    if (path.startsWith(".groundwork/") && !isFile(join(ROOT, path))) {
      problems.push(`${path}: Groundwork file missing — restore it from the Groundwork release`);
    }
  }
  return problems;
}

function checkFeatureIndex() {
  if (!isFile(SPEC)) {
    if (featureSpecs().length) {
      return [
        "docs/product/specs/: feature specs exist but docs/product/SPEC.md, which indexes them," +
          " does not — create it with `groundwork add docs/product/SPEC.md`",
      ];
    }
    return [];
  }
  const text = readText(SPEC);
  const indexed = new Set(
    matchesOf(FEATURE_INDEX_LINK, text)
      .map((m) => m[1])
      .filter((target) => target.startsWith("specs/") && target.endsWith("SPEC.md") && !PLACEHOLDER_TARGETS.has(target)),
  );
  const onDisk = new Set(featureSpecs().map((path) => `specs/${rel(dirname(path), SPECS_DIR)}/SPEC.md`));
  const problems = [];
  for (const target of sorted([...indexed].filter((t) => !onDisk.has(t)))) {
    problems.push(`docs/product/${target}: linked in the feature index but missing on disk`);
  }
  for (const target of sorted([...onDisk].filter((t) => !indexed.has(t)))) {
    problems.push(`docs/product/${target}: on disk but missing from the feature index in SPEC.md`);
  }
  return problems;
}

/** Scan the defining files and the PRD.
 *
 * Returns [requirement owner, real requirement rows, capability owner,
 * errors]. An ID is defined only as the first cell of a table row; rows
 * whose remaining cells are all placeholders still define their ID but are
 * reported separately so they can be exempt from reference warnings. */
function collectDefinitions() {
  const rowOwner = new Map();
  const realRows = new Map();
  const capabilityOwner = new Map();
  const problems = [];
  const sources = [[PRD, false], ...sorted(definingFiles()).map((path) => [path, true])];
  for (const [path, isRequirementTable] of sources) {
    const where = rel(path);
    const text = readText(path);
    const seen = new Set();
    for (const cells of tableRows(text)) {
      const token = cells[0];
      if (isRequirementTable && isRequirementId(token)) {
        if (rowOwner.has(token) && rowOwner.get(token) !== where) {
          problems.push(`${rowOwner.get(token)} and ${where} both define requirement ID ${token}`);
        } else if (seen.has(token)) {
          problems.push(`${where}: requirement ID ${token} is defined more than once`);
        }
        if (!rowOwner.has(token)) rowOwner.set(token, where);
        seen.add(token);
        if (!isPlaceholderRow(cells) && !realRows.has(token)) realRows.set(token, where);
      } else if (!isRequirementTable && isCapabilityId(token)) {
        if (capabilityOwner.has(token)) problems.push(`${where}: capability ID ${token} is defined more than once`);
        if (!capabilityOwner.has(token)) capabilityOwner.set(token, where);
      }
    }
    if (isRequirementTable) {
      const prefixMatch = text.match(/\*\*Requirement ID prefix:\*\*\s*(\S+)/);
      if (prefixMatch) {
        const prefix = prefixMatch[1];
        if (!/^[A-Z][A-Z0-9]{1,9}$/.test(prefix)) {
          problems.push(
            `${where}: requirement ID prefix '${prefix}' is not valid — use capital letters and digits, starting with a letter`,
          );
        }
        for (const [token, owner] of rowOwner) {
          if (token.startsWith(prefix + "-")) continue;
          if (owner === where) problems.push(`${where}: requirement ID ${token} does not use the declared prefix ${prefix}`);
        }
      }
    }
  }
  return [rowOwner, realRows, capabilityOwner, problems];
}

/** The project's code, tests and configuration, wherever they live
 * (`src/`, `tests/`, `apps/mobile/`, `services/api/` and so on): every file
 * outside `docs/`, hidden folders and the skipped folders, except the
 * markdown files at the repository root (README, AGENTS and the other
 * project documents) and files over MAX_CODE_FILE_BYTES. */
function codeFiles() {
  return repositoryFiles(true).filter((path) => {
    if (isUnder(path, DOCS)) return false;
    if (dirname(path) === ROOT && path.endsWith(".md")) return false;
    try {
      return statSync(path).size <= MAX_CODE_FILE_BYTES;
    } catch {
      return false;
    }
  });
}

/** Files whose IDs count as references: documents under `docs/` (excluding
 * defining files, templates and the example) plus the code files. */
function referenceFiles() {
  const defining = definingFiles();
  const files = new Set();
  for (const path of markdownFiles()) {
    if (!checkableMarkdown(path) || defining.has(path)) continue;
    if (isUnder(path, DOCS)) files.add(path);
  }
  for (const path of codeFiles()) files.add(path);
  return sorted(files);
}

function checkReferences(rowOwner, capabilityOwner) {
  const problems = [];
  for (const path of referenceFiles()) {
    const where = rel(path);
    for (const line of splitLines(readText(path))) {
      for (const match of iterTokens(line, ID_STRICT)) {
        if (!rowOwner.has(match[0])) {
          problems.push(`${where}: requirement ID ${match[0]} is not defined in SPEC.md or a feature spec`);
        }
      }
      for (const match of iterTokens(line, CAP_STRICT)) {
        if (!capabilityOwner.has(match[0])) {
          problems.push(`${where}: capability ${match[0]} is not defined in docs/product/PRD.md`);
        }
      }
    }
  }
  // Requirement specs' own capability references (the Serves columns).
  for (const path of sorted(definingFiles())) {
    const where = rel(path);
    for (const line of splitLines(readText(path))) {
      for (const match of iterTokens(line, CAP_STRICT)) {
        if (!capabilityOwner.has(match[0])) {
          problems.push(`${where}: capability ${match[0]} is not defined in docs/product/PRD.md`);
        }
      }
    }
  }
  return problems;
}

function checkGrammar() {
  const problems = [];
  for (const path of markdownFiles()) {
    if (!checkableMarkdown(path)) continue;
    const where = rel(path);
    for (const line of splitLines(readText(path))) {
      for (const match of iterTokens(line, ID_LOOKALIKE)) {
        if (!isRequirementId(match[0])) {
          problems.push(
            `${where}: '${match[0]}' looks like a requirement ID but is not written as SCOPE-TYPE-NNN (for example AUTH-FR-001)`,
          );
        }
      }
      for (const match of iterTokens(line, CAP_LOOKALIKE)) {
        if (!isCapabilityId(match[0])) {
          problems.push(`${where}: '${match[0]}' looks like a capability ID but is not written as CAP-NNN (three digits)`);
        }
      }
    }
  }
  // Code files: capability spelling only, and nothing is skipped — the
  // illustrative-line rule is a markdown rule. Requirement ID spelling stays
  // markdown-only because code often holds tokens that only look like
  // requirement IDs.
  for (const path of codeFiles()) {
    const where = rel(path);
    for (const line of splitLines(readText(path))) {
      for (const match of matchesOf(CAP_LOOKALIKE, line)) {
        if (!isCapabilityId(match[0])) {
          problems.push(`${where}: '${match[0]}' looks like a capability ID but is not written as CAP-NNN (three digits)`);
        }
      }
    }
  }
  return problems;
}

/** Coverage warnings: defined requirements nothing else mentions. */
function checkUnreferenced(realRows) {
  const warnings = [];
  const referenced = new Map();
  const sources = sorted(new Set([...referenceFiles(), ...definingFiles()]));
  for (const path of sources) {
    if (!checkableMarkdown(path)) continue;
    const where = rel(path);
    for (const line of splitLines(readText(path))) {
      for (const match of iterTokens(line, ID_STRICT)) {
        if (!referenced.has(match[0])) referenced.set(match[0], new Set());
        referenced.get(match[0]).add(where);
      }
    }
  }
  for (const token of sorted(realRows.keys())) {
    const owner = realRows.get(token);
    const files = referenced.get(token) ?? new Set([owner]);
    if ([...files].every((where) => where === owner)) {
      warnings.push(`${owner}: requirement ${token} is defined but never referenced by any document, plan or test`);
    }
  }
  return warnings;
}

/** Hygiene warnings: PRD capabilities no requirement serves. */
function checkUnserved(capabilityOwner) {
  const served = new Set();
  for (const path of sorted(definingFiles())) {
    for (const line of splitLines(readText(path))) {
      for (const match of iterTokens(line, CAP_STRICT)) served.add(match[0]);
    }
  }
  return sorted(capabilityOwner.keys())
    .filter((token) => !served.has(token))
    .map((token) => `docs/product/PRD.md: capability ${token} is not served by any requirement in SPEC.md or a feature spec`);
}

/** Hygiene warnings: ADR status values outside the vocabulary. */
function checkAdrStatus() {
  const warnings = [];
  const allowed = ADR_STATUS.join(", ");
  let names = [];
  try {
    names = readdirSync(ADR_DIR).filter((name) => name.endsWith(".md") && isFile(join(ADR_DIR, name)));
  } catch {
    return [];
  }
  for (const name of sorted(names)) {
    if (name === ADR_TEMPLATE || name === "README.md") continue;
    const path = join(ADR_DIR, name);
    for (const line of splitLines(readText(path))) {
      const match = line.match(STATUS_BULLET);
      if (match && !isPlaceholderStatus(match[1]) && !ADR_STATUS.includes(match[1])) {
        warnings.push(`${rel(path)}: ADR status '${match[1]}' is not one of ${allowed}`);
      }
    }
  }
  return warnings;
}

function checkStatus() {
  const warnings = [];
  const warn = (path, value, allowed) => `${rel(path)}: status '${value}' is not one of ${allowed.join(", ")}`;
  for (const line of splitLines(readText(SYSTEM_DESIGN))) {
    const match = line.match(STATUS_BULLET);
    if (match && !isPlaceholderStatus(match[1]) && !DOC_STATUS.includes(match[1])) {
      warnings.push(warn(SYSTEM_DESIGN, match[1], DOC_STATUS));
    }
  }
  for (const path of featureSpecs()) {
    for (const line of splitLines(readText(path))) {
      const match = line.match(/^\*\*Status:\*\*\s*(.+?)\s*$/);
      if (match && !isPlaceholderStatus(match[1]) && !DOC_STATUS.includes(match[1])) {
        warnings.push(warn(path, match[1], DOC_STATUS));
      }
    }
  }
  for (const cells of tableRows(readText(SPEC))) {
    if (cells.length !== 3 || !cells[1].includes("specs/") || cells[1].includes("feature-name")) continue;
    if (isPlaceholderStatus(cells[2])) continue;
    if (!DOC_STATUS.includes(cells[2])) warnings.push(warn(SPEC, cells[2], DOC_STATUS));
  }
  return warnings;
}

function checkLinks() {
  const problems = [];
  const link = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const path of markdownFiles()) {
    if (!checkableMarkdown(path)) continue;
    const where = rel(path);
    for (const match of matchesOf(link, readText(path))) {
      const target = match[1];
      if (/^(https?:\/\/|mailto:|#)/.test(target)) continue;
      if (PLACEHOLDER_TARGETS.has(target) || target.includes("[")) continue;
      const clean = target.split("#")[0];
      if (!clean) continue;
      if (!exists(resolve(dirname(path), clean))) problems.push(`${where}: broken link to ${target}`);
    }
  }
  return problems;
}

// --- Profiles -------------------------------------------------------------
// A profile is `.groundwork/profiles/<id>/profile.json` plus, for every
// document it owns, a template at `.groundwork/profiles/<id>/templates/<document
// path>`. Core is the always-active profile `.groundwork/profiles/core/`.
// See `.groundwork/profiles/README.md` for the schema and the rules.

/** Document paths a profile has templates for (and therefore owns). */
function templatePaths(directory) {
  const base = join(directory, PROFILE_TEMPLATES);
  const found = new Set();
  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__pycache__") visit(path);
      } else if (entry.isFile()) {
        found.add(rel(path, base));
      }
    }
  };
  if (isDir(base)) visit(base);
  return found;
}

/** True when a profile folder has a manifest, valid or not. */
function hasManifest(profileId) {
  return PROFILE_ID.test(profileId) && isFile(join(PROFILES_DIR, profileId, PROFILE_FILE));
}

export function templateFor(profileId, document) {
  return join(PROFILES_DIR, profileId, PROFILE_TEMPLATES, ...document.split("/"));
}

/** Schema problems in one manifest, without the leading file name. */
function validateProfile(directory, name, data) {
  if (!isPlainObject(data)) return ["must be a JSON object"];
  const isCore = name === CORE;
  const allowed = isCore ? CORE_FIELDS : PROFILE_FIELDS;
  const keys = Object.keys(data);
  const missing = sorted([...allowed].filter((key) => !keys.includes(key))).map((key) => `missing field '${key}'`);
  const problems = sorted(keys.filter((key) => !allowed.has(key))).map((key) => `unknown field '${key}'`);
  if (missing.length) return [...missing, ...problems];

  if (data.schema !== PROFILE_SCHEMA) {
    problems.push(`schema is ${pyRepr(data.schema)}, but this checker understands ${PROFILE_SCHEMA}`);
  }
  if (typeof data.id !== "string" || !PROFILE_ID.test(data.id)) {
    problems.push("id must be lowercase letters, digits and hyphens, starting with a letter");
  } else if (data.id !== name) {
    problems.push(`id '${data.id}' does not match its folder name '${name}'`);
  }
  for (const key of ["name", "purpose"]) {
    if (typeof data[key] !== "string" || !data[key].trim()) problems.push(`'${key}' must be a non-empty string`);
  }
  if (!isCore) {
    if (!isTextList(data.use_when, false)) problems.push("'use_when' must be a non-empty list of strings");
    if (!isTextList(data.not_when)) problems.push("'not_when' must be a list of strings");
    if (!isTextList(data.incompatible_with)) problems.push("'incompatible_with' must be a list of profile IDs");
    const requires = data.requires;
    if (
      !Array.isArray(requires) ||
      !requires.every((entry) => (typeof entry === "string" && entry) || isTextList(entry, false))
    ) {
      problems.push(
        "'requires' must be a list whose entries are a profile ID or a list of profile IDs (any one of them will do)",
      );
    }
    const checks = data.checks;
    if (
      !Array.isArray(checks) ||
      !checks.every(
        (check) =>
          isPlainObject(check) &&
          Object.keys(check).length === 2 &&
          ["name", "what"].every((key) => typeof check[key] === "string" && check[key].trim()),
      )
    ) {
      problems.push("'checks' must be a list of objects with exactly 'name' and 'what'");
    }
  }
  const documents = data.documents;
  if (!Array.isArray(documents)) return [...problems, "'documents' must be a list"];
  const listed = new Set();
  documents.forEach((doc, index) => {
    const where = `documents[${index}]`;
    const fields = isPlainObject(doc) ? Object.keys(doc) : [];
    if (
      !isPlainObject(doc) ||
      !fields.includes("path") ||
      !fields.includes("required") ||
      !fields.every((key) => ["path", "required", "when"].includes(key))
    ) {
      problems.push(`${where} must have 'path' and 'required', and optionally 'when'`);
      return;
    }
    const { path, required } = doc;
    if (
      typeof path !== "string" ||
      !path ||
      path.startsWith("/") ||
      path.includes("\\") ||
      path.split("/").includes("..") ||
      path.split("/")[0] === ".groundwork"
    ) {
      problems.push(`${where}: path must be a relative path outside .groundwork/, written with '/'`);
      return;
    }
    if (typeof required !== "boolean") problems.push(`${path}: 'required' must be true or false`);
    else if (!required && !(typeof doc.when === "string" && doc.when.trim())) {
      problems.push(`${path}: an optional document needs a 'when' saying when to create it`);
    } else if (required && "when" in doc) {
      problems.push(`${path}: a required document has no 'when' — remove it, or make the document optional`);
    }
    if (listed.has(path)) problems.push(`${path}: listed more than once`);
    listed.add(path);
  });
  for (const orphan of sorted([...templatePaths(directory)].filter((p) => !listed.has(p)))) {
    problems.push(`template ${PROFILE_TEMPLATES}/${orphan} is not listed in 'documents' — list it, or delete the template`);
  }
  if (!isCore && !isFile(join(directory, "README.md"))) {
    problems.push("profile has no README.md with its standards and agent instructions");
  }
  return problems;
}

export function readJson(path) {
  return JSON.parse(UTF8.decode(readFileSync(path)));
}

/** [valid manifests by ID, problems]. Empty without `.groundwork/profiles/`. */
export function loadProfiles() {
  const profiles = {};
  const problems = [];
  if (!isDir(PROFILES_DIR)) return [profiles, problems];
  const folders = readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "__pycache__")
    .map((e) => e.name)
    .sort(byCodePoint);
  for (const name of folders) {
    const directory = join(PROFILES_DIR, name);
    const manifest = join(directory, PROFILE_FILE);
    const where = rel(manifest);
    if (!isFile(manifest)) {
      problems.push(`${where}: missing — every folder in .groundwork/profiles/ needs a ${PROFILE_FILE}`);
      continue;
    }
    let data;
    try {
      data = readJson(manifest);
    } catch (error) {
      problems.push(`${where}: not valid JSON (${error.message})`);
      continue;
    }
    const found = validateProfile(directory, name, data);
    problems.push(...found.map((problem) => `${where}: ${problem}`));
    if (!found.length) profiles[data.id] = data;
  }
  if (!(CORE in profiles) && !problems.some((p) => p.includes(`.groundwork/profiles/${CORE}/`))) {
    problems.push(`.groundwork/profiles/${CORE}/${PROFILE_FILE}: missing — core is required once .groundwork/profiles/ exists`);
  }
  return [profiles, problems];
}

/** Map each document path to its one owner, and report ownership problems.
 *
 * Core owns every document it lists. Any other profile owns exactly the
 * documents it has templates for. A profile may list its own documents and
 * core documents, never another profile's. */
export function documentOwners(profiles) {
  const owners = {};
  const problems = [];
  const order = [...(CORE in profiles ? [CORE] : []), ...sorted(Object.keys(profiles).filter((p) => p !== CORE))];
  for (const profileId of order) {
    const owned = templatePaths(join(PROFILES_DIR, profileId));
    if (profileId === CORE) for (const doc of profiles[CORE].documents) owned.add(doc.path);
    for (const path of sorted(owned)) {
      if (path in owners) {
        problems.push(
          `${path}: owned by both the ${owners[path]} and ${profileId} profiles — a document has one owner; if several profiles need it, move it into core`,
        );
        continue;
      }
      owners[path] = profileId;
    }
  }
  // Without a valid core, every core reference would look ownerless; the
  // missing or broken core manifest is already reported.
  for (const profileId of CORE in profiles ? order : []) {
    for (const doc of profiles[profileId].documents) {
      const owner = owners[doc.path];
      const where = `.groundwork/profiles/${profileId}/${PROFILE_FILE}`;
      if (owner === undefined) {
        problems.push(`${where}: ${doc.path} has no template — add .groundwork/profiles/${profileId}/${PROFILE_TEMPLATES}/${doc.path}`);
      } else if (owner !== profileId && owner !== CORE) {
        problems.push(
          `${where}: lists ${doc.path}, which the ${owner} profile owns — a profile may list only its own documents and core documents; if several profiles need it, move it into core`,
        );
      }
    }
  }
  for (const profileId of order) {
    if (profileId === CORE) continue;
    const data = profiles[profileId];
    const where = `.groundwork/profiles/${profileId}/${PROFILE_FILE}`;
    const named = [...data.requires.flatMap((entry) => (typeof entry === "string" ? [entry] : entry)), ...data.incompatible_with];
    for (const other of named) {
      if (other === profileId) problems.push(`${where}: a profile cannot require or exclude itself`);
      else if (other === CORE) {
        problems.push(`${where}: core is always active — don't name it in 'requires' or 'incompatible_with'`);
      } else if (!(other in profiles) && !hasManifest(other)) problems.push(`${where}: names unknown profile '${other}'`);
    }
  }
  return [owners, problems];
}

/** The IDs on a `- Profiles:` line; null while it is still a placeholder. */
function parseProfiles(value) {
  value = value.trim();
  if (!value || value.startsWith("[")) return null;
  if (value.toLowerCase() === "none") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The IDs as written on PROJECT.md's Profiles line; null when not chosen yet. */
function writtenProfiles() {
  for (const line of splitLines(readText(PROJECT))) {
    const match = line.match(PROFILES_BULLET);
    if (match) return parseProfiles(match[1]);
  }
  return null;
}

/** Profiles chosen in PROJECT.md, by their current IDs; null when not chosen yet. */
export function declaredProfiles() {
  return writtenProfiles()?.map(currentId) ?? null;
}

/** Hygiene warnings: old profile IDs in PROJECT.md. */
function checkRenamedProfiles() {
  return (writtenProfiles() ?? [])
    .filter((id) => currentId(id) !== id)
    .map((id) => `PROJECT.md: the ${id} profile is now called ${currentId(id)} — re-run init to update the Profiles line`);
}

/** Unknown IDs, missing dependencies and incompatible pairs. */
export function checkSelection(selected, profiles) {
  const problems = [];
  const known = sorted(Object.keys(profiles).filter((p) => p !== CORE)).join(", ") || "none";
  const seen = new Set();
  for (const profileId of selected) {
    if (seen.has(profileId)) problems.push(`PROJECT.md: profile '${profileId}' is listed twice`);
    seen.add(profileId);
    if (profileId === CORE) problems.push("PROJECT.md: core is always active — don't list it under Profiles");
    else if (!(profileId in profiles) && hasManifest(profileId)) {
      problems.push(`PROJECT.md: profile '${profileId}' has manifest errors — fix them first`);
    } else if (!(profileId in profiles)) {
      problems.push(`PROJECT.md: unknown profile '${profileId}' — known profiles: ${known}`);
    }
  }
  const active = [...new Set(selected)].filter((p) => p in profiles && p !== CORE);
  for (const profileId of active) {
    for (const entry of profiles[profileId].requires) {
      const options = typeof entry === "string" ? [entry] : [...entry];
      if (!options.some((option) => active.includes(option))) {
        const wanted = options.length === 1 ? options[0] : "one of " + options.join(", ");
        problems.push(`PROJECT.md: the ${profileId} profile requires ${wanted}, which is not active`);
      }
    }
  }
  const reported = new Set();
  for (const profileId of active) {
    for (const other of profiles[profileId].incompatible_with) {
      const pair = sorted([profileId, other]);
      const key = pair.join("\0");
      if (active.includes(other) && !reported.has(key)) {
        reported.add(key);
        problems.push(
          `PROJECT.md: the ${pair[0]} and ${pair[1]} profiles are declared incompatible — choose one, or record in an ADR why the system needs both and change the manifests`,
        );
      }
    }
  }
  return problems;
}

/** Core plus the valid selected profiles, in a stable order. */
export function activeProfiles(selected, profiles) {
  const chosen = [...new Set(selected ?? [])].filter((p) => p in profiles && p !== CORE);
  return [...(CORE in profiles ? [CORE] : []), ...chosen];
}

/** Each required document, with the active profiles that require it. */
export function requiredDocuments(active, profiles) {
  const required = {};
  for (const profileId of active) {
    for (const doc of profiles[profileId].documents) {
      if (doc.required) (required[doc.path] ??= []).push(profileId);
    }
  }
  return required;
}

/** Required documents that have no template and are missing.
 *
 * Documents with a template are written when there is something to put in
 * them, so their absence is progress for `groundwork status`, not an error.
 * Only the documents a project starts with (no template) must exist. */
function checkRequiredDocuments(active, profiles, owners) {
  const problems = [];
  const required = requiredDocuments(active, profiles);
  for (const path of sorted(Object.keys(required))) {
    if (exists(join(ROOT, path)) || isFile(templateFor(owners[path] ?? CORE, path))) continue;
    problems.push(`${path}: required by ${required[path].join(", ")} but missing — restore it from the Groundwork release`);
  }
  return problems;
}

/** Hygiene warnings: documents that belong to a profile not in use. */
export function checkInactiveDocuments(selected, active, owners) {
  if (selected === null) return [];
  return sorted(Object.keys(owners))
    .filter((path) => !active.includes(owners[path]) && exists(join(ROOT, path)))
    .map(
      (path) =>
        `${path}: belongs to the ${owners[path]} profile, which PROJECT.md does not list — add the profile, or delete the document`,
    );
}

/** First cells of the tooling table in AGENTS.md, lowercased. */
function toolingConcerns() {
  const concerns = [];
  let inside = false;
  for (const line of splitLines(readText(AGENTS))) {
    if (line.trimStart().startsWith("#")) {
      inside = line.toLowerCase().includes("tooling");
      continue;
    }
    if (inside && TABLE_LINE.test(line)) {
      const first = stripChars(line.trim(), "|").split("|")[0].trim();
      if (first && [...first].some((c) => !"-: ".includes(c))) concerns.push(first.toLowerCase());
    }
  }
  return concerns;
}

/** [profile, check] pairs with no tooling-table row; one per check name. */
export function missingChecks(active, profiles) {
  const concerns = toolingConcerns();
  const missing = [];
  const seen = new Set();
  for (const profileId of active) {
    for (const check of profiles[profileId].checks ?? []) {
      const name = check.name.toLowerCase();
      if (seen.has(name) || concerns.some((concern) => concern.startsWith(name))) continue;
      seen.add(name);
      missing.push([profileId, check]);
    }
  }
  return missing;
}

/** Hygiene warnings: profile checks with no row in the tooling table. */
function checkProfileTooling(active, profiles) {
  return missingChecks(active, profiles).map(
    ([profileId, check]) =>
      `AGENTS.md: the ${profileId} profile needs the '${check.name}' check — add a row to the tooling table naming the tool, or say why it doesn't apply`,
  );
}

/** [profile errors, profile hygiene warnings, a one-line summary]. */
function profileResults() {
  if (!isDir(PROFILES_DIR)) return [[], [], ""];
  const [profiles, errors] = loadProfiles();
  const [owners, ownershipProblems] = documentOwners(profiles);
  const selected = declaredProfiles();
  errors.push(...ownershipProblems, ...checkSelection(selected ?? [], profiles));
  const active = activeProfiles(selected, profiles);
  errors.push(...checkRequiredDocuments(active, profiles, owners));
  const warnings = [
    ...checkRenamedProfiles(),
    ...checkInactiveDocuments(selected, active, owners),
    ...checkProfileTooling(active, profiles),
  ];
  const summary = selected === null ? "profiles: not chosen yet" : "profiles: " + (selected.join(", ") || "none (core only)");
  return [errors, warnings, summary];
}

// The project status in PROJECT.md from which a required document nobody has
// written or deferred is reported, and the onboarding stages that applies to
// (null: every stage). Before Development, unwritten documents are progress.
const UNWRITTEN_FROM = {
  development: new Set(["discovery", "design"]),
  production: null,
  maintenance: null,
};
const PROJECT_STATUS = /^\s*-\s*Status:\s*(.*?)\s*$/;

/** PROJECT.md's status, lowercased, or null while it is a placeholder. */
function projectStatus() {
  for (const line of splitLines(readText(PROJECT))) {
    const match = line.match(PROJECT_STATUS);
    if (match) return match[1].includes("/") || !match[1] ? null : stripChars(match[1], "`*").trim().toLowerCase();
  }
  return null;
}

/** Hygiene warnings: required documents still unwritten once PROJECT.md says
 * the project is being built or has shipped, unless deliberately deferred. */
function checkUnwritten(report) {
  const status = projectStatus();
  if (!(status in UNWRITTEN_FROM)) return [];
  const stages = UNWRITTEN_FROM[status];
  return report.documents
    .filter((doc) => doc.required && ["pending", "not-started"].includes(doc.status))
    .filter((doc) => stages === null || stages.has(doc.stage))
    .map(
      (doc) =>
        `${doc.path}: required by ${doc.requiredBy.join(", ")}, but nothing is written in it and PROJECT.md says the project is in ${status} — write it, or record why not: node .groundwork/scripts/groundwork.mjs mark ${doc.path} deferred --note "..."`,
    );
}

/** [onboarding errors, hygiene warnings, a one-line progress summary].
 *
 * Structure only: incomplete or deferred documentation never fails
 * validation, except that once the project is being built, required
 * documents nobody wrote or deferred are hygiene warnings. */
async function onboardingResults() {
  if (!isDir(PROFILES_DIR)) return [[], [], ""];
  const withOnboarding = readdirSync(PROFILES_DIR, { withFileTypes: true }).some(
    (e) => e.isDirectory() && isFile(join(PROFILES_DIR, e.name, "onboarding.json")),
  );
  if (!withOnboarding) return [[], [], ""];
  const ob = await import("./onboarding.mjs");
  const [profiles] = loadProfiles();
  const [owners] = documentOwners(profiles);
  const [registry, errors] = ob.loadDefinitions(profiles, owners);
  const [state0, problems] = ob.readState();
  let state = state0;
  errors.push(...problems.map((p) => `${p} — run node .groundwork/scripts/groundwork.mjs mark --repair`));
  const warnings = [];
  if (state !== null) {
    const [stateErrors, stale] = ob.validateState(state, registry, owners);
    errors.push(...stateErrors);
    warnings.push(...stale);
    if (stateErrors.length) state = ob.repairState(state, registry, owners)[0];
  }
  const autonomyProblem = ob.readAutonomy()[1];
  if (autonomyProblem) warnings.push(autonomyProblem);
  const report = ob.buildStatus(profiles, owners, registry, state, declaredProfiles());
  warnings.push(...checkUnwritten(report));
  const tracked = report.documents.filter((d) => d.status !== "available");
  const complete = tracked.filter((d) => d.status === "complete").length;
  const discovery = report.discovery.replace(/-/g, " ");
  const summary =
    `Onboarding: discovery ${discovery}; ${complete} of ${tracked.length} documents complete` +
    " (node .groundwork/scripts/groundwork.mjs status for details)";
  return [errors, warnings, summary];
}

/** Run every check and print the result. Returns the exit code. */
export async function validate({ strict = false, strictCoverage = false } = {}) {
  const [rowOwner, realRows, capabilityOwner, definitionProblems] = collectDefinitions();
  const [profileErrors, profileWarnings, profileSummary] = profileResults();
  const [onboardingErrors, onboardingWarnings, onboardingSummary] = await onboardingResults();
  profileErrors.push(...onboardingErrors);
  profileWarnings.push(...onboardingWarnings);
  const errors = [
    ...checkManifest(),
    ...checkFeatureIndex(),
    ...definitionProblems,
    ...checkReferences(rowOwner, capabilityOwner),
    ...checkGrammar(),
    ...checkLinks(),
    ...profileErrors,
  ];
  const hygieneWarnings = [...checkUnserved(capabilityOwner), ...checkStatus(), ...checkAdrStatus(), ...profileWarnings];
  const coverageWarnings = checkUnreferenced(realRows);
  const warnings = [...hygieneWarnings, ...coverageWarnings];

  for (const problem of errors) console.log(`FAIL: ${problem}`);
  for (const warning of hygieneWarnings) console.log(`WARN: ${warning}`);
  for (const warning of coverageWarnings) console.log(`WARN (coverage): ${warning}`);

  if (errors.length || (strict && hygieneWarnings.length) || (strictCoverage && coverageWarnings.length)) return 1;
  if (onboardingSummary) console.log(onboardingSummary);
  let checked = "Groundwork files, feature index, requirement IDs and links are consistent";
  if (profileSummary) {
    checked = `Groundwork files, feature index, requirement IDs, links and profiles are consistent (${profileSummary})`;
  }
  console.log(warnings.length ? `OK (warnings above): ${checked}` : `OK: ${checked}`);
  return 0;
}
