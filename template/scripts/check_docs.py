#!/usr/bin/env python3
"""Validate Groundwork documentation consistency.

What it checks (errors — exit 1):
1. `scaffold-manifest.json`: valid, sorted, and `file_count` matches the
   list. Template files must stay intact: every listed file must exist on
   disk, so a deleted template file must also be removed from the manifest.
   New files under the user-owned areas `src/`, `tests/`, `config/`,
   `infrastructure/` and `scripts/` (except `scripts/check_docs.py`,
   `scripts/groundwork.py` and `scripts/README.md`, which belong to the
   template) do not need to be listed, nor does Groundwork's own
   `.groundwork/` folder; new files elsewhere do.
2. The Feature Specification Index in `docs/product/SPEC.md` covers every
   feature specification under `docs/product/specs/` (excluding `_template`),
   and every indexed specification exists.
3. Requirement IDs (`{SCOPE}-{TYPE}-NNN`, TYPE is FR, NFR or BR):
   - grammar violations in markdown files;
   - an ID defined more than once — an ID counts as defined only when it is
     the first cell of a requirement table row in `docs/product/SPEC.md`, a
     feature spec, or (for capabilities) `docs/product/PRD.md`;
   - a feature spec's declared ID prefix must match the IDs it defines;
   - an ID referenced in a document under `docs/`, or in any file under
     `tests/` or `src/`, must be defined;
   - capability IDs (`CAP-NNN`) defined in the PRD must be unique, and a
     `CAP-NNN` referenced in a spec, another document under `docs/`, or a
     file under `tests/` or `src/` must be defined in the PRD;
   - a `CAP-` token that is not exactly three digits (such as `CAP-9999`)
     is a spelling error, checked in markdown and in files under `tests/`
     and `src/`. In code files nothing is skipped. Requirement ID spelling
     is not checked in code files, because code often holds tokens that
     only look like requirement IDs.
4. Relative markdown links between repository files resolve.
5. Profiles (only when a `profiles/` folder exists; see `profiles/README.md`):
   - every `profiles/<id>/profile.json` is valid JSON and matches the
     manifest schema, and its `id` matches its folder;
   - every document has exactly one owner: core, or the one profile that
     has a template for it. A profile may list only its own documents and
     core documents; every template must be listed by its profile;
   - the profiles named on the `- Profiles:` line in `PROJECT.md` exist,
     their dependencies (`requires`) are active, and no two active
     profiles are declared incompatible;
   - every document required by core or an active profile exists.

What it warns about (printed; only fails the run under the matching flag):
- hygiene warnings — fail under `--strict`:
  - a spec, `SYSTEM_DESIGN.md` or ADR status value outside the allowed
    vocabulary (checked only once the placeholder text has been replaced);
  - a capability in the PRD that no requirement serves;
  - a document owned by a profile that is not active (only once profiles
    are chosen in `PROJECT.md`);
  - a check an active profile declares that has no row in the tooling
    table in `AGENTS.md`.
- coverage warnings — fail under `--strict-coverage`:
  - a requirement defined but never referenced by any document under `docs/`
    or any file under `tests/` or `src/` (placeholder rows in the root
    `SPEC.md` are exempt).

Three modes: default (only errors fail), `--strict` (hygiene warnings fail
too), `--strict-coverage` (coverage warnings fail too). `--strict-coverage`
does not include `--strict`. Use both flags together to fail on everything.

Illustrative text: on a line containing "for example", "such as" or "e.g.",
IDs written inside inline code (backticks) are ignored. IDs outside inline
code on such lines are still checked. `docs/examples/` and the document
templates under `profiles/<id>/templates/` are ignored by the ID and link
checks; templates are checked once they are copied into place.

Run after adding, renaming or removing documents, feature specifications,
requirement IDs or links. Read-only; Python 3 standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scaffold-manifest.json"
PRD = ROOT / "docs" / "product" / "PRD.md"
SPEC = ROOT / "docs" / "product" / "SPEC.md"
SPECS_DIR = ROOT / "docs" / "product" / "specs"
DOCS = ROOT / "docs"
EXAMPLES_DIR = DOCS / "examples"
SYSTEM_DESIGN = ROOT / "docs" / "architecture" / "SYSTEM_DESIGN.md"
ADR_DIR = ROOT / "docs" / "architecture" / "adr"
ADR_TEMPLATE = "0000-template.md"
PROJECT = ROOT / "PROJECT.md"
AGENTS = ROOT / "AGENTS.md"
PROFILES_DIR = ROOT / "profiles"
PROFILE_FILE = "profile.json"
PROFILE_TEMPLATES = "templates"
CORE = "core"
PROFILE_SCHEMA = 1
# Fields every manifest has; ordinary profiles add the selection fields.
CORE_FIELDS = {"schema", "id", "name", "purpose", "documents"}
PROFILE_FIELDS = CORE_FIELDS | {"use_when", "not_when", "requires", "incompatible_with", "checks"}
PROFILE_ID = re.compile(r"[a-z][a-z0-9-]*")
# The active-profile line in PROJECT.md ("- Profiles: web, ai-systems").
PROFILES_BULLET = re.compile(r"^\s*-\s*Profiles:\s*(.*?)\s*$")

PLACEHOLDER_TARGETS = {"specs/feature-name/SPEC.md"}

# Areas the user owns once the project starts: new files there are not
# required to be in the manifest.
USER_OWNED_DIRS = ("src", "tests", "config", "infrastructure", "scripts")
# ...except the template's own scripts.
TEMPLATE_SCRIPTS = {"scripts/check_docs.py", "scripts/README.md", "scripts/groundwork.py"}
# Groundwork's own per-project records (`.groundwork/config.json`); written
# by the tools, never listed in the manifest.
TOOL_DIRS = (".groundwork",)

# {SCOPE}-{TYPE}-NNN, where TYPE is a requirement kind.
ID_STRICT = re.compile(r"\b[A-Z][A-Z0-9]{1,9}-(?:FR|NFR|BR)-\d{3}\b")
# Tokens that resemble requirement IDs and must match the grammar above.
ID_LOOKALIKE = re.compile(r"\b[A-Z]{2,10}-[A-Z]{2,10}-\d{1,4}\b")
# Product capability IDs: CAP-NNN.
CAP_STRICT = re.compile(r"\bCAP-\d{3}\b")
# Any CAP- followed by digits; tokens must match CAP_STRICT.
CAP_LOOKALIKE = re.compile(r"\bCAP-\d+\b")
# A line that starts a markdown table row.
TABLE_LINE = re.compile(r"^\s*\|")
FEATURE_INDEX_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
INLINE_CODE = re.compile(r"`[^`]*`")
ILLUSTRATIVE = ("for example", "such as", "e.g.")
# ADR status bullets ("- Status: ...").
STATUS_BULLET = re.compile(r"^\s*-\s*Status:\s*(.+?)\s*$")

# Document and specification status values (see docs/README.md).
DOC_STATUS = ("Draft", "In Review", "Approved", "Superseded")
# ADR status values (see docs/README.md).
ADR_STATUS = ("Proposed", "Accepted", "Rejected", "Superseded")


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def markdown_files() -> list[Path]:
    return sorted(p for p in ROOT.rglob("*.md") if ".git" not in p.parts)


def feature_specs() -> list[Path]:
    return sorted(p for p in SPECS_DIR.glob("*/SPEC.md") if p.parent.name != "_template")


def defining_files() -> set[Path]:
    files = {SPEC.resolve()}
    files.update(p.resolve() for p in feature_specs())
    return files


def is_profile_template(path: Path) -> bool:
    """True for files under `profiles/<id>/templates/`."""
    try:
        parts = path.resolve().relative_to(ROOT).parts
    except ValueError:
        return False
    return len(parts) > 3 and parts[0] == PROFILES_DIR.name and parts[2] == PROFILE_TEMPLATES


def checkable_markdown(path: Path) -> bool:
    """False for templates and the example, which are ignored."""
    return (
        "_template" not in path.parts
        and EXAMPLES_DIR not in path.parents
        and not is_profile_template(path)
    )


def protected_spans(line: str) -> list[tuple[int, int]]:
    """Spans of inline code whose IDs count as illustrative and are skipped."""
    lowered = line.lower()
    if not any(marker in lowered for marker in ILLUSTRATIVE):
        return []
    return [(m.start(), m.end()) for m in INLINE_CODE.finditer(line)]


def iter_tokens(line: str, pattern: re.Pattern[str]):
    protected = protected_spans(line)
    for match in pattern.finditer(line):
        if any(start <= match.start() and match.end() <= end for start, end in protected):
            continue
        yield match


def table_rows(text: str):
    """Cells of each markdown table row; non-table lines are skipped."""
    for line in text.splitlines():
        if not TABLE_LINE.match(line):
            continue
        yield [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_requirement_id(value: str) -> bool:
    return bool(ID_STRICT.fullmatch(value))


def is_capability_id(value: str) -> bool:
    return bool(CAP_STRICT.fullmatch(value))


def is_placeholder_row(cells: list[str]) -> bool:
    """A template row: every cell after the ID is empty or bracketed."""
    body = cells[1:]
    return all(cell == "" or cell.startswith("[") for cell in body)


def is_placeholder_status(value: str) -> bool:
    value = value.strip()
    return not value or value.startswith("[") or " / " in value


def is_user_owned(relative: Path) -> bool:
    """True for new files the user may add without updating the manifest."""
    if not relative.parts:
        return False
    if "/".join(relative.parts) in TEMPLATE_SCRIPTS:
        return False
    return relative.parts[0] in USER_OWNED_DIRS or relative.parts[0] in TOOL_DIRS


def check_manifest() -> list[str]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = manifest["files"]
    problems: list[str] = []

    if manifest["file_count"] != len(files):
        problems.append(
            f"scaffold-manifest.json: file_count is {manifest['file_count']}"
            f" but the list has {len(files)} entries"
        )

    if files != sorted(files):
        problems.append("scaffold-manifest.json: the file list is not sorted")

    actual = sorted(
        path.relative_to(ROOT)
        for path in ROOT.rglob("*")
        if path.is_file()
        and ".git" not in path.parts
        and "__pycache__" not in path.parts
    )
    actual_names = [str(relative) for relative in actual]

    # Template files must stay intact: listed files must exist, and new
    # files outside the user-owned areas must be listed too.
    for stale in sorted(set(files) - set(actual_names)):
        problems.append(
            f"{stale}: listed in the manifest but missing on disk"
            " — restore the file, or remove it from scaffold-manifest.json"
        )
    for missing in sorted(
        relative for relative in actual if not is_user_owned(relative)
    ):
        if str(missing) not in files:
            problems.append(
                f"{missing}: on disk but not in the manifest"
                " — add it to scaffold-manifest.json"
            )

    return problems


def check_feature_index() -> list[str]:
    text = SPEC.read_text(encoding="utf-8")
    indexed = {
        match.group(1)
        for match in FEATURE_INDEX_LINK.finditer(text)
        if match.group(1).startswith("specs/") and match.group(1).endswith("SPEC.md")
    }
    indexed -= PLACEHOLDER_TARGETS

    on_disk = {
        f"specs/{path.parent.name}/SPEC.md"
        for path in SPECS_DIR.glob("*/SPEC.md")
        if path.parent.name != "_template"
    }

    problems = [
        f"docs/product/{target}: linked in the feature index but missing on disk"
        for target in sorted(indexed - on_disk)
    ]
    problems += [
        f"docs/product/{target}: on disk but missing from the feature index in SPEC.md"
        for target in sorted(on_disk - indexed)
    ]
    return problems


def collect_definitions() -> tuple[dict[str, str], dict[str, str], dict[str, str], list[str]]:
    """Scan the defining files and the PRD.

    Returns (requirement owner, real requirement rows, capability owner,
    errors). An ID is defined only as the first cell of a table row; rows
    whose remaining cells are all placeholders still define their ID but are
    reported separately so they can be exempt from reference warnings.
    """
    row_owner: dict[str, str] = {}
    real_rows: dict[str, str] = {}
    capability_owner: dict[str, str] = {}
    problems: list[str] = []

    sources = [(PRD, False)] + [(path, True) for path in sorted(defining_files())]
    for path, is_requirement_table in sources:
        rel = str(path.relative_to(ROOT))
        text = read_text(path)
        seen: set[str] = set()
        for cells in table_rows(text):
            token = cells[0]
            if is_requirement_table and is_requirement_id(token):
                if token in row_owner and row_owner[token] != rel:
                    problems.append(
                        f"{row_owner[token]} and {rel} both define requirement ID {token}"
                    )
                elif token in seen:
                    problems.append(f"{rel}: requirement ID {token} is defined more than once")
                row_owner.setdefault(token, rel)
                seen.add(token)
                if not is_placeholder_row(cells):
                    real_rows.setdefault(token, rel)
            elif not is_requirement_table and is_capability_id(token):
                if token in capability_owner:
                    problems.append(f"{rel}: capability ID {token} is defined more than once")
                capability_owner.setdefault(token, rel)

        if is_requirement_table:
            prefix_match = re.search(r"\*\*Requirement ID prefix:\*\*\s*(\S+)", text)
            if prefix_match:
                prefix = prefix_match.group(1)
                if not re.fullmatch(r"[A-Z][A-Z0-9]{1,9}", prefix):
                    problems.append(
                        f"{rel}: requirement ID prefix '{prefix}' is not valid"
                        " — use capital letters and digits, starting with a letter"
                    )
                for token in set(row_owner):
                    if token.startswith(prefix + "-"):
                        continue
                    if row_owner[token] == rel:
                        problems.append(
                            f"{rel}: requirement ID {token} does not use the declared prefix {prefix}"
                        )

    return row_owner, real_rows, capability_owner, problems


def code_files() -> list[Path]:
    """Every file under `tests/` and `src/`, except `__pycache__`."""
    files: set[Path] = set()
    for base in (ROOT / "tests", ROOT / "src"):
        if base.is_dir():
            files.update(
                path
                for path in base.rglob("*")
                if path.is_file() and "__pycache__" not in path.parts
            )
    return sorted(files)


def reference_files() -> list[Path]:
    """Files whose IDs count as references: documents under `docs/`
    (excluding defining files, templates and the example) plus every file
    under `tests/` and `src/`."""
    files: set[Path] = set()
    for path in markdown_files():
        if not checkable_markdown(path):
            continue
        if path.resolve() in defining_files():
            continue
        if DOCS in path.parents:
            files.add(path)
    files.update(code_files())
    return sorted(files)


def check_references(row_owner: dict[str, str], capability_owner: dict[str, str]) -> list[str]:
    problems: list[str] = []

    for path in reference_files():
        rel = str(path.relative_to(ROOT))
        for line in read_text(path).splitlines():
            for match in iter_tokens(line, ID_STRICT):
                token = match.group(0)
                if token not in row_owner:
                    problems.append(
                        f"{rel}: requirement ID {token} is not defined in SPEC.md or a feature spec"
                    )
            for match in iter_tokens(line, CAP_STRICT):
                token = match.group(0)
                if token not in capability_owner:
                    problems.append(
                        f"{rel}: capability {token} is not defined in docs/product/PRD.md"
                    )

    # Requirement specs' own capability references (the Serves columns).
    for path in sorted(defining_files()):
        rel = str(path.relative_to(ROOT))
        for line in read_text(path).splitlines():
            for match in iter_tokens(line, CAP_STRICT):
                token = match.group(0)
                if token not in capability_owner:
                    problems.append(
                        f"{rel}: capability {token} is not defined in docs/product/PRD.md"
                    )
    return problems


def check_grammar() -> list[str]:
    problems: list[str] = []
    for path in markdown_files():
        if not checkable_markdown(path):
            continue
        rel = str(path.relative_to(ROOT))
        for line in read_text(path).splitlines():
            for match in iter_tokens(line, ID_LOOKALIKE):
                token = match.group(0)
                if not is_requirement_id(token):
                    problems.append(
                        f"{rel}: '{token}' looks like a requirement ID"
                        " but is not written as SCOPE-TYPE-NNN (for example AUTH-FR-001)"
                    )
            for match in iter_tokens(line, CAP_LOOKALIKE):
                token = match.group(0)
                if not is_capability_id(token):
                    problems.append(
                        f"{rel}: '{token}' looks like a capability ID"
                        " but is not written as CAP-NNN (three digits)"
                    )
    # Code files: capability spelling only, and nothing is skipped — the
    # illustrative-line rule is a markdown rule. Requirement ID spelling
    # stays markdown-only because code often holds tokens that only look
    # like requirement IDs.
    for path in code_files():
        rel = str(path.relative_to(ROOT))
        for line in read_text(path).splitlines():
            for match in CAP_LOOKALIKE.finditer(line):
                token = match.group(0)
                if not is_capability_id(token):
                    problems.append(
                        f"{rel}: '{token}' looks like a capability ID"
                        " but is not written as CAP-NNN (three digits)"
                    )
    return problems


def check_unreferenced(row_owner: dict[str, str], real_rows: dict[str, str]) -> list[str]:
    """Coverage warnings: defined requirements nothing else mentions."""
    warnings: list[str] = []

    referenced: dict[str, set[str]] = {}
    sources = set(reference_files()) | defining_files()
    for path in sorted(sources):
        if not checkable_markdown(path):
            continue
        rel = str(path.relative_to(ROOT))
        for line in read_text(path).splitlines():
            for match in iter_tokens(line, ID_STRICT):
                referenced.setdefault(match.group(0), set()).add(rel)

    for token, owner in sorted(real_rows.items()):
        files = referenced.get(token, {owner})
        if all(rel == owner for rel in files):
            warnings.append(
                f"{owner}: requirement {token} is defined but never referenced"
                " by any document, plan or test"
            )
    return warnings


def check_unserved(capability_owner: dict[str, str]) -> list[str]:
    """Hygiene warnings: PRD capabilities no requirement serves."""
    warnings: list[str] = []

    served: set[str] = set()
    for path in sorted(defining_files()):
        for line in read_text(path).splitlines():
            served.update(match.group(0) for match in iter_tokens(line, CAP_STRICT))

    for token in sorted(capability_owner):
        if token not in served:
            warnings.append(
                f"docs/product/PRD.md: capability {token} is not served by"
                " any requirement in SPEC.md or a feature spec"
            )
    return warnings


def check_adr_status() -> list[str]:
    """Hygiene warnings: ADR status values outside the vocabulary."""
    warnings: list[str] = []
    allowed = ", ".join(ADR_STATUS)
    for path in sorted(ADR_DIR.glob("*.md")):
        if path.name == ADR_TEMPLATE:
            continue
        rel = str(path.relative_to(ROOT))
        for line in read_text(path).splitlines():
            match = STATUS_BULLET.match(line)
            if match and not is_placeholder_status(match.group(1)):
                if match.group(1) not in ADR_STATUS:
                    warnings.append(f"{rel}: ADR status '{match.group(1)}' is not one of {allowed}")
    return warnings


def check_status() -> list[str]:
    warnings: list[str] = []

    def warn(path: Path, value: str, allowed: tuple[str, ...]) -> str:
        return f"{path.relative_to(ROOT)}: status '{value}' is not one of {', '.join(allowed)}"

    for line in read_text(SYSTEM_DESIGN).splitlines():
        match = STATUS_BULLET.match(line)
        if match and not is_placeholder_status(match.group(1)):
            if match.group(1) not in DOC_STATUS:
                warnings.append(warn(SYSTEM_DESIGN, match.group(1), DOC_STATUS))

    for path in feature_specs():
        for line in read_text(path).splitlines():
            match = re.match(r"^\*\*Status:\*\*\s*(.+?)\s*$", line)
            if match and not is_placeholder_status(match.group(1)):
                if match.group(1) not in DOC_STATUS:
                    warnings.append(warn(path, match.group(1), DOC_STATUS))

    for cells in table_rows(read_text(SPEC)):
        if len(cells) != 3 or "specs/" not in cells[1] or "feature-name" in cells[1]:
            continue
        if is_placeholder_status(cells[2]):
            continue
        if cells[2] not in DOC_STATUS:
            warnings.append(warn(SPEC, cells[2], DOC_STATUS))
    return warnings


def check_links() -> list[str]:
    problems: list[str] = []
    link = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
    for path in markdown_files():
        if not checkable_markdown(path):
            continue
        rel = str(path.relative_to(ROOT))
        for match in link.finditer(read_text(path)):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if target in PLACEHOLDER_TARGETS or "[" in target:
                continue
            clean = target.split("#", 1)[0]
            if not clean:
                continue
            if not (path.parent / clean).resolve().exists():
                problems.append(f"{rel}: broken link to {target}")
    return problems


# --- Profiles -------------------------------------------------------------
# A profile is `profiles/<id>/profile.json` plus, for every document it
# owns, a template at `profiles/<id>/templates/<document path>`. Core is
# the always-active profile `profiles/core/`; it also owns the documents
# shipped in place. See `profiles/README.md` for the schema and the rules.


def template_paths(directory: Path) -> set[str]:
    """Document paths a profile has templates for (and therefore owns)."""
    base = directory / PROFILE_TEMPLATES
    if not base.is_dir():
        return set()
    return {
        path.relative_to(base).as_posix()
        for path in base.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }


def has_manifest(profile_id: str) -> bool:
    """True when a profile folder has a manifest, valid or not."""
    return PROFILE_ID.fullmatch(profile_id) is not None and (
        PROFILES_DIR / profile_id / PROFILE_FILE
    ).is_file()


def template_for(profile_id: str, document: str) -> Path:
    return PROFILES_DIR / profile_id / PROFILE_TEMPLATES / document


def is_text_list(value: object, allow_empty: bool = True) -> bool:
    return (
        isinstance(value, list)
        and (allow_empty or bool(value))
        and all(isinstance(item, str) and item.strip() for item in value)
    )


def validate_profile(directory: Path, data: object) -> list[str]:
    """Schema problems in one manifest, without the leading file name."""
    if not isinstance(data, dict):
        return ["must be a JSON object"]
    is_core = directory.name == CORE
    allowed = CORE_FIELDS if is_core else PROFILE_FIELDS
    missing = [f"missing field '{key}'" for key in sorted(allowed - data.keys())]
    problems = [f"unknown field '{key}'" for key in sorted(data.keys() - allowed)]
    if missing:
        return missing + problems

    if data["schema"] != PROFILE_SCHEMA:
        problems.append(f"schema is {data['schema']!r}, but this checker understands {PROFILE_SCHEMA}")
    if not isinstance(data["id"], str) or not PROFILE_ID.fullmatch(data["id"]):
        problems.append("id must be lowercase letters, digits and hyphens, starting with a letter")
    elif data["id"] != directory.name:
        problems.append(f"id '{data['id']}' does not match its folder name '{directory.name}'")
    for key in ("name", "purpose"):
        if not isinstance(data[key], str) or not data[key].strip():
            problems.append(f"'{key}' must be a non-empty string")

    if not is_core:
        if not is_text_list(data["use_when"], allow_empty=False):
            problems.append("'use_when' must be a non-empty list of strings")
        if not is_text_list(data["not_when"]):
            problems.append("'not_when' must be a list of strings")
        if not is_text_list(data["incompatible_with"]):
            problems.append("'incompatible_with' must be a list of profile IDs")
        requires = data["requires"]
        if not isinstance(requires, list) or not all(
            (isinstance(entry, str) and entry) or is_text_list(entry, allow_empty=False)
            for entry in requires
        ):
            problems.append(
                "'requires' must be a list whose entries are a profile ID"
                " or a list of profile IDs (any one of them will do)"
            )
        checks = data["checks"]
        if not isinstance(checks, list) or not all(
            isinstance(check, dict)
            and check.keys() == {"name", "what"}
            and all(isinstance(check[key], str) and check[key].strip() for key in check)
            for check in checks
        ):
            problems.append("'checks' must be a list of objects with exactly 'name' and 'what'")

    documents = data["documents"]
    if not isinstance(documents, list):
        return problems + ["'documents' must be a list"]
    listed: set[str] = set()
    for index, doc in enumerate(documents):
        where = f"documents[{index}]"
        if not isinstance(doc, dict) or not {"path", "required"} <= doc.keys() <= {"path", "required", "when"}:
            problems.append(f"{where} must have 'path' and 'required', and optionally 'when'")
            continue
        path, required = doc["path"], doc["required"]
        if (
            not isinstance(path, str)
            or not path
            or path.startswith("/")
            or "\\" in path
            or ".." in path.split("/")
            or path.split("/")[0] == PROFILES_DIR.name
        ):
            problems.append(f"{where}: path must be a relative path outside profiles/, written with '/'")
            continue
        if not isinstance(required, bool):
            problems.append(f"{path}: 'required' must be true or false")
        elif not required and not (isinstance(doc.get("when"), str) and doc["when"].strip()):
            problems.append(f"{path}: an optional document needs a 'when' saying when to create it")
        elif required and "when" in doc:
            problems.append(f"{path}: a required document has no 'when' — remove it, or make the document optional")
        if path in listed:
            problems.append(f"{path}: listed more than once")
        listed.add(path)

    for orphan in sorted(template_paths(directory) - listed):
        problems.append(
            f"template {PROFILE_TEMPLATES}/{orphan} is not listed in 'documents'"
            " — list it, or delete the template"
        )
    if not is_core and not (directory / "README.md").is_file():
        problems.append("profile has no README.md with its standards and agent instructions")
    return problems


def load_profiles() -> tuple[dict[str, dict], list[str]]:
    """Valid manifests by ID, and the problems found. Empty without `profiles/`."""
    profiles: dict[str, dict] = {}
    problems: list[str] = []
    if not PROFILES_DIR.is_dir():
        return profiles, problems
    for directory in sorted(path for path in PROFILES_DIR.iterdir() if path.is_dir()):
        if directory.name == "__pycache__":
            continue
        manifest = directory / PROFILE_FILE
        rel = manifest.relative_to(ROOT).as_posix()
        if not manifest.is_file():
            problems.append(f"{rel}: missing — every folder in profiles/ needs a {PROFILE_FILE}")
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            problems.append(f"{rel}: not valid JSON ({error})")
            continue
        found = validate_profile(directory, data)
        problems += [f"{rel}: {problem}" for problem in found]
        if not found:
            profiles[data["id"]] = data
    if CORE not in profiles and not any(f"profiles/{CORE}/" in p for p in problems):
        problems.append(f"profiles/{CORE}/{PROFILE_FILE}: missing — core is required once profiles/ exists")
    return profiles, problems


def document_owners(profiles: dict[str, dict]) -> tuple[dict[str, str], list[str]]:
    """Map each document path to its one owner, and report ownership problems.

    Core owns every document it lists. Any other profile owns exactly the
    documents it has templates for. A profile may list its own documents
    and core documents, never another profile's.
    """
    owners: dict[str, str] = {}
    problems: list[str] = []
    order = ([CORE] if CORE in profiles else []) + sorted(p for p in profiles if p != CORE)

    for profile_id in order:
        owned = template_paths(PROFILES_DIR / profile_id)
        if profile_id == CORE:
            owned |= {doc["path"] for doc in profiles[CORE]["documents"]}
        for path in sorted(owned):
            if path in owners:
                problems.append(
                    f"{path}: owned by both the {owners[path]} and {profile_id} profiles"
                    " — a document has one owner; if several profiles need it, move it into core"
                )
                continue
            owners[path] = profile_id

    # Without a valid core, every core reference would look ownerless; the
    # missing or broken core manifest is already reported.
    check_references_to = order if CORE in profiles else []
    for profile_id in check_references_to:
        for doc in profiles[profile_id]["documents"]:
            path = doc["path"]
            owner = owners.get(path)
            rel = f"profiles/{profile_id}/{PROFILE_FILE}"
            if owner is None:
                problems.append(
                    f"{rel}: {path} has no template — add"
                    f" profiles/{profile_id}/{PROFILE_TEMPLATES}/{path}"
                )
            elif owner not in (profile_id, CORE):
                problems.append(
                    f"{rel}: lists {path}, which the {owner} profile owns"
                    " — a profile may list only its own documents and core documents;"
                    " if several profiles need it, move it into core"
                )

    for profile_id in order:
        data = profiles[profile_id]
        if profile_id == CORE:
            continue
        rel = f"profiles/{profile_id}/{PROFILE_FILE}"
        named = [
            other
            for entry in data["requires"]
            for other in ([entry] if isinstance(entry, str) else entry)
        ] + list(data["incompatible_with"])
        for other in named:
            if other == profile_id:
                problems.append(f"{rel}: a profile cannot require or exclude itself")
            elif other == CORE:
                problems.append(f"{rel}: core is always active — don't name it in 'requires' or 'incompatible_with'")
            elif other not in profiles and not has_manifest(other):
                problems.append(f"{rel}: names unknown profile '{other}'")
    return owners, problems


def parse_profiles(value: str) -> list[str] | None:
    """The IDs on a `- Profiles:` line; None while it is still a placeholder."""
    value = value.strip()
    if not value or value.startswith("["):
        return None
    if value.lower() == "none":
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def declared_profiles() -> list[str] | None:
    """Profiles chosen in PROJECT.md; None when not chosen yet."""
    for line in read_text(PROJECT).splitlines():
        match = PROFILES_BULLET.match(line)
        if match:
            return parse_profiles(match.group(1))
    return None


def check_selection(selected: list[str], profiles: dict[str, dict]) -> list[str]:
    """Unknown IDs, missing dependencies and incompatible pairs."""
    problems: list[str] = []
    known = ", ".join(sorted(p for p in profiles if p != CORE)) or "none"
    seen: set[str] = set()
    for profile_id in selected:
        if profile_id in seen:
            problems.append(f"PROJECT.md: profile '{profile_id}' is listed twice")
        seen.add(profile_id)
        if profile_id == CORE:
            problems.append("PROJECT.md: core is always active — don't list it under Profiles")
        elif profile_id not in profiles and has_manifest(profile_id):
            problems.append(f"PROJECT.md: profile '{profile_id}' has manifest errors — fix them first")
        elif profile_id not in profiles:
            problems.append(f"PROJECT.md: unknown profile '{profile_id}' — known profiles: {known}")

    active = [p for p in dict.fromkeys(selected) if p in profiles and p != CORE]
    for profile_id in active:
        for entry in profiles[profile_id]["requires"]:
            options = [entry] if isinstance(entry, str) else list(entry)
            if not any(option in active for option in options):
                wanted = options[0] if len(options) == 1 else "one of " + ", ".join(options)
                problems.append(
                    f"PROJECT.md: the {profile_id} profile requires {wanted}, which is not active"
                )
    reported: set[tuple[str, str]] = set()
    for profile_id in active:
        for other in profiles[profile_id]["incompatible_with"]:
            pair = tuple(sorted((profile_id, other)))
            if other in active and pair not in reported:
                reported.add(pair)
                problems.append(
                    f"PROJECT.md: the {pair[0]} and {pair[1]} profiles are declared incompatible"
                    " — choose one, or record in an ADR why the system needs both and change the manifests"
                )
    return problems


def active_profiles(selected: list[str] | None, profiles: dict[str, dict]) -> list[str]:
    """Core plus the valid selected profiles, in a stable order."""
    chosen = [p for p in dict.fromkeys(selected or []) if p in profiles and p != CORE]
    return ([CORE] if CORE in profiles else []) + chosen


def required_documents(active: list[str], profiles: dict[str, dict]) -> dict[str, list[str]]:
    """Each required document, with the active profiles that require it."""
    required: dict[str, list[str]] = {}
    for profile_id in active:
        for doc in profiles[profile_id]["documents"]:
            if doc["required"]:
                required.setdefault(doc["path"], []).append(profile_id)
    return required


def check_required_documents(
    active: list[str], profiles: dict[str, dict], owners: dict[str, str]
) -> list[str]:
    problems: list[str] = []
    for path, needed_by in sorted(required_documents(active, profiles).items()):
        if (ROOT / path).exists():
            continue
        owner = owners.get(path, CORE)
        if template_for(owner, path).is_file():
            fix = (
                "run python3 scripts/groundwork.py init with your profiles,"
                f" or copy profiles/{owner}/{PROFILE_TEMPLATES}/{path}"
            )
        else:
            fix = "restore it from the Groundwork release"
        problems.append(f"{path}: required by {', '.join(needed_by)} but missing — {fix}")
    return problems


def check_inactive_documents(
    selected: list[str] | None, active: list[str], owners: dict[str, str]
) -> list[str]:
    """Hygiene warnings: documents that belong to a profile not in use."""
    if selected is None:
        return []
    return [
        f"{path}: belongs to the {owner} profile, which PROJECT.md does not list"
        " — add the profile, or delete the document"
        for path, owner in sorted(owners.items())
        if owner not in active and (ROOT / path).exists()
    ]


def tooling_concerns() -> list[str]:
    """First cells of the tooling table in AGENTS.md, lowercased."""
    concerns: list[str] = []
    inside = False
    for line in read_text(AGENTS).splitlines():
        if line.lstrip().startswith("#"):
            inside = "tooling" in line.lower()
            continue
        if inside and TABLE_LINE.match(line):
            first = line.strip().strip("|").split("|")[0].strip()
            if first and set(first) - set("-: "):
                concerns.append(first.lower())
    return concerns


def missing_checks(active: list[str], profiles: dict[str, dict]) -> list[tuple[str, dict]]:
    """(profile, check) pairs with no tooling-table row; one per check name."""
    concerns = tooling_concerns()
    missing: list[tuple[str, dict]] = []
    seen: set[str] = set()
    for profile_id in active:
        for check in profiles[profile_id].get("checks", []):
            name = check["name"].lower()
            if name in seen or any(concern.startswith(name) for concern in concerns):
                continue
            seen.add(name)
            missing.append((profile_id, check))
    return missing


def check_profile_tooling(active: list[str], profiles: dict[str, dict]) -> list[str]:
    """Hygiene warnings: profile checks with no row in the tooling table."""
    return [
        f"AGENTS.md: the {profile_id} profile needs the '{check['name']}' check"
        " — add a row to the tooling table naming the tool, or say why it doesn't apply"
        for profile_id, check in missing_checks(active, profiles)
    ]


def profile_results() -> tuple[list[str], list[str], str]:
    """Profile errors, profile hygiene warnings, and a one-line summary."""
    if not PROFILES_DIR.is_dir():
        return [], [], ""
    profiles, errors = load_profiles()
    owners, ownership_problems = document_owners(profiles)
    selected = declared_profiles()
    errors += ownership_problems + check_selection(selected or [], profiles)
    active = active_profiles(selected, profiles)
    errors += check_required_documents(active, profiles, owners)
    warnings = check_inactive_documents(selected, active, owners) + check_profile_tooling(active, profiles)
    if selected is None:
        summary = "profiles: not chosen yet"
    else:
        summary = "profiles: " + (", ".join(selected) or "none (core only)")
    return errors, warnings, summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Groundwork documentation consistency.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat hygiene warnings (status values, unserved capabilities, profile hygiene) as errors",
    )
    parser.add_argument(
        "--strict-coverage",
        action="store_true",
        help="treat coverage warnings (requirements nothing references) as errors",
    )
    args = parser.parse_args()

    row_owner, real_rows, capability_owner, definition_problems = collect_definitions()
    profile_errors, profile_warnings, profile_summary = profile_results()
    errors = (
        check_manifest()
        + check_feature_index()
        + definition_problems
        + check_references(row_owner, capability_owner)
        + check_grammar()
        + check_links()
        + profile_errors
    )
    hygiene_warnings = (
        check_unserved(capability_owner) + check_status() + check_adr_status() + profile_warnings
    )
    coverage_warnings = check_unreferenced(row_owner, real_rows)
    warnings = hygiene_warnings + coverage_warnings

    for problem in errors:
        print(f"FAIL: {problem}")
    for warning in hygiene_warnings:
        print(f"WARN: {warning}")
    for warning in coverage_warnings:
        print(f"WARN (coverage): {warning}")

    if errors or (args.strict and hygiene_warnings) or (args.strict_coverage and coverage_warnings):
        return 1
    checked = "manifest, feature index, requirement IDs and links are consistent"
    if profile_summary:
        checked = f"manifest, feature index, requirement IDs, links and profiles are consistent ({profile_summary})"
    if warnings:
        print(f"OK (warnings above): {checked}")
        return 0
    print(f"OK: {checked}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
