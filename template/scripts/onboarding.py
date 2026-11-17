"""Onboarding: what each document needs, and how far the project has got.

Used by `check_docs.py` (validation) and `groundwork.py` (status, docs,
mark). Python 3 standard library only.

Three sources, each with one job:

- `profiles/<id>/profile.json` (unchanged): which documents exist, who owns
  them, when optional ones apply.
- `profiles/<id>/onboarding.json`: how each document the profile owns is
  onboarded — its purpose, stage, sections (anchored to the template's
  headings), the questions asked for each section, and when a section is
  done. A profile may also add questions to sections of core documents it
  lists (`extends`). Every question is asked in exactly one section, so an
  answer has one home; other sections name it under `uses`.
- `.groundwork/state.json`: progress only — the state of each question,
  section and document, with short notes for skipped, deferred, unknown,
  blocked and assumed items. It never holds answers: the documents do.

`.groundwork/config.json` records what Groundwork generated: each file's
hash and, under `sections`, a fingerprint of each section as generated.
That is how a section of template text is told apart from the project's
own writing, and why losing the state file loses no content information.

When the state and the documents disagree, the documents win: a section
whose text changed since it was generated counts as written, whatever the
state says.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import re
from pathlib import Path

import check_docs as docs

ROOT = docs.ROOT
ONBOARDING_FILE = "onboarding.json"
ONBOARDING_SCHEMA = 1
STATE_FILE = ".groundwork/state.json"
STATE_SCHEMA = 1
CONFIG_FILE = ".groundwork/config.json"
GROUNDWORK = ROOT / "GROUNDWORK.md"

# Question and section states. Each means something different:
# skipped is not not_applicable, unknown is not skipped, deferred is not done,
# assumed is not approved.
STATES = (
    "unasked",
    "answered",
    "confirmed",
    "assumed",
    "skipped",
    "not_applicable",
    "deferred",
    "unknown",
    "blocked",
)
RESOLVED = {"answered", "confirmed", "not_applicable"}
OPEN = ("skipped", "deferred", "unknown", "blocked")
NEEDS_NOTE = {"assumed", "blocked"}
DOCUMENT_STATES = ("skipped", "deferred", "not_applicable", "unknown", "blocked")
DISCOVERY_STATES = ("declined", "complete")
SOURCES = ("developer", "repository", "agent")
STAGES = ("discovery", "design", "as-needed")
AUTONOMY = ("guided", "balanced", "autonomous")
DEFAULT_AUTONOMY = "balanced"

QUESTION_ID = re.compile(r"[a-z][a-z0-9_]*")
SECTION_ID = re.compile(r"[a-z][a-z0-9-]*")
HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")
NUMBERING = re.compile(r"^\d+(?:\.\d+)*\.?\s+")
AUTONOMY_BULLET = re.compile(r"^\s*-\s*Autonomy:\s*(.*?)\s*$", re.IGNORECASE)

DOCUMENT_FIELDS = {"purpose", "stage", "priority", "depends_on", "skip", "sections"}
SECTION_FIELDS = {"id", "heading", "required", "questions", "uses", "done_when", "applies_when"}
QUESTION_FIELDS = {"ask", "why", "examples", "explain", "confirm", "applies_when"}


def today() -> str:
    return datetime.date.today().isoformat()


# --- Markdown sections ------------------------------------------------------


def heading_key(text: str) -> str:
    """A heading compared without its numbering or case: '1. Purpose' -> 'purpose'."""
    return NUMBERING.sub("", text.strip()).strip().lower()


def headings(text: str) -> list[tuple[int, str, int]]:
    """(level, key, line index) for every heading outside fenced code."""
    found, fenced = [], False
    for index, line in enumerate(text.splitlines()):
        if FENCE.match(line):
            fenced = not fenced
            continue
        match = None if fenced else HEADING.match(line)
        if match:
            found.append((len(match.group(1)), heading_key(match.group(2)), index))
    return found


def section_body(text: str, heading: str) -> str | None:
    """The text under a heading, up to the next heading of the same or higher level."""
    lines = text.splitlines()
    marks = headings(text)
    key = heading_key(heading)
    for position, (level, found, index) in enumerate(marks):
        if found != key:
            continue
        end = len(lines)
        for later_level, _, later_index in marks[position + 1 :]:
            if later_level <= level:
                end = later_index
                break
        body = [line.rstrip() for line in lines[index + 1 : end]]
        while body and not body[0]:
            body.pop(0)
        while body and not body[-1]:
            body.pop()
        return "\n".join(body)
    return None


def fingerprint(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]


def section_fingerprints(text: str, sections: list[dict]) -> dict[str, str]:
    prints = {}
    for section in sections:
        body = section_body(text, section["heading"])
        if body is not None:
            prints[section["id"]] = fingerprint(body)
    return prints


# --- Onboarding definitions -------------------------------------------------


def is_text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_question(qid: str, data: object) -> list[str]:
    where = f"question '{qid}'"
    if not QUESTION_ID.fullmatch(qid):
        return [f"{where}: IDs are lowercase letters, digits and underscores, starting with a letter"]
    if not isinstance(data, dict):
        return [f"{where}: must be an object"]
    problems = [f"{where}: unknown field '{key}'" for key in sorted(data.keys() - QUESTION_FIELDS)]
    if not is_text(data.get("ask")):
        problems.append(f"{where}: needs 'ask', the question in plain language")
    for key in ("why", "explain", "applies_when"):
        if key in data and not is_text(data[key]):
            problems.append(f"{where}: '{key}' must be a non-empty string")
    if "examples" in data and not docs.is_text_list(data["examples"], allow_empty=False):
        problems.append(f"{where}: 'examples' must be a non-empty list of strings")
    if "confirm" in data and not isinstance(data["confirm"], bool):
        problems.append(f"{where}: 'confirm' must be true or false")
    return problems


def validate_section(path: str, index: int, data: object) -> list[str]:
    where = f"{path} sections[{index}]"
    if not isinstance(data, dict):
        return [f"{where}: must be an object"]
    problems = [f"{where}: unknown field '{key}'" for key in sorted(data.keys() - SECTION_FIELDS)]
    if not isinstance(data.get("id"), str) or not SECTION_ID.fullmatch(data["id"]):
        problems.append(f"{where}: 'id' must be lowercase letters, digits and hyphens")
    else:
        where = f"{path}#{data['id']}"
    if not is_text(data.get("heading")):
        problems.append(f"{where}: needs 'heading', the heading text in the template")
    if not isinstance(data.get("required"), bool):
        problems.append(f"{where}: 'required' must be true or false")
    for key in ("questions", "uses"):
        if key in data and not docs.is_text_list(data[key]):
            problems.append(f"{where}: '{key}' must be a list of question IDs")
    if data.get("required") is True and not is_text(data.get("done_when")):
        problems.append(f"{where}: a required section needs 'done_when' saying when it is complete")
    for key in ("done_when", "applies_when"):
        if key in data and not is_text(data[key]):
            problems.append(f"{where}: '{key}' must be a non-empty string")
    return problems


def validate_document(path: str, data: object) -> list[str]:
    if not isinstance(data, dict):
        return [f"{path}: must be an object"]
    problems = [f"{path}: unknown field '{key}'" for key in sorted(data.keys() - DOCUMENT_FIELDS)]
    if not is_text(data.get("purpose")):
        problems.append(f"{path}: needs 'purpose', what the document is responsible for")
    if data.get("stage") not in STAGES:
        problems.append(f"{path}: 'stage' must be one of {', '.join(STAGES)}")
    if "priority" in data and (
        not isinstance(data["priority"], int) or isinstance(data["priority"], bool) or data["priority"] < 1
    ):
        problems.append(f"{path}: 'priority' must be a whole number from 1")
    if "depends_on" in data and not docs.is_text_list(data["depends_on"]):
        problems.append(f"{path}: 'depends_on' must be a list of document paths")
    if "skip" in data and not is_text(data["skip"]):
        problems.append(f"{path}: 'skip' must be a non-empty string")
    sections = data.get("sections")
    if not isinstance(sections, list) or not sections:
        return problems + [f"{path}: needs a non-empty 'sections' list"]
    seen: set[str] = set()
    for index, section in enumerate(sections):
        found = validate_section(path, index, section)
        problems += found
        if isinstance(section, dict) and isinstance(section.get("id"), str):
            if section["id"] in seen:
                problems.append(f"{path}#{section['id']}: section listed more than once")
            seen.add(section["id"])
    return problems


def template_text(owner: str, path: str) -> str | None:
    """The template Groundwork ships for a document, or None for documents
    shipped in place (their only copy is the project's own)."""
    template = docs.template_for(owner, path)
    return docs.read_text(template) if template.is_file() else None


def load_definitions(profiles: dict[str, dict], owners: dict[str, str]) -> tuple[dict, list[str]]:
    """The onboarding registry built from every valid profile, and the problems found.

    Registry:
      documents:  path -> definition plus 'owner'
      questions:  id -> definition plus 'profile', 'document', 'section'
      extensions: path -> section id -> [(profile, question id)]
    """
    registry: dict = {"documents": {}, "questions": {}, "extensions": {}}
    problems: list[str] = []
    raw: dict[str, dict] = {}
    for profile_id in sorted(profiles):
        path = docs.PROFILES_DIR / profile_id / ONBOARDING_FILE
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            problems.append(f"{rel}: not valid JSON ({error})")
            continue
        found = validate_file(profile_id, data, profiles, owners)
        problems += [f"{rel}: {problem}" for problem in found]
        if not found:
            raw[profile_id] = data

    # Questions are global: an ID means one question, asked in one place.
    for profile_id, data in raw.items():
        rel = f"profiles/{profile_id}/{ONBOARDING_FILE}"
        for qid, question in data.get("questions", {}).items():
            if qid in registry["questions"]:
                problems.append(f"{rel}: question '{qid}' is also defined by the {registry['questions'][qid]['profile']} profile")
                continue
            registry["questions"][qid] = dict(question, profile=profile_id)
        for path, document in data.get("documents", {}).items():
            registry["documents"][path] = dict(document, owner=profile_id)

    asked_in: dict[str, str] = {}

    def ask_here(rel: str, qid: str, place: str, path: str, section_id: str) -> None:
        if qid not in registry["questions"]:
            problems.append(f"{rel}: {place} asks unknown question '{qid}'")
        elif qid in asked_in:
            problems.append(
                f"{rel}: question '{qid}' is asked in both {asked_in[qid]} and {place}"
                " — ask it once and list it under 'uses' elsewhere"
            )
        else:
            asked_in[qid] = place
            registry["questions"][qid].update(document=path, section=section_id)

    for profile_id, data in raw.items():
        rel = f"profiles/{profile_id}/{ONBOARDING_FILE}"
        for path, document in data.get("documents", {}).items():
            for section in document["sections"]:
                for qid in section.get("questions", []):
                    ask_here(rel, qid, f"{path}#{section['id']}", path, section["id"])
    for profile_id, data in raw.items():
        rel = f"profiles/{profile_id}/{ONBOARDING_FILE}"
        for path, sections in data.get("extends", {}).items():
            target = registry["documents"].get(path)
            if target is None:
                problems.append(f"{rel}: extends {path}, which has no onboarding definition")
                continue
            ids = {section["id"] for section in target["sections"]}
            for section_id, qids in sections.items():
                if section_id not in ids:
                    problems.append(f"{rel}: extends unknown section {path}#{section_id}")
                    continue
                for qid in qids:
                    ask_here(rel, qid, f"{path}#{section_id} ({profile_id} extension)", path, section_id)
                    registry["extensions"].setdefault(path, {}).setdefault(section_id, []).append((profile_id, qid))

    for qid, question in sorted(registry["questions"].items()):
        if qid not in asked_in:
            problems.append(f"profiles/{question['profile']}/{ONBOARDING_FILE}: question '{qid}' is never asked — list it in a section or remove it")
    for path, document in sorted(registry["documents"].items()):
        rel = f"profiles/{document['owner']}/{ONBOARDING_FILE}"
        for section in document["sections"]:
            for qid in section.get("uses", []):
                if qid not in registry["questions"]:
                    problems.append(f"{rel}: {path}#{section['id']} uses unknown question '{qid}'")
        for dependency in document.get("depends_on", []):
            if dependency == path:
                problems.append(f"{rel}: {path} depends on itself")
            elif dependency not in owners:
                problems.append(f"{rel}: {path} depends on {dependency}, which no profile has")
    problems += dependency_cycles(registry["documents"])
    return registry, problems


def validate_file(profile_id: str, data: object, profiles: dict[str, dict], owners: dict[str, str]) -> list[str]:
    if not isinstance(data, dict):
        return ["must be a JSON object"]
    problems = [f"unknown field '{key}'" for key in sorted(data.keys() - {"schema", "questions", "documents", "extends"})]
    if data.get("schema") != ONBOARDING_SCHEMA:
        problems.append(f"schema is {data.get('schema')!r}, but this checker understands {ONBOARDING_SCHEMA}")
    questions = data.get("questions", {})
    if not isinstance(questions, dict):
        problems.append("'questions' must be an object of question ID -> question")
        questions = {}
    for qid, question in questions.items():
        problems += validate_question(qid, question)
    documents = data.get("documents", {})
    if not isinstance(documents, dict):
        return problems + ["'documents' must be an object of document path -> definition"]
    listed = {doc["path"] for doc in profiles[profile_id]["documents"]}
    for path, document in documents.items():
        if owners.get(path) != profile_id:
            owner = owners.get(path)
            problems.append(
                f"{path}: only a document's owner defines its onboarding"
                + (f" — the {owner} profile owns it; use 'extends' to add questions" if owner else " — no profile has this document")
            )
            continue
        found = validate_document(path, document)
        problems += found
        if found:
            continue
        text = template_text(profile_id, path)
        if text is not None:
            present = {key for _, key, _ in headings(text)}
            for section in document["sections"]:
                if heading_key(section["heading"]) not in present:
                    problems.append(f"{path}#{section['id']}: heading '{section['heading']}' is not in the template")
    extends = data.get("extends", {})
    if not isinstance(extends, dict) or not all(
        isinstance(sections, dict) and all(docs.is_text_list(qids, allow_empty=False) for qids in sections.values())
        for sections in extends.values()
    ):
        return problems + ["'extends' must map a document path to {section ID: [question IDs]}"]
    for path in extends:
        if path not in listed:
            problems.append(f"extends {path}, which this profile does not list in profile.json")
        elif owners.get(path) == profile_id:
            problems.append(f"extends {path}, which it owns — put the questions in 'documents' instead")
    return problems


def dependency_cycles(documents: dict[str, dict]) -> list[str]:
    problems, done, active = [], set(), []

    def visit(path: str) -> None:
        if path in done:
            return
        if path in active:
            cycle = active[active.index(path) :] + [path]
            problems.append("onboarding dependencies form a cycle: " + " -> ".join(cycle))
            return
        active.append(path)
        for dependency in documents.get(path, {}).get("depends_on", []):
            visit(dependency)
        active.pop()
        done.add(path)

    for path in sorted(documents):
        visit(path)
    return problems


def sections_for(registry: dict, path: str, active: list[str]) -> list[dict]:
    """A document's sections with the questions asked in each, including
    extensions from active profiles."""
    document = registry["documents"].get(path)
    if document is None:
        return []
    extensions = registry["extensions"].get(path, {})
    result = []
    for section in document["sections"]:
        qids = list(section.get("questions", []))
        qids += [qid for profile_id, qid in extensions.get(section["id"], []) if profile_id in active]
        result.append(dict(section, questions=qids))
    return result


# --- State ------------------------------------------------------------------


def state_path(root: Path = ROOT) -> Path:
    return root / STATE_FILE


def empty_state() -> dict:
    return {"schema": STATE_SCHEMA, "updated": today(), "documents": {}, "questions": {}}


def read_state(root: Path = ROOT) -> tuple[dict | None, list[str]]:
    """The state (None when there is no file) and any reason it can't be used."""
    path = state_path(root)
    if not path.is_file():
        return None, []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as error:
        return None, [f"{STATE_FILE}: not valid JSON ({error})"]
    if not isinstance(data, dict) or data.get("schema") != STATE_SCHEMA:
        return None, [f"{STATE_FILE}: not a schema {STATE_SCHEMA} Groundwork state file"]
    for key in ("documents", "questions"):
        if not isinstance(data.get(key), dict):
            return None, [f"{STATE_FILE}: '{key}' must be an object"]
    return data, []


def check_entry(where: str, entry: object, allowed: tuple[str, ...]) -> list[str]:
    if not isinstance(entry, dict):
        return [f"{where}: must be an object"]
    problems = []
    if entry.get("state") not in allowed:
        problems.append(f"{where}: state {entry.get('state')!r} is not one of {', '.join(allowed)}")
    if "note" in entry and not isinstance(entry["note"], str):
        problems.append(f"{where}: 'note' must be text")
    if "source" in entry and entry["source"] not in SOURCES:
        problems.append(f"{where}: source {entry['source']!r} is not one of {', '.join(SOURCES)}")
    return problems


def validate_state(state: dict, registry: dict, owners: dict[str, str]) -> tuple[list[str], list[str]]:
    """(errors, warnings). Errors are values the engine can't interpret;
    warnings are references to documents, sections or questions that no
    longer exist (after an upgrade or a profile change)."""
    errors: list[str] = []
    warnings: list[str] = []
    discovery = state.get("discovery")
    if discovery is not None:
        errors += check_entry(f"{STATE_FILE}: discovery", discovery, DISCOVERY_STATES)
    for qid, entry in sorted(state["questions"].items()):
        errors += check_entry(f"{STATE_FILE}: question '{qid}'", entry, STATES)
        if qid not in registry["questions"]:
            warnings.append(f"{STATE_FILE}: question '{qid}' is not defined by any profile — `groundwork mark --repair` drops it")
    for path, entry in sorted(state["documents"].items()):
        where = f"{STATE_FILE}: {path}"
        if not isinstance(entry, dict):
            errors.append(f"{where}: must be an object")
            continue
        if "state" in entry:
            errors += check_entry(where, entry, DOCUMENT_STATES)
        sections = entry.get("sections", {})
        if not isinstance(sections, dict):
            errors.append(f"{where}: 'sections' must be an object")
            continue
        if path not in owners:
            warnings.append(f"{where}: no profile has this document — `groundwork mark --repair` drops it")
            continue
        known = {s["id"] for s in registry["documents"].get(path, {}).get("sections", [])}
        for section_id, section in sorted(sections.items()):
            errors += check_entry(f"{where}#{section_id}", section, STATES)
            if section_id not in known:
                warnings.append(f"{where}#{section_id}: no such section — `groundwork mark --repair` drops it")
    return errors, warnings


def repair_state(state: dict | None, registry: dict, owners: dict[str, str]) -> tuple[dict, list[str]]:
    """A usable state keeping every valid entry, and what was dropped."""
    if state is None:
        return empty_state(), []
    dropped: list[str] = []
    fresh = empty_state()
    discovery = state.get("discovery")
    if discovery is not None:
        if check_entry("discovery", discovery, DISCOVERY_STATES):
            dropped.append("discovery")
        else:
            fresh["discovery"] = discovery
    for qid, entry in state.get("questions", {}).items():
        if qid in registry["questions"] and not check_entry(qid, entry, STATES):
            fresh["questions"][qid] = entry
        else:
            dropped.append(f"question {qid}")
    for path, entry in state.get("documents", {}).items():
        if path not in owners or not isinstance(entry, dict):
            dropped.append(path)
            continue
        kept: dict = {}
        if "state" in entry:
            if check_entry(path, entry, DOCUMENT_STATES):
                dropped.append(f"{path} (document state)")
            else:
                kept.update({k: entry[k] for k in ("state", "note", "updated") if k in entry})
        known = {s["id"] for s in registry["documents"].get(path, {}).get("sections", [])}
        sections = entry.get("sections") if isinstance(entry.get("sections"), dict) else {}
        for section_id, section in sections.items():
            if section_id in known and not check_entry(section_id, section, STATES):
                kept.setdefault("sections", {})[section_id] = section
            else:
                dropped.append(f"{path}#{section_id}")
        if kept:
            fresh["documents"][path] = kept
    return fresh, dropped


def write_state(state: dict, root: Path = ROOT) -> None:
    path = state_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated"] = today()
    state["questions"] = dict(sorted(state["questions"].items()))
    state["documents"] = dict(sorted(state["documents"].items()))
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_baselines(root: Path = ROOT) -> dict[str, dict[str, str]]:
    """Section fingerprints recorded in .groundwork/config.json, or {}."""
    try:
        config = json.loads((root / CONFIG_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    sections = config.get("sections") if isinstance(config, dict) else None
    if not isinstance(sections, dict):
        return {}
    return {
        path: prints
        for path, prints in sections.items()
        if isinstance(prints, dict) and all(isinstance(v, str) for v in prints.values())
    }


def add_baselines(config: dict, registry: dict, paths: list[str], root: Path = ROOT) -> None:
    """Fingerprint the sections of documents still exactly as generated.

    Only files whose recorded hash still matches qualify, so a project's own
    writing is never mistaken for template text."""
    sections = config.setdefault("sections", {})
    for path in paths:
        document = registry["documents"].get(path)
        target = root / path
        if document is None or path in sections or not target.is_file():
            continue
        if config.get("files", {}).get(path) != hashlib.sha256(target.read_bytes()).hexdigest():
            continue
        sections[path] = section_fingerprints(docs.read_text(target), document["sections"])
    config["sections"] = dict(sorted(sections.items()))


def refresh_baselines(config: dict, registry: dict, path: str, before: str, after: str) -> None:
    """After Groundwork edits a document, move the fingerprint of each
    section it changed that was still untouched, so its own edit doesn't
    look like project writing."""
    prints = config.get("sections", {}).get(path)
    document = registry["documents"].get(path)
    if not prints or document is None:
        return
    for section in document["sections"]:
        old, new = section_body(before, section["heading"]), section_body(after, section["heading"])
        if old is None or new is None or old == new:
            continue
        if prints.get(section["id"]) == fingerprint(old):
            prints[section["id"]] = fingerprint(new)


# --- Autonomy (GROUNDWORK.md) -----------------------------------------------


def read_autonomy(root: Path = ROOT) -> tuple[str, str | None]:
    """(autonomy level, problem). Missing file or line means the default."""
    for line in docs.read_text(root / "GROUNDWORK.md").splitlines():
        match = AUTONOMY_BULLET.match(line)
        if match:
            value = match.group(1).strip().strip("`*").lower()
            if value in AUTONOMY:
                return value, None
            return DEFAULT_AUTONOMY, (
                f"GROUNDWORK.md: autonomy '{match.group(1)}' is not one of {', '.join(AUTONOMY)}"
                f" — using {DEFAULT_AUTONOMY}"
            )
    return DEFAULT_AUTONOMY, None


# --- Status -----------------------------------------------------------------


def content_status(path: str, section: dict, text: str | None, prints: dict[str, str], owner: str) -> str:
    """written, template, unknown, missing-heading or no-file."""
    if text is None:
        return "no-file"
    body = section_body(text, section["heading"])
    if body is None:
        return "missing-heading"
    baseline = prints.get(section["id"])
    if baseline is None:
        template = template_text(owner, path)
        reference = section_body(template, section["heading"]) if template is not None else None
        if reference is None:
            return "unknown"
        baseline = fingerprint(reference)
    return "template" if fingerprint(body) == baseline else "written"


def section_status(explicit: str | None, questions: list[dict], content: str, inputs: list[str] | None = None) -> str:
    """One derived status for a section.

    complete, not_applicable, skipped, deferred, unknown, blocked,
    needs-confirmation, ready-to-write, review, in-progress, not-started."""
    if explicit in ("not_applicable",) + OPEN:
        return explicit
    applicable = [q for q in questions if q["state"] != "not_applicable"]
    if explicit == "assumed" or any(q["state"] == "assumed" for q in applicable):
        return "needs-confirmation"
    if any(q["state"] == "answered" and q.get("confirm") for q in applicable):
        return "needs-confirmation"
    # A section with no questions of its own is built from answers given
    # elsewhere (`uses`); it is ready once those are settled.
    resolved = explicit in ("answered", "confirmed") or (
        bool(questions) and all(q["state"] in RESOLVED for q in questions)
    ) or (not questions and bool(inputs) and all(state in RESOLVED for state in inputs))
    if resolved:
        if questions and not applicable and explicit is None:
            return "not_applicable"
        return "ready-to-write" if content == "template" else "complete"
    touched = [q for q in applicable if q["state"] != "unasked"]
    if touched:
        return "in-progress"
    if content == "written":
        return "review"
    return "not-started"


CLOSED_SECTION = {"complete", "not_applicable"}
CLOSED_DOCUMENT = {"complete", "not_applicable", "skipped", "deferred"}


def build_status(
    profiles: dict[str, dict],
    owners: dict[str, str],
    registry: dict,
    state: dict | None,
    selected: list[str] | None,
    root: Path = ROOT,
    baselines: dict[str, dict[str, str]] | None = None,
) -> dict:
    """Everything `status` and `docs` report, worked out from the manifests,
    the onboarding definitions, the state and the documents themselves."""
    state = state or empty_state()
    baselines = read_baselines(root) if baselines is None else baselines
    active = docs.active_profiles(selected, profiles)
    required = docs.required_documents(active, profiles)
    optional: dict[str, str] = {}
    for profile_id in active:
        for doc in profiles[profile_id]["documents"]:
            if not doc["required"] and doc["path"] not in required:
                optional.setdefault(doc["path"], doc["when"])

    documents = []
    for path in sorted(set(required) | set(optional)):
        owner = owners.get(path, docs.CORE)
        definition = registry["documents"].get(path)
        entry = state["documents"].get(path, {})
        exists = (root / path).is_file()
        text = docs.read_text(root / path) if exists else None
        sections = []
        for section in sections_for(registry, path, active):
            questions = []
            for qid in section["questions"]:
                question = registry["questions"].get(qid, {})
                recorded = state["questions"].get(qid, {})
                questions.append(
                    {
                        "id": qid,
                        "ask": question.get("ask", ""),
                        "why": question.get("why"),
                        "explain": question.get("explain"),
                        "examples": question.get("examples", []),
                        "confirm": bool(question.get("confirm")),
                        "appliesWhen": question.get("applies_when"),
                        "profile": question.get("profile"),
                        "state": recorded.get("state", "unasked"),
                        "note": recorded.get("note"),
                        "source": recorded.get("source"),
                    }
                )
            recorded = entry.get("sections", {}).get(section["id"], {})
            content = content_status(path, section, text, baselines.get(path, {}), owner)
            sections.append(
                {
                    "id": section["id"],
                    "heading": section["heading"],
                    "required": section["required"],
                    "doneWhen": section.get("done_when"),
                    "appliesWhen": section.get("applies_when"),
                    "uses": section.get("uses", []),
                    "state": recorded.get("state"),
                    "note": recorded.get("note"),
                    "content": content,
                    "status": section_status(
                        recorded.get("state"),
                        questions,
                        content,
                        [state["questions"].get(qid, {}).get("state", "unasked") for qid in section.get("uses", [])],
                    ),
                    "questions": questions,
                }
            )
        explicit = entry.get("state")
        if explicit:
            status = explicit
        elif not exists:
            status = "missing" if path in required else "available"
        elif definition is None:
            status = "untracked"
        else:
            # Optional sections count once someone has worked on them.
            relevant = [s for s in sections if s["required"] or s["status"] not in ("not-started", "skipped")]
            if all(s["status"] == "not-started" for s in sections):
                status = "not-started"
            elif relevant and all(s["status"] in CLOSED_SECTION for s in relevant):
                status = "complete"
            else:
                status = "in-progress"
        documents.append(
            {
                "path": path,
                "owner": owner,
                "required": path in required,
                "requiredBy": required.get(path, []),
                "when": optional.get(path),
                "exists": exists,
                "defined": definition is not None,
                "purpose": (definition or {}).get("purpose"),
                "stage": (definition or {}).get("stage", "as-needed"),
                "priority": (definition or {}).get("priority", 50),
                "dependsOn": (definition or {}).get("depends_on", []),
                "skip": (definition or {}).get("skip"),
                "state": explicit,
                "note": entry.get("note"),
                "status": status,
                "sections": sections,
            }
        )

    by_path = {d["path"]: d for d in documents}
    discovery_docs = [d for d in documents if d["stage"] == "discovery" and d["defined"]]
    override = (state.get("discovery") or {}).get("state")
    # Answers recorded while the project was created (`setup`) don't count
    # as discovery having started: the first session still introduces it.
    started = False
    for doc in discovery_docs:
        entry = state["documents"].get(doc["path"], {})
        if entry.get("state") or any(
            not e.get("setup") for e in entry.get("sections", {}).values() if isinstance(e, dict)
        ):
            started = True
        for section in doc["sections"]:
            if section["content"] == "written":
                started = True
            for question in section["questions"]:
                recorded = state["questions"].get(question["id"])
                if isinstance(recorded, dict) and not recorded.get("setup"):
                    started = True
    if override:
        discovery = override
    elif not started:
        discovery = "not-started"
    elif selected is not None and all(d["status"] in CLOSED_DOCUMENT for d in discovery_docs):
        discovery = "complete"
    else:
        discovery = "in-progress"

    attention, open_items = [], []
    for doc in documents:
        if doc["state"] in OPEN:
            open_items.append({"target": doc["path"], "state": doc["state"], "note": doc["note"]})
        for section in doc["sections"]:
            target = f"{doc['path']}#{section['id']}"
            if section["status"] == "needs-confirmation":
                waiting = [q for q in section["questions"] if q["state"] == "assumed" or (q["state"] == "answered" and q["confirm"])]
                for q in waiting:
                    attention.append({"kind": "confirm", "target": q["id"], "document": doc["path"], "section": section["id"],
                                      "text": q["note"] or q["ask"], "state": q["state"]})
                if section["state"] == "assumed":
                    attention.append({"kind": "confirm", "target": target, "document": doc["path"], "section": section["id"],
                                      "text": section["note"] or section["heading"], "state": "assumed"})
            elif section["status"] == "review" and doc["status"] not in CLOSED_DOCUMENT:
                attention.append({"kind": "review", "target": target, "document": doc["path"], "section": section["id"],
                                  "text": f"'{section['heading']}' has content that onboarding hasn't reviewed — read it before asking"})
            elif section["status"] == "ready-to-write":
                attention.append({"kind": "write", "target": target, "document": doc["path"], "section": section["id"],
                                  "text": f"'{section['heading']}' is answered but the document still holds the template text"})
            elif section["content"] == "missing-heading" and doc["exists"]:
                attention.append({"kind": "heading", "target": target, "document": doc["path"], "section": section["id"],
                                  "text": f"heading '{section['heading']}' not found — onboarding can't see this section"})
            if section["status"] in OPEN:
                open_items.append({"target": target, "state": section["status"], "note": section["note"]})
            for q in section["questions"]:
                if q["state"] in OPEN:
                    open_items.append({"target": q["id"], "state": q["state"], "note": q["note"], "document": doc["path"]})

    steps = []
    if selected is None:
        steps.append({"kind": "choose-profiles", "text": "Profiles are not chosen yet: learn what the project does, then recommend profiles (profiles/README.md) and run `groundwork init` once the developer agrees."})
    for doc in documents:
        if doc["status"] == "missing":
            steps.append({"kind": "missing", "document": doc["path"], "text": f"{doc['path']} is required by {', '.join(doc['requiredBy'])} but missing — run `groundwork init` with the current profiles"})

    def ready(doc: dict) -> bool:
        return all(by_path.get(dep, {"status": "complete"})["status"] in CLOSED_DOCUMENT for dep in doc["dependsOn"])

    # Progressive: discovery first, then the design-stage documents; the
    # rest wait until the work reaches them. Declining discovery stops all
    # prompting — the agent flags gaps only when they affect a task.
    stages = [] if discovery == "declined" else (["design"] if discovery == "complete" else ["discovery"])
    focus = None
    if stages:
        candidates = [
            d for d in documents
            if d["defined"] and d["exists"] and d["stage"] in stages and d["status"] not in CLOSED_DOCUMENT
            and d["status"] not in OPEN and ready(d)
        ]
        candidates.sort(key=lambda d: (d["priority"], d["path"]))
        if candidates:
            doc = candidates[0]
            section = next(
                (s for s in doc["sections"] if s["status"] not in CLOSED_SECTION and s["status"] not in OPEN and s["status"] != "needs-confirmation"),
                None,
            )
            if section is not None:
                ask = [q for q in section["questions"] if q["state"] == "unasked"]
                focus = {"document": doc["path"], "purpose": doc["purpose"], "section": section["id"],
                         "heading": section["heading"], "status": section["status"], "doneWhen": section["doneWhen"],
                         "uses": section["uses"], "questions": ask}

    later = [
        d["path"] for d in documents
        if d["defined"] and d["exists"] and d["stage"] not in stages
        and d["status"] not in CLOSED_DOCUMENT and d["status"] not in OPEN
    ]
    available = [{"path": d["path"], "when": d["when"]} for d in documents if d["status"] == "available"]

    counts: dict[str, int] = {}
    for doc in documents:
        counts[doc["status"]] = counts.get(doc["status"], 0) + 1
    return {
        "profiles": selected,
        "active": active,
        "discovery": discovery,
        "discoveryNote": (state.get("discovery") or {}).get("note"),
        "counts": counts,
        "documents": documents,
        "attention": attention,
        "open": open_items,
        "steps": steps,
        "focus": focus,
        "later": later,
        "available": available,
    }
