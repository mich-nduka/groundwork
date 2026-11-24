// Onboarding: what each document needs, and how far the project has got.
//
// Used by `groundwork validate` and by the status, docs and mark commands.
// Node.js 18+, standard library only.
//
// Three sources, each with one job:
//
// - `.groundwork/profiles/<id>/profile.json`: which documents exist, who owns
//   them, when optional ones apply.
// - `.groundwork/profiles/<id>/onboarding.json`: how each document the
//   profile owns is onboarded — its purpose, stage, sections (anchored to the
//   template's headings), the questions asked for each section, and when a
//   section is done. A profile may also add questions to sections of core
//   documents it lists (`extends`). Every question is asked in exactly one
//   section, so an answer has one home; other sections name it under `uses`.
//   A section marked `only_when_needed` is part of its document only while
//   an active profile lists it under `needs` (it is then required), or once
//   the project adds it anyway.
// - `.groundwork/state.json`: progress only — the state of each question,
//   section and document, with short notes for deferred and assumed items.
//   It never holds answers: the documents do.
//
// `.groundwork/config.json` records what Groundwork generated: each file's
// hash and, under `sections`, a fingerprint of each section as generated.
// That is how a section of template text is told apart from the project's
// own writing, and why losing the state file loses no content information.
//
// When the state and the documents disagree, the documents win: a section
// whose text changed since it was generated counts as written, whatever the
// state says.
//
// Documents are created lazily. A project starts with PROJECT.md and
// AGENTS.md; every other document is copied from its template only when
// there are answers to write into it. Until then a required document is
// `pending`: its questions are still asked, in order, and `status` says to
// create it.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as docs from "./checks.mjs";

const { ROOT, isFile, isPlainObject, isTextList, pyRepr, readText, sorted, sortedObject, splitLines } = docs;

export const ONBOARDING_FILE = "onboarding.json";
const ONBOARDING_SCHEMA = 1;
export const STATE_FILE = ".groundwork/state.json";
const STATE_SCHEMA = 1;
export const CONFIG_FILE = ".groundwork/config.json";

// Question and section states. Each means something different: deferred is
// not done (it comes back later), not_applicable is settled, assumed is not
// approved. Everything that isn't settled yet — skipped for now, not known
// yet, waiting on something else — is deferred, with a note saying why.
export const STATES = ["unasked", "answered", "confirmed", "assumed", "not_applicable", "deferred"];
const RESOLVED = new Set(["answered", "confirmed", "not_applicable"]);
export const OPEN = ["deferred"];
export const NEEDS_NOTE = new Set(["assumed"]);
export const DOCUMENT_STATES = ["deferred", "not_applicable"];
// States from before Groundwork 4.0. State files and `mark` commands that use
// them still work: each becomes `deferred`, keeping its meaning in the note.
export const LEGACY_STATES = { skipped: "deferred", unknown: "deferred", blocked: "deferred" };

/** A legacy state's replacement entry: deferred, with the old meaning in the note. */
export function upgradeEntry(entry) {
  if (!isPlainObject(entry) || !(entry.state in LEGACY_STATES)) return entry;
  const old = entry.state;
  const note = typeof entry.note === "string" && entry.note.trim() ? `${old}: ${entry.note.trim()}` : old;
  return { ...entry, state: LEGACY_STATES[old], note };
}

function upgradeState(data) {
  for (const qid of Object.keys(data.questions)) data.questions[qid] = upgradeEntry(data.questions[qid]);
  for (const entry of Object.values(data.documents)) {
    if (!isPlainObject(entry)) continue;
    if ("state" in entry) Object.assign(entry, upgradeEntry(entry));
    if (isPlainObject(entry.sections)) {
      for (const id of Object.keys(entry.sections)) entry.sections[id] = upgradeEntry(entry.sections[id]);
    }
  }
  return data;
}
export const DISCOVERY_STATES = ["declined", "complete"];
export const SOURCES = ["developer", "repository", "agent"];
const STAGES = ["discovery", "design", "as-needed"];
const AUTONOMY = ["guided", "balanced", "autonomous"];
const DEFAULT_AUTONOMY = "balanced";

const QUESTION_ID = /^[a-z][a-z0-9_]*$/;
const SECTION_ID = /^[a-z][a-z0-9-]*$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const NUMBERING = /^\d+(?:\.\d+)*\.?\s+/;
const AUTONOMY_BULLET = /^\s*-\s*Autonomy:\s*(.*?)\s*$/i;

const DOCUMENT_FIELDS = new Set(["purpose", "stage", "priority", "depends_on", "skip", "sections"]);
const SECTION_FIELDS = new Set(["id", "heading", "required", "only_when_needed", "questions", "uses", "done_when", "applies_when"]);
const FILE_FIELDS = new Set(["schema", "questions", "documents", "extends", "needs"]);
const QUESTION_FIELDS = new Set(["ask", "why", "examples", "explain", "confirm", "applies_when"]);

/** Today's local date, YYYY-MM-DD. */
export function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function unknownFields(data, allowed) {
  return sorted(Object.keys(data).filter((key) => !allowed.has(key)));
}

// --- Markdown sections ------------------------------------------------------

/** A heading compared without its numbering or case: '1. Purpose' -> 'purpose'. */
function headingKey(text) {
  return text.trim().replace(NUMBERING, "").trim().toLowerCase();
}

/** [level, key, line index] for every heading outside fenced code. */
function headings(text) {
  const found = [];
  let fenced = false;
  splitLines(text).forEach((line, index) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    const match = fenced ? null : line.match(HEADING);
    if (match) found.push([match[1].length, headingKey(match[2]), index]);
  });
  return found;
}

/** The text under a heading, up to the next heading of the same or higher level. */
export function sectionBody(text, heading) {
  const lines = splitLines(text);
  const marks = headings(text);
  const key = headingKey(heading);
  for (let position = 0; position < marks.length; position++) {
    const [level, found, index] = marks[position];
    if (found !== key) continue;
    let end = lines.length;
    for (const [laterLevel, , laterIndex] of marks.slice(position + 1)) {
      if (laterLevel <= level) {
        end = laterIndex;
        break;
      }
    }
    const body = lines.slice(index + 1, end).map((line) => line.trimEnd());
    while (body.length && !body[0]) body.shift();
    while (body.length && !body[body.length - 1]) body.pop();
    return body.join("\n");
  }
  return null;
}

export function fingerprint(body) {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

function sectionFingerprints(text, sections) {
  const prints = {};
  for (const section of sections) {
    const body = sectionBody(text, section.heading);
    if (body !== null) prints[section.id] = fingerprint(body);
  }
  return prints;
}

// --- Onboarding definitions -------------------------------------------------

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateQuestion(qid, data) {
  const where = `question '${qid}'`;
  if (!QUESTION_ID.test(qid)) return [`${where}: IDs are lowercase letters, digits and underscores, starting with a letter`];
  if (!isPlainObject(data)) return [`${where}: must be an object`];
  const problems = unknownFields(data, QUESTION_FIELDS).map((key) => `${where}: unknown field '${key}'`);
  if (!isText(data.ask)) problems.push(`${where}: needs 'ask', the question in plain language`);
  for (const key of ["why", "explain", "applies_when"]) {
    if (key in data && !isText(data[key])) problems.push(`${where}: '${key}' must be a non-empty string`);
  }
  if ("examples" in data && !isTextList(data.examples, false)) {
    problems.push(`${where}: 'examples' must be a non-empty list of strings`);
  }
  if ("confirm" in data && typeof data.confirm !== "boolean") problems.push(`${where}: 'confirm' must be true or false`);
  return problems;
}

function validateSection(path, index, data) {
  let where = `${path} sections[${index}]`;
  if (!isPlainObject(data)) return [`${where}: must be an object`];
  const problems = unknownFields(data, SECTION_FIELDS).map((key) => `${where}: unknown field '${key}'`);
  if (typeof data.id !== "string" || !SECTION_ID.test(data.id)) {
    problems.push(`${where}: 'id' must be lowercase letters, digits and hyphens`);
  } else {
    where = `${path}#${data.id}`;
  }
  if (!isText(data.heading)) problems.push(`${where}: needs 'heading', the heading text in the template`);
  if (typeof data.required !== "boolean") problems.push(`${where}: 'required' must be true or false`);
  for (const key of ["questions", "uses"]) {
    if (key in data && !isTextList(data[key])) problems.push(`${where}: '${key}' must be a list of question IDs`);
  }
  if ("only_when_needed" in data && typeof data.only_when_needed !== "boolean") {
    problems.push(`${where}: 'only_when_needed' must be true or false`);
  }
  if (data.only_when_needed === true && data.required !== false) {
    problems.push(`${where}: a section that appears only when a profile needs it has 'required': false — the profile's 'needs' makes it required`);
  }
  if ((data.required === true || data.only_when_needed === true) && !isText(data.done_when)) {
    problems.push(`${where}: a required section needs 'done_when' saying when it is complete`);
  }
  for (const key of ["done_when", "applies_when"]) {
    if (key in data && !isText(data[key])) problems.push(`${where}: '${key}' must be a non-empty string`);
  }
  return problems;
}

function validateDocument(path, data) {
  if (!isPlainObject(data)) return [`${path}: must be an object`];
  const problems = unknownFields(data, DOCUMENT_FIELDS).map((key) => `${path}: unknown field '${key}'`);
  if (!isText(data.purpose)) problems.push(`${path}: needs 'purpose', what the document is responsible for`);
  if (!STAGES.includes(data.stage)) problems.push(`${path}: 'stage' must be one of ${STAGES.join(", ")}`);
  if ("priority" in data && (!Number.isInteger(data.priority) || data.priority < 1)) {
    problems.push(`${path}: 'priority' must be a whole number from 1`);
  }
  if ("depends_on" in data && !isTextList(data.depends_on)) problems.push(`${path}: 'depends_on' must be a list of document paths`);
  if ("skip" in data && !isText(data.skip)) problems.push(`${path}: 'skip' must be a non-empty string`);
  const sections = data.sections;
  if (!Array.isArray(sections) || !sections.length) return [...problems, `${path}: needs a non-empty 'sections' list`];
  const seen = new Set();
  sections.forEach((section, index) => {
    problems.push(...validateSection(path, index, section));
    if (isPlainObject(section) && typeof section.id === "string") {
      if (seen.has(section.id)) problems.push(`${path}#${section.id}: section listed more than once`);
      seen.add(section.id);
    }
  });
  return problems;
}

/** The template Groundwork ships for a document, or null for documents
 * shipped in place (their only copy is the project's own). */
export function templateText(owner, path) {
  const template = docs.templateFor(owner, path);
  return isFile(template) ? readText(template) : null;
}

/** [the onboarding registry built from every valid profile, problems].
 *
 * Registry:
 *   documents:  path -> definition plus 'owner'
 *   questions:  id -> definition plus 'profile', 'document', 'section'
 *   extensions: path -> section id -> [[profile, question id]]
 *   needs:      path -> section id -> [profiles that need the section] */
export function loadDefinitions(profiles, owners) {
  const registry = { documents: {}, questions: {}, extensions: {}, needs: {} };
  const problems = [];
  const raw = {};
  for (const profileId of sorted(Object.keys(profiles))) {
    const path = join(docs.PROFILES_DIR, profileId, ONBOARDING_FILE);
    if (!isFile(path)) continue;
    const where = docs.rel(path);
    let data;
    try {
      data = docs.readJson(path);
    } catch (error) {
      problems.push(`${where}: not valid JSON (${error.message})`);
      continue;
    }
    const found = validateFile(profileId, data, profiles, owners);
    problems.push(...found.map((problem) => `${where}: ${problem}`));
    if (!found.length) raw[profileId] = data;
  }

  // Questions are global: an ID means one question, asked in one place.
  for (const [profileId, data] of Object.entries(raw)) {
    const where = `.groundwork/profiles/${profileId}/${ONBOARDING_FILE}`;
    for (const [qid, question] of Object.entries(data.questions ?? {})) {
      if (qid in registry.questions) {
        problems.push(`${where}: question '${qid}' is also defined by the ${registry.questions[qid].profile} profile`);
        continue;
      }
      registry.questions[qid] = { ...question, profile: profileId };
    }
    for (const [path, document] of Object.entries(data.documents ?? {})) {
      registry.documents[path] = { ...document, owner: profileId };
    }
  }

  const askedIn = {};
  const askHere = (where, qid, place, path, sectionId) => {
    if (!(qid in registry.questions)) problems.push(`${where}: ${place} asks unknown question '${qid}'`);
    else if (qid in askedIn) {
      problems.push(
        `${where}: question '${qid}' is asked in both ${askedIn[qid]} and ${place} — ask it once and list it under 'uses' elsewhere`,
      );
    } else {
      askedIn[qid] = place;
      Object.assign(registry.questions[qid], { document: path, section: sectionId });
    }
  };

  for (const [profileId, data] of Object.entries(raw)) {
    const where = `.groundwork/profiles/${profileId}/${ONBOARDING_FILE}`;
    for (const [path, document] of Object.entries(data.documents ?? {})) {
      for (const section of document.sections) {
        for (const qid of section.questions ?? []) askHere(where, qid, `${path}#${section.id}`, path, section.id);
      }
    }
  }
  for (const [profileId, data] of Object.entries(raw)) {
    const where = `.groundwork/profiles/${profileId}/${ONBOARDING_FILE}`;
    for (const [path, sectionIds] of Object.entries(data.needs ?? {})) {
      const target = registry.documents[path];
      if (target === undefined) {
        problems.push(`${where}: needs ${path}, which has no onboarding definition`);
        continue;
      }
      for (const sectionId of sectionIds) {
        const section = target.sections.find((s) => s.id === sectionId);
        if (section === undefined) problems.push(`${where}: needs unknown section ${path}#${sectionId}`);
        else if (section.required) problems.push(`${where}: needs ${path}#${sectionId}, which every project has anyway`);
        else ((registry.needs[path] ??= {})[sectionId] ??= []).push(profileId);
      }
    }
  }
  for (const [profileId, data] of Object.entries(raw)) {
    const where = `.groundwork/profiles/${profileId}/${ONBOARDING_FILE}`;
    for (const [path, sections] of Object.entries(data.extends ?? {})) {
      const target = registry.documents[path];
      if (target === undefined) {
        problems.push(`${where}: extends ${path}, which has no onboarding definition`);
        continue;
      }
      for (const [sectionId, qids] of Object.entries(sections)) {
        const section = target.sections.find((s) => s.id === sectionId);
        if (section === undefined) {
          problems.push(`${where}: extends unknown section ${path}#${sectionId}`);
          continue;
        }
        if (section.only_when_needed && !(data.needs?.[path] ?? []).includes(sectionId)) {
          problems.push(
            `${where}: extends ${path}#${sectionId}, which is part of the document only when a profile needs it — list it under 'needs' too`,
          );
        }
        for (const qid of qids) {
          askHere(where, qid, `${path}#${sectionId} (${profileId} extension)`, path, sectionId);
          ((registry.extensions[path] ??= {})[sectionId] ??= []).push([profileId, qid]);
        }
      }
    }
  }

  for (const qid of sorted(Object.keys(registry.questions))) {
    if (!(qid in askedIn)) {
      problems.push(
        `.groundwork/profiles/${registry.questions[qid].profile}/${ONBOARDING_FILE}: question '${qid}' is never asked — list it in a section or remove it`,
      );
    }
  }
  for (const path of sorted(Object.keys(registry.documents))) {
    const document = registry.documents[path];
    const where = `.groundwork/profiles/${document.owner}/${ONBOARDING_FILE}`;
    for (const section of document.sections) {
      for (const qid of section.uses ?? []) {
        if (!(qid in registry.questions)) problems.push(`${where}: ${path}#${section.id} uses unknown question '${qid}'`);
      }
    }
    for (const dependency of document.depends_on ?? []) {
      if (dependency === path) problems.push(`${where}: ${path} depends on itself`);
      else if (!(dependency in owners)) problems.push(`${where}: ${path} depends on ${dependency}, which no profile has`);
    }
  }
  problems.push(...dependencyCycles(registry.documents));
  return [registry, problems];
}

function validateFile(profileId, data, profiles, owners) {
  if (!isPlainObject(data)) return ["must be a JSON object"];
  const problems = unknownFields(data, FILE_FIELDS).map((key) => `unknown field '${key}'`);
  if (data.schema !== ONBOARDING_SCHEMA) {
    problems.push(`schema is ${pyRepr(data.schema)}, but this checker understands ${ONBOARDING_SCHEMA}`);
  }
  let questions = data.questions ?? {};
  if (!isPlainObject(questions)) {
    problems.push("'questions' must be an object of question ID -> question");
    questions = {};
  }
  for (const [qid, question] of Object.entries(questions)) problems.push(...validateQuestion(qid, question));
  const documents = data.documents ?? {};
  if (!isPlainObject(documents)) return [...problems, "'documents' must be an object of document path -> definition"];
  const listed = new Set(profiles[profileId].documents.map((doc) => doc.path));
  for (const [path, document] of Object.entries(documents)) {
    if (owners[path] !== profileId) {
      const owner = owners[path];
      problems.push(
        `${path}: only a document's owner defines its onboarding` +
          (owner ? ` — the ${owner} profile owns it; use 'extends' to add questions` : " — no profile has this document"),
      );
      continue;
    }
    const found = validateDocument(path, document);
    problems.push(...found);
    if (found.length) continue;
    const text = templateText(profileId, path);
    if (text !== null) {
      const present = new Set(headings(text).map(([, key]) => key));
      for (const section of document.sections) {
        if (!present.has(headingKey(section.heading))) {
          problems.push(`${path}#${section.id}: heading '${section.heading}' is not in the template`);
        }
      }
    }
  }
  const extendsField = data.extends ?? {};
  if (
    !isPlainObject(extendsField) ||
    !Object.values(extendsField).every(
      (sections) => isPlainObject(sections) && Object.values(sections).every((qids) => isTextList(qids, false)),
    )
  ) {
    return [...problems, "'extends' must map a document path to {section ID: [question IDs]}"];
  }
  for (const path of Object.keys(extendsField)) {
    if (!listed.has(path)) problems.push(`extends ${path}, which this profile does not list in profile.json`);
    else if (owners[path] === profileId) problems.push(`extends ${path}, which it owns — put the questions in 'documents' instead`);
  }
  const needs = data.needs ?? {};
  if (!isPlainObject(needs) || !Object.values(needs).every((ids) => isTextList(ids, false))) {
    return [...problems, "'needs' must map a document path to [section IDs]"];
  }
  for (const path of Object.keys(needs)) {
    if (!listed.has(path)) problems.push(`needs ${path}, which this profile does not list in profile.json`);
  }
  return problems;
}

function dependencyCycles(documents) {
  const problems = [];
  const done = new Set();
  const active = [];
  const visit = (path) => {
    if (done.has(path)) return;
    if (active.includes(path)) {
      const cycle = [...active.slice(active.indexOf(path)), path];
      problems.push("onboarding dependencies form a cycle: " + cycle.join(" -> "));
      return;
    }
    active.push(path);
    for (const dependency of documents[path]?.depends_on ?? []) visit(dependency);
    active.pop();
    done.add(path);
  };
  for (const path of sorted(Object.keys(documents))) visit(path);
  return problems;
}

/** The active profiles that need a section. */
function neededBy(registry, path, sectionId, active) {
  return ((registry.needs[path] ?? {})[sectionId] ?? []).filter((profileId) => active.includes(profileId));
}

/** A document's sections with the questions asked in each, including
 * extensions from active profiles. A section that appears only when needed
 * is left out unless an active profile needs it (it is then required) or
 * `text`, the document as written, already has its heading. */
function sectionsFor(registry, path, active, text = null) {
  const document = registry.documents[path];
  if (document === undefined) return [];
  const extensions = registry.extensions[path] ?? {};
  const present = new Set(text === null ? [] : headings(text).map(([, key]) => key));
  const result = [];
  for (const section of document.sections) {
    const needers = neededBy(registry, path, section.id, active);
    if (section.only_when_needed && !needers.length && !present.has(headingKey(section.heading))) continue;
    result.push({
      ...section,
      required: section.required || needers.length > 0,
      neededBy: needers,
      questions: [
        ...(section.questions ?? []),
        ...(extensions[section.id] ?? []).filter(([profileId]) => active.includes(profileId)).map(([, qid]) => qid),
      ],
    });
  }
  return result;
}

/** Parts of a document that appear only when needed: [needed, not needed],
 * each a list of section definitions, for the active profiles. */
export function optionalParts(registry, path, active) {
  const needed = [];
  const other = [];
  for (const section of registry.documents[path]?.sections ?? []) {
    if (!section.only_when_needed) continue;
    (neededBy(registry, path, section.id, active).length ? needed : other).push(section);
  }
  return [needed, other];
}

/** Whether `text` has a heading for the section. */
export function hasSection(text, section) {
  return headings(text).some(([, key]) => key === headingKey(section.heading));
}

/** [start, end) line ranges of each heading's part: the heading, its text
 * and any blank lines up to the next heading of the same or higher level. */
function partRanges(text) {
  const marks = headings(text);
  const total = splitLines(text).length;
  return marks.map(([level, key, index], position) => {
    const next = marks.slice(position + 1).find(([laterLevel]) => laterLevel <= level);
    return { level, key, start: index, end: next ? next[2] : total };
  });
}

/** `text` without the parts for these sections. */
export function removeSections(text, sections) {
  const keys = new Set(sections.map((s) => headingKey(s.heading)));
  const drop = new Set();
  for (const range of partRanges(text)) {
    if (keys.has(range.key)) for (let line = range.start; line < range.end; line++) drop.add(line);
  }
  const lines = splitLines(text).filter((_, index) => !drop.has(index));
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

/** `text` with each section's part copied in from `template`, placed before
 * the next part that follows it in the template, or at the end. */
export function insertSections(text, template, sections) {
  const source = splitLines(template);
  for (const section of sections) {
    const key = headingKey(section.heading);
    const ranges = partRanges(template);
    const position = ranges.findIndex((r) => r.key === key);
    if (position < 0 || hasSection(text, section)) continue;
    const part = source.slice(ranges[position].start, ranges[position].end);
    while (part.length && !part[part.length - 1].trim()) part.pop();
    part.push("");
    const lines = splitLines(text.replace(/\n+$/, ""));
    const here = partRanges(lines.join("\n"));
    const level = ranges[position].level;
    const following = new Set(ranges.slice(position + 1).filter((r) => r.level === level).map((r) => r.key));
    const before = here.find((r) => r.level === level && following.has(r.key));
    if (before) lines.splice(before.start, 0, ...part);
    else lines.push("", ...part);
    text = lines.join("\n").replace(/\n+$/, "") + "\n";
  }
  return text;
}

// --- State ------------------------------------------------------------------

export function statePath(root = ROOT) {
  return join(root, ...STATE_FILE.split("/"));
}

export function emptyState() {
  return { schema: STATE_SCHEMA, updated: today(), documents: {}, questions: {} };
}

/** [the state (null when there is no file), any reason it can't be used]. */
export function readState(root = ROOT) {
  const path = statePath(root);
  if (!isFile(path)) return [null, []];
  let data;
  try {
    data = docs.readJson(path);
  } catch (error) {
    return [null, [`${STATE_FILE}: not valid JSON (${error.message})`]];
  }
  if (!isPlainObject(data) || data.schema !== STATE_SCHEMA) {
    return [null, [`${STATE_FILE}: not a schema ${STATE_SCHEMA} Groundwork state file`]];
  }
  for (const key of ["documents", "questions"]) {
    if (!isPlainObject(data[key])) return [null, [`${STATE_FILE}: '${key}' must be an object`]];
  }
  return [upgradeState(data), []];
}

function checkEntry(where, entry, allowed) {
  if (!isPlainObject(entry)) return [`${where}: must be an object`];
  const problems = [];
  if (!allowed.includes(entry.state)) problems.push(`${where}: state ${pyRepr(entry.state)} is not one of ${allowed.join(", ")}`);
  if ("note" in entry && typeof entry.note !== "string") problems.push(`${where}: 'note' must be text`);
  if ("source" in entry && !SOURCES.includes(entry.source)) {
    problems.push(`${where}: source ${pyRepr(entry.source)} is not one of ${SOURCES.join(", ")}`);
  }
  return problems;
}

/** [errors, warnings]. Errors are values the engine can't interpret;
 * warnings are references to documents, sections or questions that no
 * longer exist (after an upgrade or a profile change). */
export function validateState(state, registry, owners) {
  const errors = [];
  const warnings = [];
  if (state.discovery !== undefined && state.discovery !== null) {
    errors.push(...checkEntry(`${STATE_FILE}: discovery`, state.discovery, DISCOVERY_STATES));
  }
  for (const qid of sorted(Object.keys(state.questions))) {
    errors.push(...checkEntry(`${STATE_FILE}: question '${qid}'`, state.questions[qid], STATES));
    if (!(qid in registry.questions)) {
      warnings.push(`${STATE_FILE}: question '${qid}' is not defined by any profile — \`groundwork mark --repair\` drops it`);
    }
  }
  for (const path of sorted(Object.keys(state.documents))) {
    const entry = state.documents[path];
    const where = `${STATE_FILE}: ${path}`;
    if (!isPlainObject(entry)) {
      errors.push(`${where}: must be an object`);
      continue;
    }
    if ("state" in entry) errors.push(...checkEntry(where, entry, DOCUMENT_STATES));
    const sections = entry.sections ?? {};
    if (!isPlainObject(sections)) {
      errors.push(`${where}: 'sections' must be an object`);
      continue;
    }
    if (!(path in owners)) {
      warnings.push(`${where}: no profile has this document — \`groundwork mark --repair\` drops it`);
      continue;
    }
    const known = new Set((registry.documents[path]?.sections ?? []).map((s) => s.id));
    for (const sectionId of sorted(Object.keys(sections))) {
      errors.push(...checkEntry(`${where}#${sectionId}`, sections[sectionId], STATES));
      if (!known.has(sectionId)) warnings.push(`${where}#${sectionId}: no such section — \`groundwork mark --repair\` drops it`);
    }
  }
  return [errors, warnings];
}

/** [a usable state keeping every valid entry, what was dropped]. */
export function repairState(state, registry, owners) {
  if (state === null) return [emptyState(), []];
  const dropped = [];
  const fresh = emptyState();
  const discovery = state.discovery;
  if (discovery !== undefined && discovery !== null) {
    if (checkEntry("discovery", discovery, DISCOVERY_STATES).length) dropped.push("discovery");
    else fresh.discovery = discovery;
  }
  for (const [qid, entry] of Object.entries(state.questions ?? {})) {
    if (qid in registry.questions && !checkEntry(qid, entry, STATES).length) fresh.questions[qid] = entry;
    else dropped.push(`question ${qid}`);
  }
  for (const [path, entry] of Object.entries(state.documents ?? {})) {
    if (!(path in owners) || !isPlainObject(entry)) {
      dropped.push(path);
      continue;
    }
    const kept = {};
    if ("state" in entry) {
      if (checkEntry(path, entry, DOCUMENT_STATES).length) dropped.push(`${path} (document state)`);
      else for (const key of ["state", "note", "updated"]) if (key in entry) kept[key] = entry[key];
    }
    const known = new Set((registry.documents[path]?.sections ?? []).map((s) => s.id));
    const sections = isPlainObject(entry.sections) ? entry.sections : {};
    for (const [sectionId, section] of Object.entries(sections)) {
      if (known.has(sectionId) && !checkEntry(sectionId, section, STATES).length) (kept.sections ??= {})[sectionId] = section;
      else dropped.push(`${path}#${sectionId}`);
    }
    if (Object.keys(kept).length) fresh.documents[path] = kept;
  }
  return [fresh, dropped];
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function writeState(state, root = ROOT) {
  state.updated = today();
  state.questions = sortedObject(state.questions);
  state.documents = sortedObject(state.documents);
  writeJson(statePath(root), state);
}

/** Section fingerprints recorded in .groundwork/config.json, or {}. */
function readBaselines(root = ROOT) {
  let config;
  try {
    config = docs.readJson(join(root, ...CONFIG_FILE.split("/")));
  } catch {
    return {};
  }
  const sections = isPlainObject(config) ? config.sections : undefined;
  if (!isPlainObject(sections)) return {};
  const result = {};
  for (const [path, prints] of Object.entries(sections)) {
    if (isPlainObject(prints) && Object.values(prints).every((v) => typeof v === "string")) result[path] = prints;
  }
  return result;
}

/** Fingerprint the sections of documents still exactly as generated.
 *
 * Only files whose recorded hash still matches qualify, so a project's own
 * writing is never mistaken for template text. */
export function addBaselines(config, registry, paths, root = ROOT) {
  const sections = (config.sections ??= {});
  for (const path of paths) {
    const document = registry.documents[path];
    const target = join(root, ...path.split("/"));
    if (document === undefined || path in sections || !isFile(target)) continue;
    const digest = createHash("sha256").update(readFileSync(target)).digest("hex");
    if ((config.files ?? {})[path] !== digest) continue;
    sections[path] = sectionFingerprints(readText(target), document.sections);
  }
  config.sections = sortedObject(sections);
}

/** After Groundwork edits a document, move the fingerprint of each section
 * it changed that was still untouched, so its own edit doesn't look like
 * project writing. */
export function refreshBaselines(config, registry, path, before, after) {
  const prints = (config.sections ?? {})[path];
  const document = registry.documents[path];
  if (!prints || !Object.keys(prints).length || document === undefined) return;
  for (const section of document.sections) {
    const old = sectionBody(before, section.heading);
    const updated = sectionBody(after, section.heading);
    if (old === null || updated === null || old === updated) continue;
    if (prints[section.id] === fingerprint(old)) prints[section.id] = fingerprint(updated);
  }
}

// --- Autonomy (GROUNDWORK.md) -----------------------------------------------

/** [autonomy level, problem]. A missing file or line means the default. */
export function readAutonomy(root = ROOT) {
  for (const line of splitLines(readText(join(root, "GROUNDWORK.md")))) {
    const match = line.match(AUTONOMY_BULLET);
    if (match) {
      const value = docs.stripChars(match[1].trim(), "`*").toLowerCase();
      if (AUTONOMY.includes(value)) return [value, null];
      return [
        DEFAULT_AUTONOMY,
        `GROUNDWORK.md: autonomy '${match[1]}' is not one of ${AUTONOMY.join(", ")} — using ${DEFAULT_AUTONOMY}`,
      ];
    }
  }
  return [DEFAULT_AUTONOMY, null];
}

// --- Status -----------------------------------------------------------------

/** written, template, unknown, missing-heading or no-file. */
function contentStatus(path, section, text, prints, owner) {
  if (text === null) return "no-file";
  const body = sectionBody(text, section.heading);
  if (body === null) return "missing-heading";
  let baseline = prints[section.id];
  if (baseline === undefined) {
    const template = templateText(owner, path);
    const reference = template !== null ? sectionBody(template, section.heading) : null;
    if (reference === null) return "unknown";
    baseline = fingerprint(reference);
  }
  return fingerprint(body) === baseline ? "template" : "written";
}

/** One derived status for a section: complete, not_applicable, deferred,
 * needs-confirmation, ready-to-write, review, in-progress or not-started. */
function sectionStatus(explicit, questions, content, inputs = null) {
  if (explicit === "not_applicable" || OPEN.includes(explicit)) return explicit;
  const applicable = questions.filter((q) => q.state !== "not_applicable");
  if (explicit === "assumed" || applicable.some((q) => q.state === "assumed")) return "needs-confirmation";
  if (applicable.some((q) => q.state === "answered" && q.confirm)) return "needs-confirmation";
  // A section with no questions of its own is built from answers given
  // elsewhere (`uses`); it is ready once those are settled.
  const resolved =
    explicit === "answered" ||
    explicit === "confirmed" ||
    (questions.length > 0 && questions.every((q) => RESOLVED.has(q.state))) ||
    (!questions.length && Boolean(inputs && inputs.length) && inputs.every((state) => RESOLVED.has(state)));
  if (resolved) {
    if (questions.length && !applicable.length && (explicit === null || explicit === undefined)) return "not_applicable";
    return ["template", "no-file", "missing-heading"].includes(content) ? "ready-to-write" : "complete";
  }
  if (applicable.some((q) => q.state !== "unasked")) return "in-progress";
  if (content === "written") return "review";
  return "not-started";
}

export const CLOSED_SECTION = new Set(["complete", "not_applicable"]);
const CLOSED_DOCUMENT = new Set(["complete", "not_applicable", "deferred"]);

const asObject = (value) => (isPlainObject(value) ? value : {});

/** Everything `status` and `docs` report, worked out from the manifests, the
 * onboarding definitions, the state and the documents themselves. */
export function buildStatus(profiles, owners, registry, state, selected, root = ROOT, baselines = null) {
  state = state ?? emptyState();
  baselines = baselines ?? readBaselines(root);
  const active = docs.activeProfiles(selected, profiles);
  const required = docs.requiredDocuments(active, profiles);
  const optional = {};
  for (const profileId of active) {
    for (const doc of profiles[profileId].documents) {
      if (!doc.required && !(doc.path in required) && !(doc.path in optional)) optional[doc.path] = doc.when;
    }
  }

  const documents = [];
  for (const path of sorted(new Set([...Object.keys(required), ...Object.keys(optional)]))) {
    const owner = owners[path] ?? docs.CORE;
    const definition = registry.documents[path];
    const entry = asObject(state.documents[path]);
    const target = join(root, ...path.split("/"));
    const fileExists = isFile(target);
    const text = fileExists ? readText(target) : null;
    const sections = [];
    for (const section of sectionsFor(registry, path, active, text)) {
      const questions = section.questions.map((qid) => {
        const question = registry.questions[qid] ?? {};
        const recorded = asObject(state.questions[qid]);
        return {
          id: qid,
          ask: question.ask ?? "",
          why: question.why ?? null,
          explain: question.explain ?? null,
          examples: question.examples ?? [],
          confirm: Boolean(question.confirm),
          appliesWhen: question.applies_when ?? null,
          profile: question.profile ?? null,
          state: recorded.state ?? "unasked",
          note: recorded.note ?? null,
          source: recorded.source ?? null,
        };
      });
      const recorded = asObject(asObject(entry.sections)[section.id]);
      const content = contentStatus(path, section, text, baselines[path] ?? {}, owner);
      sections.push({
        id: section.id,
        heading: section.heading,
        required: section.required,
        onlyWhenNeeded: Boolean(section.only_when_needed),
        neededBy: section.neededBy,
        doneWhen: section.done_when ?? null,
        appliesWhen: section.applies_when ?? null,
        uses: section.uses ?? [],
        state: recorded.state ?? null,
        note: recorded.note ?? null,
        content,
        status: sectionStatus(
          recorded.state ?? null,
          questions,
          content,
          (section.uses ?? []).map((qid) => asObject(state.questions[qid]).state ?? "unasked"),
        ),
        questions,
      });
    }
    // Parts the project can add when they apply, though no profile needs them.
    const shown = new Set(sections.map((s) => s.id));
    const addable = (definition?.sections ?? [])
      .filter((s) => s.only_when_needed && !shown.has(s.id))
      .map((s) => ({ id: s.id, heading: s.heading, appliesWhen: s.applies_when ?? null }));
    const explicit = entry.state ?? null;
    let status;
    if (explicit) status = explicit;
    else if (!fileExists) {
      // Documents are written when there is something to put in them; only
      // one without a template (PROJECT.md, AGENTS.md) can be missing.
      if (!(path in required)) status = "available";
      else if (templateText(owner, path) === null) status = "missing";
      else status = "pending";
    } else if (definition === undefined) status = "untracked";
    else {
      // Optional sections count once someone has worked on them, and not
      // while they are deferred.
      const relevant = sections.filter((s) => s.required || !["not-started", "deferred"].includes(s.status));
      if (sections.every((s) => s.status === "not-started")) status = "not-started";
      else if (relevant.length && relevant.every((s) => CLOSED_SECTION.has(s.status))) status = "complete";
      else status = "in-progress";
    }
    documents.push({
      path,
      owner,
      required: path in required,
      requiredBy: required[path] ?? [],
      when: optional[path] ?? null,
      exists: fileExists,
      defined: definition !== undefined,
      purpose: definition?.purpose ?? null,
      stage: definition?.stage ?? "as-needed",
      priority: definition?.priority ?? 50,
      dependsOn: definition?.depends_on ?? [],
      skip: definition?.skip ?? null,
      state: explicit,
      note: entry.note ?? null,
      status,
      sections,
      addable,
    });
  }

  const byPath = Object.fromEntries(documents.map((d) => [d.path, d]));
  const discoveryDocs = documents.filter((d) => d.stage === "discovery" && d.defined);
  const override = asObject(state.discovery).state ?? null;
  // Answers recorded while the project was created (`setup`), and the text
  // written for them then, don't count as discovery having started: the
  // first session still introduces it.
  const fromSetup = (question) => {
    const recorded = state.questions[question.id];
    return isPlainObject(recorded) && Boolean(recorded.setup);
  };
  let started = false;
  for (const doc of discoveryDocs) {
    const entry = asObject(state.documents[doc.path]);
    if (entry.state || Object.values(asObject(entry.sections)).some((e) => isPlainObject(e) && !e.setup)) started = true;
    for (const section of doc.sections) {
      const questions = section.questions;
      if (section.content === "written" && !(questions.length && questions.every(fromSetup))) started = true;
      for (const question of questions) {
        const recorded = state.questions[question.id];
        if (isPlainObject(recorded) && !recorded.setup) started = true;
      }
    }
  }
  let discovery;
  if (override) discovery = override;
  else if (!started) discovery = "not-started";
  else if (selected !== null && discoveryDocs.every((d) => CLOSED_DOCUMENT.has(d.status))) discovery = "complete";
  else discovery = "in-progress";

  const attention = [];
  const openItems = [];
  for (const doc of documents) {
    if (OPEN.includes(doc.state)) openItems.push({ target: doc.path, state: doc.state, note: doc.note });
    for (const section of doc.sections) {
      const target = `${doc.path}#${section.id}`;
      const base = { document: doc.path, section: section.id };
      if (section.status === "needs-confirmation") {
        const waiting = section.questions.filter((q) => q.state === "assumed" || (q.state === "answered" && q.confirm));
        for (const q of waiting) {
          attention.push({ kind: "confirm", target: q.id, ...base, text: q.note || q.ask, state: q.state });
        }
        if (section.state === "assumed") {
          attention.push({ kind: "confirm", target, ...base, text: section.note || section.heading, state: "assumed" });
        }
      } else if (section.status === "review" && !CLOSED_DOCUMENT.has(doc.status)) {
        attention.push({
          kind: "review",
          target,
          ...base,
          text: `'${section.heading}' has content that onboarding hasn't reviewed — read it before asking`,
        });
      } else if (section.status === "ready-to-write") {
        let text = `'${section.heading}' is answered: create the document (\`groundwork add ${doc.path}\`) and write it`;
        if (section.content === "missing-heading") {
          text = `'${section.heading}' is answered but not in the document: \`groundwork add ${target}\` copies the part from the template`;
        } else if (doc.exists) {
          text = `'${section.heading}' is answered but the document still holds the template text`;
        }
        attention.push({ kind: "write", target, ...base, text });
      } else if (section.content === "missing-heading" && doc.exists && !section.onlyWhenNeeded) {
        // A part that appears only when needed is added once there is
        // something to write in it; any other section lost its heading.
        attention.push({
          kind: "heading",
          target,
          ...base,
          text: `heading '${section.heading}' not found — rename the section's heading to it (or add it) so onboarding can see the section`,
        });
      }
      if (OPEN.includes(section.status)) openItems.push({ target, state: section.status, note: section.note });
      for (const q of section.questions) {
        if (OPEN.includes(q.state)) openItems.push({ target: q.id, state: q.state, note: q.note, document: doc.path });
      }
    }
  }

  const steps = [];
  if (selected === null) {
    steps.push({
      kind: "choose-profiles",
      text: "Profiles are not chosen yet: learn what the project does, then recommend profiles (.groundwork/profiles/README.md) and run `groundwork init` once the developer agrees.",
    });
  }
  for (const doc of documents) {
    if (doc.status === "missing") {
      steps.push({
        kind: "missing",
        document: doc.path,
        text: `${doc.path} is required by ${doc.requiredBy.join(", ")} but missing — restore it from the Groundwork release`,
      });
    }
  }

  const ready = (doc) => doc.dependsOn.every((dep) => CLOSED_DOCUMENT.has((byPath[dep] ?? { status: "complete" }).status));

  // Progressive: discovery first, then the design-stage documents; the rest
  // wait until the work reaches them. Declining discovery stops all
  // prompting — the agent flags gaps only when they affect a task.
  const stages = discovery === "declined" ? [] : discovery === "complete" ? ["design"] : ["discovery"];
  let focus = null;
  if (stages.length) {
    // A document doesn't have to exist to be next: its questions come first,
    // and the agent creates it once there are answers to write.
    const candidates = documents.filter(
      (d) =>
        d.defined &&
        (d.exists || d.required) &&
        stages.includes(d.stage) &&
        !CLOSED_DOCUMENT.has(d.status) &&
        !OPEN.includes(d.status) &&
        ready(d),
    );
    candidates.sort((a, b) => a.priority - b.priority || docs.byCodePoint(a.path, b.path));
    if (candidates.length) {
      const doc = candidates[0];
      const section = doc.sections.find(
        (s) => !CLOSED_SECTION.has(s.status) && !OPEN.includes(s.status) && s.status !== "needs-confirmation",
      );
      if (section !== undefined) {
        focus = {
          document: doc.path,
          exists: doc.exists,
          purpose: doc.purpose,
          section: section.id,
          heading: section.heading,
          status: section.status,
          doneWhen: section.doneWhen,
          uses: section.uses,
          questions: section.questions.filter((q) => q.state === "unasked"),
        };
      }
    }
  }

  const later = documents
    .filter(
      (d) =>
        d.defined &&
        (d.exists || d.required) &&
        !stages.includes(d.stage) &&
        !CLOSED_DOCUMENT.has(d.status) &&
        !OPEN.includes(d.status),
    )
    .map((d) => d.path);
  const available = documents.filter((d) => d.status === "available").map((d) => ({ path: d.path, when: d.when }));

  const counts = {};
  for (const doc of documents) counts[doc.status] = (counts[doc.status] ?? 0) + 1;
  return {
    profiles: selected,
    active,
    discovery,
    discoveryNote: asObject(state.discovery).note ?? null,
    counts,
    documents,
    attention,
    open: openItems,
    steps,
    focus,
    later,
    available,
  };
}
