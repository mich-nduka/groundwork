#!/usr/bin/env python3
"""Set up and grow a Groundwork project's documents from its profiles.

Commands:
  list                show every profile: purpose, when to use it, its
                      documents and its checks.
  init PROFILE...     choose the active profiles (or `init none` for core
                      only). Records them in PROJECT.md, creates every
                      required document that is missing from its template,
                      adds the profiles' checks to the tooling table in
                      AGENTS.md, and lists new files in
                      scaffold-manifest.json. Run it again with a new list
                      to add a profile later.
  add PATH            create one optional document from its template, for
                      example `add docs/ai-systems/RETRIEVAL.md`.
  new DEST            create a new project in DEST from this copy of
                      Groundwork: copies the files in scaffold-manifest.json,
                      fills in the project name, description and date, writes
                      .groundwork/config.json, then runs `init` there. Use
                      --profiles to choose profiles (default: none).
  config              show this project's Groundwork configuration: name,
                      profiles, version, and which recorded files changed.
  status              where documentation onboarding stands: discovery, each
                      document's progress, what needs confirming, and the
                      next thing to ask. --brief prints a few lines for an
                      agent's session-start hook.
  docs [PATH]         every document in use with its status; with PATH, its
                      purpose, sections and questions.
  mark TARGET... STATE
                      record progress in .groundwork/state.json. TARGET is a
                      question ID, a document PATH, a section PATH#ID, or
                      `discovery`. Add --note for the reason (required for
                      assumed and blocked). `mark --repair` rebuilds a
                      damaged state file, keeping every valid entry.
  connect [AGENT...]  add thin instruction files for agents that don't read
                      AGENTS.md by themselves (claude, gemini). Without an
                      agent, shows which are connected.

Choosing profiles is a judgement call; see profiles/README.md. This script
only does the mechanical part. It never overwrites or deletes a file:
documents that already exist are kept as they are, and documents of a
profile you drop stay until you delete them (check_docs.py warns about
them). `new` builds the project in a temporary folder next to DEST and
moves it into place only when every step succeeded.

Add --dry-run to see what would change without writing anything, and
--json for machine-readable output (one JSON object; exit 1 on errors).
The `groundwork` command-line tool uses that output.

Profile order never matters: profiles are always recorded and applied in
sorted order.

Python 3.9+ standard library only. The rules come from check_docs.py, so
the two scripts always agree.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_docs as docs  # noqa: E402  (needs the path set above)
import onboarding as ob  # noqa: E402

ROOT = docs.ROOT
CORE = docs.CORE
CONFIG_DIR = ".groundwork"
CONFIG_FILE = f"{CONFIG_DIR}/config.json"
CONFIG_SCHEMA = 1
NAME_BULLET = re.compile(r"^\s*-\s*Name:\s*(.*?)\s*$")


class Failure(Exception):
    """A problem that stops a command; the message is shown to the user."""


# --- Output -----------------------------------------------------------------


def wrap(text: str, indent: str) -> str:
    return textwrap.fill(text, width=88, initial_indent=indent, subsequent_indent=indent + "  ")


def emit_json(data: dict) -> int:
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0 if data.get("ok") else 1


def fail(errors: list[str], as_json: bool, hint: str = "") -> int:
    if as_json:
        return emit_json({"ok": False, "errors": errors})
    for error in errors:
        print(f"FAIL: {error}")
    if hint:
        print(hint)
    return 1


# --- Loading ----------------------------------------------------------------


def load() -> tuple[dict[str, dict], dict[str, str], list[str]]:
    """Valid profiles, document owners, and any problems with them."""
    if not docs.PROFILES_DIR.is_dir():
        return {}, {}, ["profiles/: missing — this project has no Groundwork profiles to work from"]
    profiles, problems = docs.load_profiles()
    owners, ownership_problems = docs.document_owners(profiles)
    return profiles, owners, problems + ownership_problems


def normalise(requested: list[str]) -> list[str]:
    """`none` means no profiles; otherwise the IDs as given."""
    return [] if [p.lower() for p in requested] == ["none"] else list(requested)


def template_version(root: Path = ROOT) -> str:
    try:
        return str(json.loads((root / "scaffold-manifest.json").read_text(encoding="utf-8"))["version"])
    except (OSError, ValueError, KeyError):
        return "unknown"


# --- Managed-file records (.groundwork/config.json) -------------------------
# The config records which files Groundwork generated and their SHA-256 at
# that moment. A recorded file whose content still matches is
# framework-managed; one that differs was changed by the project; a file
# that isn't recorded belongs to the project. A future `update` can use this
# to avoid overwriting anyone's edits. Active profiles live in PROJECT.md,
# not here, so there is one source of truth for them.


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_config(root: Path = ROOT) -> dict | None:
    path = root / CONFIG_FILE
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise Failure(f"{CONFIG_FILE}: not valid JSON ({error})") from error
    if not isinstance(data, dict) or data.get("schema") != CONFIG_SCHEMA or not isinstance(data.get("files"), dict):
        raise Failure(f"{CONFIG_FILE}: not a schema {CONFIG_SCHEMA} Groundwork config")
    return data


def write_config(config: dict, root: Path = ROOT) -> None:
    path = root / CONFIG_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    config["files"] = dict(sorted(config["files"].items()))
    path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def file_status(path: str, config: dict | None, root: Path = ROOT) -> str:
    """managed (unchanged since generated), modified, user (not recorded) or missing."""
    target = root / path
    if not target.exists():
        return "missing"
    recorded = (config or {}).get("files", {}).get(path)
    if recorded is None:
        return "user"
    return "managed" if digest(target) == recorded else "modified"


def pristine(paths: list[str], config: dict | None) -> set[str]:
    """Paths still exactly as Groundwork generated them."""
    return {path for path in paths if file_status(path, config) == "managed"}


def record(config: dict | None, created: list[str], edited: list[str], was_pristine: set[str]) -> None:
    """Record new files, and refresh edited files nobody else had changed."""
    if config is None:
        return
    for path in created + [p for p in edited if p in was_pristine]:
        if (ROOT / path).is_file():
            config["files"][path] = digest(ROOT / path)
    write_config(config)


# --- Onboarding records -----------------------------------------------------
# The config also keeps a fingerprint of each section as Groundwork generated
# it, so `status` can tell template text from the project's own writing.
# .groundwork/state.json holds progress only; the documents hold the content.


def update_state(profiles: dict[str, dict], owners: dict[str, str], before: dict[str, str] | None = None) -> None:
    """Fingerprint documents Groundwork just wrote, and start the state file.

    Does nothing in projects without .groundwork/config.json (made before
    Groundwork 3.1; `mark` starts their state when first used), and leaves
    a broken state file for `mark --repair`."""
    registry, problems = ob.load_definitions(profiles, owners)
    if problems:
        return
    try:
        config = read_config()
    except Failure:
        return
    if config is None:
        return
    for path, text in (before or {}).items():
        ob.refresh_baselines(config, registry, path, text, docs.read_text(ROOT / path))
    ob.add_baselines(config, registry, sorted(registry["documents"]))
    write_config(config)
    state, state_problems = ob.read_state()
    if state is None and not state_problems:
        ob.write_state(ob.empty_state())


# --- Small file edits shared by init and add --------------------------------


def update_manifest(new_files: list[str], dry_run: bool) -> list[str]:
    """List new template-area files in scaffold-manifest.json; returns them."""
    manifest = json.loads(docs.MANIFEST.read_text(encoding="utf-8"))
    files = manifest["files"]
    added = [path for path in new_files if path not in files and not docs.is_user_owned(Path(path))]
    if added and not dry_run:
        manifest["files"] = sorted(files + added)
        manifest["file_count"] = len(manifest["files"])
        docs.MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return added


def project_lines(selected: list[str]) -> list[str]:
    """PROJECT.md with the `- Profiles:` line set, adding a section if needed."""
    value = ", ".join(selected) or "none"
    lines = docs.read_text(docs.PROJECT).splitlines()
    for index, line in enumerate(lines):
        if docs.PROFILES_BULLET.match(line):
            lines[index] = f"- Profiles: {value}"
            return lines
    section = ["## Profiles", f"- Profiles: {value}", "- Why:", ""]
    at = next((i for i, line in enumerate(lines) if line.strip() == "## Links"), len(lines))
    if at == len(lines) and lines and lines[-1].strip():
        section.insert(0, "")
    lines[at:at] = section
    return lines


def tooling_lines(missing: list[tuple[str, dict]]) -> tuple[list[str], list[str]] | None:
    """(AGENTS.md lines with rows appended, the rows), or None without a tooling table."""
    lines = docs.read_text(docs.AGENTS).splitlines()
    inside, last_row, columns = False, None, 3
    for index, line in enumerate(lines):
        if line.lstrip().startswith("#"):
            if inside and last_row is not None:
                break
            inside = "tooling" in line.lower()
            continue
        if inside and docs.TABLE_LINE.match(line):
            if last_row is None:
                columns = len(line.strip().strip("|").split("|"))
            last_row = index
    if last_row is None:
        return None
    rows = [f"| {check['name']} ({profile_id} profile) |" + " |" * (columns - 1) for profile_id, check in missing]
    lines[last_row + 1 : last_row + 1] = rows
    return lines, rows


def write_lines(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# --- list -------------------------------------------------------------------


def cmd_list(profiles: dict[str, dict], as_json: bool) -> int:
    order = [CORE] + sorted(p for p in profiles if p != CORE)
    if as_json:
        return emit_json(
            {
                "ok": True,
                "groundworkVersion": template_version(),
                "profiles": [
                    dict(profiles[p], readme="profiles/README.md" if p == CORE else f"profiles/{p}/README.md")
                    for p in order
                ],
            }
        )
    for profile_id in order:
        data = profiles[profile_id]
        title = f"{profile_id} — {data['name']}"
        if profile_id == CORE:
            title += " (always active)"
        print(title)
        print(wrap(data["purpose"], "  "))
        if profile_id != CORE:
            for heading, key in (("Use when", "use_when"), ("Not when", "not_when")):
                print(f"  {heading}:")
                for item in data[key]:
                    print(wrap(f"- {item}", "    "))
            requires = [
                entry if isinstance(entry, str) else "one of " + ", ".join(entry) for entry in data["requires"]
            ]
            if requires:
                print(f"  Requires: {'; '.join(requires)}")
            if data["incompatible_with"]:
                print(f"  Incompatible with: {', '.join(data['incompatible_with'])}")
        required = [doc["path"] for doc in data["documents"] if doc["required"]]
        optional = [doc for doc in data["documents"] if not doc["required"]]
        if required:
            print("  Required documents:")
            for path in required:
                print(f"    - {path}")
        if optional:
            print("  Optional documents (create when the condition holds):")
            for doc in optional:
                print(wrap(f"- {doc['path']}: {doc['when']}", "    "))
        if data.get("checks"):
            print("  Checks:")
            for check in data["checks"]:
                print(wrap(f"- {check['name']}: {check['what']}", "    "))
        print()
    print("Choose by what the system does, not by its technology: see profiles/README.md.")
    return 0


# --- init -------------------------------------------------------------------


def plan_init(requested: list[str], profiles: dict[str, dict], owners: dict[str, str]) -> dict:
    """Everything `init` would do, decided before anything is written."""
    errors = docs.check_selection(requested, profiles)
    if errors:
        return {"ok": False, "errors": errors}
    selected = sorted(dict.fromkeys(requested))
    config = read_config()
    active = docs.active_profiles(selected, profiles)
    required = docs.required_documents(active, profiles)

    documents = []
    for path in sorted(required):
        owner = owners.get(path, CORE)
        template = docs.template_for(owner, path)
        exists = (ROOT / path).exists()
        if not exists and not template.is_file():
            errors.append(
                f"{path}: required by core but missing, and it has no template"
                " — restore it from the Groundwork release"
            )
        documents.append(
            {
                "path": path,
                "owner": owner,
                "template": template.relative_to(ROOT).as_posix() if template.is_file() else None,
                "requiredBy": required[path],
                "exists": exists,
                "status": file_status(path, config),
                "action": "keep" if exists else "create",
            }
        )

    missing = docs.missing_checks(active, profiles)
    missing_names = {check["name"].lower() for _, check in missing}
    checks, seen = [], set()
    for profile_id in active:
        for check in profiles[profile_id].get("checks", []):
            if check["name"].lower() in seen:
                continue
            seen.add(check["name"].lower())
            action = "add-row" if check["name"].lower() in missing_names else "present"
            checks.append({"profile": profile_id, "name": check["name"], "what": check["what"], "action": action})
    table = tooling_lines(missing)

    optional, shown = [], set(required)
    for profile_id in active:
        if profile_id == CORE:
            continue
        for doc in profiles[profile_id]["documents"]:
            if not doc["required"] and doc["path"] not in shown and not (ROOT / doc["path"]).exists():
                shown.add(doc["path"])
                optional.append({"path": doc["path"], "owner": owners.get(doc["path"], CORE), "when": doc["when"]})

    created = [d["path"] for d in documents if d["action"] == "create"]
    return {
        "ok": not errors,
        "errors": errors,
        "profiles": selected,
        "previous": docs.declared_profiles(),
        "documents": documents,
        "checks": checks,
        "toolingTable": table is not None,
        "toolingRows": table[1] if table else [],
        "optional": optional,
        "inactive": [w.split(":", 1)[0] for w in docs.check_inactive_documents(selected, active, owners)],
        "manifestAdditions": [p for p in created if not docs.is_user_owned(Path(p))],
    }


def apply_init(plan: dict, profiles: dict[str, dict], owners: dict[str, str]) -> None:
    config = read_config()
    edited = ["PROJECT.md", "AGENTS.md", "scaffold-manifest.json"]
    was_pristine = pristine(edited, config)
    before = {path: docs.read_text(ROOT / path) for path in ("PROJECT.md", "AGENTS.md")}
    created = [d["path"] for d in plan["documents"] if d["action"] == "create"]
    for path in created:
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(docs.template_for(owners.get(path, CORE), path), target)
    write_lines(docs.PROJECT, project_lines(plan["profiles"]))
    to_add = [(c["profile"], c) for c in plan["checks"] if c["action"] == "add-row"]
    table = tooling_lines(to_add) if to_add else None
    if table:
        write_lines(docs.AGENTS, table[0])
    update_manifest(created, dry_run=False)
    record(config, created, edited, was_pristine)
    update_state(profiles, owners, before)


def report_init(plan: dict, dry_run: bool) -> None:
    def say(done: str, would: str) -> str:
        return would if dry_run else done

    previous = plan["previous"]
    before = "not chosen yet" if previous is None else (", ".join(previous) or "none")
    created = [d["path"] for d in plan["documents"] if d["action"] == "create"]
    kept = [d for d in plan["documents"] if d["action"] == "keep"]
    print("Dry run — nothing written." if dry_run else "Done.")
    print(f"Profiles: {', '.join(plan['profiles']) or 'none (core only)'}  (before: {before})")
    if created:
        print(say("Created from templates:", "Would create from templates:"))
        for path in created:
            print(f"  + {path}")
    if kept:
        print(f"Already present, kept as they are: {len(kept)} document(s)")
    added_checks = [c for c in plan["checks"] if c["action"] == "add-row"]
    if added_checks and not plan["toolingTable"]:
        print("No tooling table found in AGENTS.md. Add a row for each of these checks:")
        for check in added_checks:
            print(wrap(f"- {check['name']} ({check['profile']}): {check['what']}", "  "))
    elif plan["toolingRows"]:
        print(say("Added", "Would add") + " rows to the tooling table in AGENTS.md (fill in the tool):")
        for row in plan["toolingRows"]:
            print(f"  {row}")
    if plan["manifestAdditions"]:
        print(say("Listed", "Would list") + f" {len(plan['manifestAdditions'])} new file(s) in scaffold-manifest.json")
    if plan["optional"]:
        print("Optional documents — add one when its condition holds (python3 scripts/groundwork.py add PATH):")
        for doc in plan["optional"]:
            print(wrap(f"- {doc['path']}: {doc['when']}", "  "))
    if plan["inactive"]:
        print("Documents from profiles that are no longer active (kept; delete them if unused):")
        for path in plan["inactive"]:
            print(f"  - {path}")
    print("Next: write why these profiles fit under '- Why:' in PROJECT.md, read each")
    print("profile's README in profiles/, then run python3 scripts/check_docs.py.")


def cmd_init(requested: list[str], profiles, owners, dry_run: bool, as_json: bool) -> int:
    plan = plan_init(normalise(requested), profiles, owners)
    if not plan["ok"]:
        return fail(plan["errors"], as_json, "Run `python3 scripts/groundwork.py list` to see the profiles.")
    if not dry_run:
        apply_init(plan, profiles, owners)
    if as_json:
        return emit_json(dict(plan, dryRun=dry_run))
    report_init(plan, dry_run)
    return 0


# --- add --------------------------------------------------------------------


def cmd_add(path: str, profiles, owners, dry_run: bool, as_json: bool) -> int:
    path = Path(path).as_posix()
    while path.startswith("./"):
        path = path[2:]
    active = docs.active_profiles(docs.declared_profiles(), profiles)
    listed_by = [p for p in active if any(doc["path"] == path for doc in profiles[p]["documents"])]
    owner = owners.get(path)
    if owner is None:
        return fail([f"{path}: no profile has this document — run `python3 scripts/groundwork.py list`"], as_json)
    if not listed_by:
        return fail(
            [
                f"{path}: belongs to the {owner} profile, which PROJECT.md does not list"
                f" — run `python3 scripts/groundwork.py init` with {owner} added first"
            ],
            as_json,
        )
    result = {"ok": True, "path": path, "owner": owner, "dryRun": dry_run}
    if (ROOT / path).exists():
        if as_json:
            return emit_json(dict(result, action="keep"))
        print(f"{path}: already exists — nothing to do")
        return 0
    template = docs.template_for(owner, path)
    if not template.is_file():
        return fail(
            [f"{path}: core ships this document in place and has no template — restore it from the Groundwork release"],
            as_json,
        )
    source = template.relative_to(ROOT).as_posix()
    if dry_run:
        added = update_manifest([path], dry_run=True)
    else:
        config = read_config()
        was_pristine = pristine(["scaffold-manifest.json"], config)
        (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template, ROOT / path)
        added = update_manifest([path], dry_run=False)
        record(config, [path], ["scaffold-manifest.json"], was_pristine)
        update_state(profiles, owners)
    if as_json:
        return emit_json(dict(result, action="create", template=source, manifestAdditions=added))
    print(f"{'Would create' if dry_run else 'Created'} {path} from {source}")
    if added:
        print(f"{'Would list' if dry_run else 'Listed'} it in scaffold-manifest.json")
    return 0


# --- new --------------------------------------------------------------------


def check_text(value: str, label: str, limit: int, required: bool) -> list[str]:
    if required and not value.strip():
        return [f"{label} is required"]
    if "\n" in value or "\r" in value:
        return [f"{label} must be one line"]
    if len(value) > limit:
        return [f"{label} must be at most {limit} characters"]
    if "{{" in value or "}}" in value:
        return [f"{label} must not contain '{{{{' or '}}}}'"]
    return []


def render(text: str, values: dict[str, str]) -> str:
    """Fill in {{PLACEHOLDER}}s; lines that held one lose trailing spaces."""
    out = []
    for line in text.split("\n"):
        if "{{" in line:
            for key, value in values.items():
                line = line.replace("{{" + key + "}}", value)
            line = line.rstrip()
        out.append(line)
    return "\n".join(out)


def is_inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def packaged_name(rel: str) -> str:
    """npm packages can't contain `.gitignore` files, so the npm package of
    Groundwork ships `_gitignore` instead; `new` restores the real name."""
    folder, _, name = rel.rpartition("/")
    if not name.startswith("."):
        return rel
    return f"{folder}/_{name[1:]}" if folder else f"_{name[1:]}"


def copy_template(staging: Path, values: dict[str, str]) -> dict[str, str]:
    """Copy every manifest file into staging; returns {path: sha256}."""
    manifest = json.loads(docs.MANIFEST.read_text(encoding="utf-8"))
    hashes: dict[str, str] = {}
    for rel in manifest["files"]:
        source, target = ROOT / rel, staging / rel
        if not source.is_file():
            source = ROOT / packaged_name(rel)
        if not source.is_file():
            raise Failure(f"{rel}: listed in this Groundwork's manifest but missing — the template is incomplete")
        target.parent.mkdir(parents=True, exist_ok=True)
        if rel.endswith(".md"):
            target.write_text(render(source.read_text(encoding="utf-8"), values), encoding="utf-8")
        else:
            shutil.copyfile(source, target)
        shutil.copymode(source, target)
        hashes[rel] = digest(target)
    return hashes


def cmd_new(dest: str, name: str, description: str, requested: list[str], agents: list[str], dry_run: bool, as_json: bool) -> int:
    profiles, owners, problems = load()
    if problems:
        return fail(problems, as_json)
    target = Path(dest).expanduser().resolve()
    name = (name or target.name).strip()
    description = description.strip()
    requested_raw = list(requested)
    requested = normalise(requested)
    selected = sorted(dict.fromkeys(requested))
    errors = check_text(name, "Project name", 100, True) + check_text(description, "Description", 300, False)
    errors += docs.check_selection(requested, profiles)
    agents = sorted(dict.fromkeys(a.strip().lower() for agent in agents for a in agent.split(",") if a.strip()))
    errors += [f"unknown agent '{a}' — available: {', '.join(ADAPTERS)}" for a in agents if a not in ADAPTERS]
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        errors.append(f"{target}: already exists and is not empty — choose a new or empty folder")
    if is_inside(target, ROOT):
        errors.append(f"{target}: is inside this copy of Groundwork — choose a folder outside {ROOT}")
    if not target.parent.is_dir():
        errors.append(f"{target.parent}: does not exist — create it first, or choose another folder")
    if errors:
        return fail(errors, as_json)

    staging = target.parent / f".{target.name}.groundwork-{os.getpid()}"
    today = datetime.date.today().isoformat()
    values = {"PROJECT_NAME": name, "PROJECT_DESCRIPTION": description, "PROJECT_DATE": today}
    version = template_version()
    try:
        staging.mkdir()
    except OSError as error:
        return fail([f"{staging}: cannot create a staging folder ({error})"], as_json)
    try:
        hashes = copy_template(staging, values)
        config = {"schema": CONFIG_SCHEMA, "groundworkVersion": version, "generatedAt": today, "files": hashes}
        write_config(config, staging)
        command = [sys.executable, "-I", str(staging / "scripts" / "groundwork.py"), "init"]
        command += (selected or ["none"]) + ["--json"] + (["--dry-run"] if dry_run else [])
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
        try:
            plan = json.loads(result.stdout)
        except ValueError:
            raise Failure(f"init failed in the new project: {(result.stderr or result.stdout).strip()}") from None
        if not plan.get("ok"):
            raise Failure("; ".join(plan.get("errors") or ["init failed in the new project"]))
        # What the developer already told create-groundwork counts as answered,
        # so the agent doesn't ask it again.
        marks = []
        if description:
            marks.append(["what_building", "answered", "--note", "Description given to create-groundwork"])
        if requested_raw:
            marks.append(["profile_fit", "confirmed", "--note", "Profiles chosen when the project was created"])
        for mark_args in [] if dry_run else marks:
            command = [sys.executable, "-I", str(staging / "scripts" / "groundwork.py"), "mark", *mark_args, "--setup", "--json"]
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            if result.returncode != 0:
                raise Failure(f"recording onboarding state failed in the new project: {(result.stderr or result.stdout).strip()}")
        if agents and not dry_run:
            command = [sys.executable, "-I", str(staging / "scripts" / "groundwork.py"), "connect", *agents, "--json"]
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            if result.returncode != 0:
                raise Failure(f"connecting agents failed in the new project: {(result.stderr or result.stdout).strip()}")
        if not dry_run:
            if target.exists():
                target.rmdir()  # checked above: an empty folder
            staging.rename(target)
    except (Failure, OSError) as error:
        return fail([str(error)], as_json)
    finally:
        if staging.exists():
            shutil.rmtree(staging)

    summary = {
        "ok": True,
        "dryRun": dry_run,
        "destination": str(target),
        "name": name,
        "description": description,
        "groundworkVersion": version,
        "files": len(hashes),
        "agents": agents,
        "init": plan,
    }
    if as_json:
        return emit_json(summary)
    print(f"{'Dry run — nothing written. Would create' if dry_run else 'Created'} {name} in {target}")
    print(f"Groundwork {version} files: {len(hashes)}; profiles: {', '.join(selected) or 'none (core only)'}")
    for doc in plan["documents"]:
        if doc["action"] == "create":
            print(f"  + {doc['path']}")
    if agents:
        print(f"Agent adapters: {', '.join(agents)}")
    if not dry_run:
        print(f"Next: open {target} with your AI coding agent — AGENTS.md and GROUNDWORK.md guide it through")
        print("documenting the project. Without an agent: python3 scripts/groundwork.py status")
    return 0


# --- config -----------------------------------------------------------------


def cmd_config(as_json: bool) -> int:
    try:
        config = read_config()
    except Failure as error:
        return fail([str(error)], as_json)
    name = ""
    for line in docs.read_text(docs.PROJECT).splitlines():
        match = NAME_BULLET.match(line)
        if match:
            name = match.group(1)
            break
    if name.startswith(("{{", "[")):
        name = ""
    selected = docs.declared_profiles()
    statuses: dict[str, list[str]] = {"managed": [], "modified": [], "missing": []}
    for path in sorted((config or {}).get("files", {})):
        statuses[file_status(path, config)].append(path)
    data = {
        "ok": True,
        "root": str(ROOT),
        "name": name,
        "profiles": selected,
        "templateVersion": template_version(),
        "autonomy": ob.read_autonomy()[0],
        "stateFile": ob.STATE_FILE if ob.state_path().is_file() else None,
        "config": None
        if config is None
        else {
            "path": CONFIG_FILE,
            "groundworkVersion": config.get("groundworkVersion"),
            "generatedAt": config.get("generatedAt"),
            "files": statuses,
        },
    }
    if as_json:
        return emit_json(data)
    print(f"Project: {name or '(no name in PROJECT.md)'}")
    print(f"Folder: {ROOT}")
    profile_text = "not chosen yet" if selected is None else (", ".join(selected) or "none (core only)")
    print(f"Profiles: {profile_text}  (from PROJECT.md)")
    print(f"Groundwork version: {template_version()}  (from scaffold-manifest.json)")
    print(f"Agent autonomy: {data['autonomy']}  (from GROUNDWORK.md)")
    if config is None:
        print(f"No {CONFIG_FILE}: this project predates Groundwork 3.1, so no files are recorded as managed.")
        return 0
    print(f"Generated: {config.get('generatedAt')} with Groundwork {config.get('groundworkVersion')}")
    print(
        f"Recorded files: {len(statuses['managed'])} unchanged, "
        f"{len(statuses['modified'])} changed by the project, {len(statuses['missing'])} deleted"
    )
    for label, mark in (("modified", "~"), ("missing", "-")):
        for path in statuses[label]:
            print(f"  {mark} {path}")
    return 0


# --- status and docs --------------------------------------------------------


STATUS_WORDS = {
    "complete": "complete",
    "in-progress": "in progress",
    "not-started": "not started",
    "missing": "missing",
    "available": "not created",
    "untracked": "no onboarding definition",
    "skipped": "skipped",
    "deferred": "deferred",
    "not_applicable": "not applicable",
    "unknown": "unknown",
    "blocked": "blocked",
}


def project_name() -> str:
    for line in docs.read_text(docs.PROJECT).splitlines():
        match = NAME_BULLET.match(line)
        if match:
            name = match.group(1)
            return "" if name.startswith(("{{", "[")) else name
    return ""


def gather() -> dict:
    """The full onboarding report, with every problem met on the way as a
    warning: status keeps working with a broken state file or definition."""
    profiles, owners, problems = load()
    if problems:
        raise Failure("; ".join(problems))
    registry, warnings = ob.load_definitions(profiles, owners)
    state, state_problems = ob.read_state()
    if state_problems:
        warnings += [p + " — showing progress from the documents alone; run `groundwork mark --repair`" for p in state_problems]
    elif state is not None:
        errors, stale = ob.validate_state(state, registry, owners)
        if errors:
            warnings += errors + ["state file has invalid entries — ignoring them; run `groundwork mark --repair`"]
            state, _ = ob.repair_state(state, registry, owners)
        warnings += stale
    autonomy, autonomy_problem = ob.read_autonomy()
    if autonomy_problem:
        warnings.append(autonomy_problem)
    report = ob.build_status(profiles, owners, registry, state, docs.declared_profiles())
    return dict(
        report,
        ok=True,
        name=project_name(),
        autonomy=autonomy,
        stateFile=ob.STATE_FILE if state is not None else None,
        groundworkVersion=template_version(),
        warnings=warnings,
    )


def counts_text(report: dict) -> str:
    order = ["complete", "in-progress", "not-started", "missing", "untracked", "skipped", "deferred",
             "not_applicable", "unknown", "blocked"]
    parts = [f"{report['counts'][k]} {STATUS_WORDS[k]}" for k in order if report["counts"].get(k)]
    return ", ".join(parts) or "none"


def discovery_text(report: dict) -> str:
    text = {"not-started": "not started", "in-progress": "in progress", "complete": "complete",
            "declined": "declined by the developer"}[report["discovery"]]
    return text + (f" ({report['discoveryNote']})" if report.get("discoveryNote") else "")


def profiles_text(selected: list[str] | None) -> str:
    return "not chosen yet" if selected is None else (", ".join(selected) or "none (core only)")


def print_question(question: dict, indent: str) -> None:
    print(wrap(f"? {question['id']}: {question['ask']}", indent))
    if question.get("why"):
        print(wrap(f"why: {question['why']}", indent + "    "))
    if question.get("explain"):
        print(wrap(f"explain: {question['explain']}", indent + "    "))
    if question.get("examples"):
        print(wrap("examples: " + "; ".join(question["examples"]), indent + "    "))
    if question.get("appliesWhen"):
        print(wrap(f"only when: {question['appliesWhen']}", indent + "    "))
    if question.get("confirm"):
        print(f"{indent}    needs explicit confirmation")


def cmd_status(brief: bool, as_json: bool) -> int:
    try:
        report = gather()
    except Failure as error:
        return fail([str(error)], as_json)
    if as_json:
        return emit_json(report)
    in_use = [d for d in report["documents"] if d["status"] != "available"]
    focus = report["focus"]
    if brief:
        print(f"Groundwork: discovery {discovery_text(report)}; profiles {profiles_text(report['profiles'])}; autonomy {report['autonomy']}.")
        for step in report["steps"]:
            print(f"- {step['text']}")
        if report["discovery"] == "not-started":
            print("- Onboarding hasn't started: before other work, offer the developer guided discovery as GROUNDWORK.md describes. If they decline, run `groundwork mark discovery declined`.")
        if focus:
            detail = (
                "it already has content: review it before asking"
                if focus["status"] == "review"
                else f"{len(focus['questions'])} question(s) to ask"
            )
            print(f"- Next: {focus['document']} — {focus['heading']} ({detail}).")
        if report["attention"]:
            print(f"- {len(report['attention'])} item(s) need confirmation or review.")
        for warning in report["warnings"]:
            print(f"- Warning: {warning}")
        print("Follow GROUNDWORK.md. Details: `groundwork status` (or `python3 scripts/groundwork.py status`).")
        return 0

    print(f"Groundwork — {report['name'] or '(no name in PROJECT.md)'}")
    print(f"Profiles: {profiles_text(report['profiles'])}    Autonomy: {report['autonomy']} (GROUNDWORK.md)")
    print(f"Discovery: {discovery_text(report)}")
    print(f"Documents in use ({len(in_use)}): {counts_text(report)}")
    for step in report["steps"]:
        print(wrap(f"! {step['text']}", ""))
    print()
    if focus:
        print(f"Next: {focus['document']} — {focus['heading']}")
        if focus.get("purpose"):
            print(wrap(f"Document: {focus['purpose']}", "  "))
        if focus.get("doneWhen"):
            print(wrap(f"Done when: {focus['doneWhen']}", "  "))
        if focus["uses"]:
            print(wrap("Builds on answers to: " + ", ".join(focus["uses"]) + " (don't ask again)", "  "))
        for question in focus["questions"]:
            print_question(question, "  ")
        if not focus["questions"]:
            print("  Its questions are settled: write or review the section.")
    elif report["discovery"] == "declined":
        print("Discovery was declined: work from what's available, and raise documentation gaps only when they affect the task.")
    else:
        print("No onboarding step is waiting. Keep the documents in step with the work as it changes.")
    if report["attention"]:
        print("\nNeeds attention:")
        for item in report["attention"]:
            print(wrap(f"! {item['kind']}: {item['target']} — {item['text']}", "  "))
    if report["open"]:
        print("\nOpen items (skipped, deferred, unknown or blocked):")
        for item in report["open"]:
            note = f" — {item['note']}" if item.get("note") else ""
            print(wrap(f"~ {item['state']}: {item['target']}{note}", "  "))
    if report["later"]:
        print(f"\nLater, when the work reaches them: {len(report['later'])} document(s) — `groundwork docs` lists them.")
    if report["available"]:
        print("\nOptional documents, for when their condition holds (`groundwork add PATH`):")
        for doc in report["available"]:
            print(wrap(f"- {doc['path']}: {doc['when']}", "  "))
    for warning in report["warnings"]:
        print(wrap(f"WARN: {warning}", ""))
    return 0


def normalise_path(path: str) -> str:
    path = Path(path).as_posix()
    while path.startswith("./"):
        path = path[2:]
    return path


def cmd_docs(path: str | None, as_json: bool) -> int:
    try:
        report = gather()
    except Failure as error:
        return fail([str(error)], as_json)
    if path is None:
        if as_json:
            return emit_json({"ok": True, "documents": report["documents"], "warnings": report["warnings"]})
        print(f"{'STATUS':<17} {'STAGE':<10} {'SECTIONS':<9} DOCUMENT")
        for doc in report["documents"]:
            done = sum(1 for s in doc["sections"] if s["status"] in ob.CLOSED_SECTION)
            sections = f"{done}/{len(doc['sections'])}" if doc["sections"] else "-"
            kind = "" if doc["required"] else "  (optional)"
            print(f"{STATUS_WORDS.get(doc['status'], doc['status']):<17} {doc['stage']:<10} {sections:<9} {doc['path']}{kind}")
        for warning in report["warnings"]:
            print(wrap(f"WARN: {warning}", ""))
        return 0
    path = normalise_path(path)
    doc = next((d for d in report["documents"] if d["path"] == path), None)
    if doc is None:
        return fail([f"{path}: not a document of the active profiles — `groundwork docs` lists them"], as_json)
    if as_json:
        return emit_json(dict(doc, ok=True))
    print(f"{doc['path']} — {STATUS_WORDS.get(doc['status'], doc['status'])}")
    owner = f"owner: {doc['owner']}; " + ("required by " + ", ".join(doc["requiredBy"]) if doc["required"] else "optional")
    print(f"  {owner}; stage: {doc['stage']}")
    for label, key in (("Purpose", "purpose"), ("When", "when"), ("If skipped", "skip"), ("Note", "note")):
        if doc.get(key):
            print(wrap(f"{label}: {doc[key]}", "  "))
    if doc["dependsOn"]:
        print(f"  Depends on: {', '.join(doc['dependsOn'])}")
    for section in doc["sections"]:
        flag = "required" if section["required"] else "optional"
        print(f"\n  #{section['id']}  {section['heading']}  [{section['status']}; {flag}; content: {section['content']}]")
        for label, key in (("done when", "doneWhen"), ("applies when", "appliesWhen"), ("note", "note")):
            if section.get(key):
                print(wrap(f"{label}: {section[key]}", "    "))
        if section["uses"]:
            print(wrap("uses answers to: " + ", ".join(section["uses"]), "    "))
        for question in section["questions"]:
            note = f" — {question['note']}" if question.get("note") else ""
            print(wrap(f"[{question['state']}] {question['id']}: {question['ask']}{note}", "    "))
    return 0


# --- mark -------------------------------------------------------------------


def resolve_target(target: str, value: str, registry: dict, owners: dict[str, str], profiles: dict[str, dict]) -> tuple[str, str, str | None]:
    """(kind, key, section) for a target, or raise Failure explaining why it can't take the value."""
    clear = value in ("clear", "unasked")
    if target == "discovery":
        if value not in ob.DISCOVERY_STATES + ("clear",):
            raise Failure(f"discovery: use {', '.join(ob.DISCOVERY_STATES)} or clear")
        return "discovery", target, None
    if "#" in target:
        path, section_id = target.split("#", 1)
        path = normalise_path(path)
        sections = {s["id"] for s in registry["documents"].get(path, {}).get("sections", [])}
        if section_id not in sections:
            known = ", ".join(sorted(sections)) or "none"
            raise Failure(f"{target}: unknown section — {path} has: {known}")
        if not clear and value not in ob.STATES:
            raise Failure(f"{target}: use one of {', '.join(ob.STATES)} or clear")
        return "section", path, section_id
    path = normalise_path(target)
    if path in owners:
        if not clear and value not in ob.DOCUMENT_STATES:
            raise Failure(f"{path}: a document can be {', '.join(ob.DOCUMENT_STATES)} or clear; record answers on its questions or sections")
        active = docs.active_profiles(docs.declared_profiles(), profiles)
        needed_by = docs.required_documents(active, profiles).get(path)
        if value == "not_applicable" and needed_by:
            raise Failure(
                f"{path}: required by {', '.join(needed_by)}, so it can't be not applicable"
                " — mark it skipped or deferred, or change the profiles if it truly doesn't apply"
            )
        return "document", path, None
    if target in registry["questions"]:
        if not clear and value not in ob.STATES:
            raise Failure(f"{target}: use one of {', '.join(ob.STATES)} or clear")
        return "question", target, None
    raise Failure(f"{target}: not a question ID, document path, section (PATH#ID) or `discovery` — see `groundwork docs PATH`")


def cmd_mark(
    args: list[str], note: str, source: str, reopen: bool, repair: bool, dry_run: bool, as_json: bool, setup: bool = False
) -> int:
    profiles, owners, problems = load()
    if problems:
        return fail(problems, as_json)
    registry, definition_problems = ob.load_definitions(profiles, owners)
    if definition_problems:
        return fail(definition_problems, as_json, "Fix the onboarding definitions first: python3 scripts/check_docs.py")
    state, state_problems = ob.read_state()
    invalid: list[str] = []
    if state is not None:
        invalid = ob.validate_state(state, registry, owners)[0]

    if repair:
        if args:
            return fail(["mark --repair takes no targets"], as_json)
        backup = None
        fresh, dropped = ob.repair_state(state, registry, owners)
        if ob.state_path().is_file() and (state_problems or dropped):
            backup = f"{ob.STATE_FILE}.bak-{ob.today()}"
            if not dry_run:
                shutil.copyfile(ob.state_path(), ROOT / backup)
        if not dry_run:
            ob.write_state(fresh)
        result = {"ok": True, "dryRun": dry_run, "dropped": dropped, "backup": backup, "unreadable": state_problems}
        if as_json:
            return emit_json(result)
        print(("Dry run — would rebuild " if dry_run else "Rebuilt ") + ob.STATE_FILE)
        for problem in state_problems:
            print(f"  unreadable: {problem}; progress is recovered from the documents")
        for item in dropped:
            print(f"  dropped: {item}")
        if backup:
            print(f"  the old file is kept as {backup}")
        return 0

    if state_problems or invalid:
        return fail(state_problems + invalid, as_json, "Run `groundwork mark --repair` to rebuild the state file, keeping every valid entry.")
    if len(args) < 2:
        return fail(["mark needs at least one TARGET and a STATE, for example: mark problem answered"], as_json)
    *targets, value = args
    if source and source not in ob.SOURCES:
        return fail([f"--source must be one of {', '.join(ob.SOURCES)}"], as_json)
    if value in ob.NEEDS_NOTE and not note.strip():
        return fail([f"{value} needs --note: " + ("the assumption, in one sentence" if value == "assumed" else "what it is waiting on")], as_json)
    state = state or ob.empty_state()
    errors, changes = [], []
    for target in targets:
        try:
            kind, key, section = resolve_target(target, value, registry, owners, profiles)
        except Failure as error:
            errors.append(str(error))
            continue
        if kind == "discovery":
            current = (state.get("discovery") or {}).get("state")
        elif kind == "question":
            current = state["questions"].get(key, {}).get("state")
        elif kind == "section":
            current = state["documents"].get(key, {}).get("sections", {}).get(section, {}).get("state")
        else:
            current = state["documents"].get(key, {}).get("state")
        if current == "confirmed" and value in ("assumed", "unasked", "clear") and not reopen:
            errors.append(f"{target}: confirmed by the developer — pass --reopen only if they asked to revisit it")
            continue
        changes.append((kind, key, section, target, current))
    if errors:
        return fail(errors, as_json)

    for kind, key, section, _, _ in changes:
        entry: dict | None = None
        if value not in ("clear", "unasked"):
            entry = {"state": value, "updated": ob.today()}
            if note.strip():
                entry["note"] = note.strip()
            chosen = source or {"assumed": "agent", "answered": "developer", "confirmed": "developer"}.get(value)
            if chosen and kind in ("question", "section"):
                entry["source"] = chosen
            if setup:
                entry["setup"] = True
        if kind == "discovery":
            if entry:
                state["discovery"] = entry
            else:
                state.pop("discovery", None)
        elif kind == "question":
            if entry:
                state["questions"][key] = entry
            else:
                state["questions"].pop(key, None)
        else:
            document = state["documents"].setdefault(key, {})
            if kind == "section":
                sections = document.setdefault("sections", {})
                if entry:
                    sections[section] = entry
                else:
                    sections.pop(section, None)
                    if not sections:
                        document.pop("sections")
            else:
                for field in ("state", "note", "updated"):
                    document.pop(field, None)
                if entry:
                    document.update({k: entry[k] for k in ("state", "note", "updated") if k in entry})
            if not document:
                state["documents"].pop(key)
    if not dry_run:
        ob.write_state(state)
    result = {"ok": True, "dryRun": dry_run, "state": value, "note": note.strip() or None,
              "changes": [{"target": t, "kind": k, "before": c or "unasked", "after": value} for k, _, _, t, c in changes]}
    if as_json:
        return emit_json(result)
    for change in result["changes"]:
        print(f"{'Would record' if dry_run else 'Recorded'}: {change['target']}: {change['before']} -> {value}"
              + (f" ({result['note']})" if result["note"] else ""))
    return 0


# --- connect ----------------------------------------------------------------
# Thin adapters for agents that don't read AGENTS.md on their own. Each only
# points at AGENTS.md (or runs `status --brief`); none copies the workflow.

CLAUDE_MD = """# Claude Code

@AGENTS.md

This file only imports `AGENTS.md`, which holds this project's instructions and points to `GROUNDWORK.md`. Keep shared rules there; add Claude-specific notes below.
"""

CLAUDE_SETTINGS = {
    "hooks": {
        "SessionStart": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": 'python3 "$CLAUDE_PROJECT_DIR/scripts/groundwork.py" status --brief',
                    }
                ]
            }
        ]
    }
}

GEMINI_SETTINGS = {"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}}

ADAPTERS: dict[str, dict] = {
    "claude": {
        "name": "Claude Code",
        "files": [
            ("CLAUDE.md", CLAUDE_MD, "@AGENTS.md", "add a line `@AGENTS.md` to it"),
            (".claude/settings.json", json.dumps(CLAUDE_SETTINGS, indent=2) + "\n", "groundwork.py",
             "add this SessionStart hook to it: " + json.dumps(CLAUDE_SETTINGS["hooks"]["SessionStart"][0])),
        ],
        "note": "Claude Code reads CLAUDE.md; the session-start hook shows the onboarding status at the start of every session.",
    },
    "gemini": {
        "name": "Gemini CLI",
        "files": [
            (".gemini/settings.json", json.dumps(GEMINI_SETTINGS, indent=2) + "\n", "AGENTS.md",
             'add "AGENTS.md" to "context.fileName" in it'),
        ],
        "note": "Gemini CLI reads GEMINI.md by default; this setting makes it read AGENTS.md too.",
    },
}
NATIVE = "Codex, Cursor, GitHub Copilot, Windsurf, Amp and other agents read AGENTS.md without an adapter."


def cmd_connect(requested: list[str], dry_run: bool, as_json: bool) -> int:
    unknown = [a for a in requested if a not in ADAPTERS]
    if unknown:
        return fail([f"unknown agent '{a}' — available: {', '.join(ADAPTERS)}" for a in unknown], as_json, NATIVE)
    results = []
    created: list[str] = []
    for agent in requested or list(ADAPTERS):
        for path, content, marker, manual in ADAPTERS[agent]["files"]:
            target = ROOT / path
            if not target.exists():
                action = "create" if requested else "absent"
                if requested and not dry_run:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(content, encoding="utf-8")
                    created.append(path)
            elif marker in docs.read_text(target):
                action = "present"
            else:
                action = "manual" if requested else "other"
            results.append({"agent": agent, "path": path, "action": action, "manual": manual if action == "manual" else None})
    if created:
        try:
            config = read_config()
        except Failure:
            config = None
        record(config, created, [], set())
    if as_json:
        return emit_json({"ok": True, "dryRun": dry_run, "files": results})
    if not requested:
        for agent, adapter in ADAPTERS.items():
            files = [r for r in results if r["agent"] == agent]
            connected = all(r["action"] == "present" for r in files)
            print(f"{agent} ({adapter['name']}): {'connected' if connected else 'not connected'} — {adapter['note']}")
            for r in files:
                print(f"  {r['path']}: {r['action']}")
        print(NATIVE)
        print("Connect one with: groundwork connect claude")
        return 0
    for r in results:
        if r["action"] == "create":
            print(f"{'Would create' if dry_run else 'Created'} {r['path']} ({r['agent']})")
        elif r["action"] == "present":
            print(f"{r['path']}: already connected")
        else:
            print(wrap(f"{r['path']}: exists and was left unchanged — {r['manual']}", ""))
    return 0


# --- main -------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="Set up and grow a Groundwork project's documents from its profiles.")
    sub = parser.add_subparsers(dest="command", required=True)

    def command(name: str, help_text: str, dry_run: bool = True) -> argparse.ArgumentParser:
        sub_parser = sub.add_parser(name, help=help_text)
        if dry_run:
            sub_parser.add_argument("--dry-run", action="store_true", help="show what would change")
        sub_parser.add_argument("--json", action="store_true", help="print one JSON object")
        return sub_parser

    command("list", "show every profile", dry_run=False)
    init = command("init", "choose the active profiles and create their documents")
    init.add_argument("profiles", nargs="+", help="profile IDs, or 'none' for core only")
    add = command("add", "create an optional document from its template")
    add.add_argument("path", help="document path, for example docs/ai-systems/RETRIEVAL.md")
    new = command("new", "create a new project from this copy of Groundwork")
    new.add_argument("dest", help="folder to create (must be new or empty)")
    new.add_argument("--name", default="", help="project name (default: the folder name)")
    new.add_argument("--description", default="", help="one-line description")
    new.add_argument("--profiles", nargs="*", default=[], help="profile IDs (default: none)")
    new.add_argument("--agents", nargs="*", default=[], help=f"agent adapters to add: {', '.join(ADAPTERS)}")
    command("config", "show this project's Groundwork configuration", dry_run=False)
    status = command("status", "show where documentation onboarding stands", dry_run=False)
    status.add_argument("--brief", action="store_true", help="a few lines, for an agent's session-start hook")
    docs_parser = command("docs", "list documents in use, or show one document's sections", dry_run=False)
    docs_parser.add_argument("path", nargs="?", help="a document path")
    mark = command("mark", "record onboarding progress")
    mark.add_argument("args", nargs="*", metavar="TARGET... STATE", help="question IDs, PATH, PATH#SECTION or 'discovery', then the state")
    mark.add_argument("--note", default="", help="why: required for assumed and blocked")
    mark.add_argument("--source", default="", help=f"where the answer came from: {', '.join(ob.SOURCES)}")
    mark.add_argument("--reopen", action="store_true", help="allow changing something the developer confirmed")
    mark.add_argument("--repair", action="store_true", help="rebuild a damaged state file, keeping valid entries")
    mark.add_argument("--setup", action="store_true", help=argparse.SUPPRESS)  # used by `new`
    connect = command("connect", "add instruction files for agents that don't read AGENTS.md")
    connect.add_argument("agents", nargs="*", help=f"agents: {', '.join(ADAPTERS)}")
    args = parser.parse_args()

    if args.command == "new":
        return cmd_new(args.dest, args.name, args.description, args.profiles, args.agents, args.dry_run, args.json)
    if args.command == "config":
        return cmd_config(args.json)
    if args.command == "status":
        return cmd_status(args.brief, args.json)
    if args.command == "docs":
        return cmd_docs(args.path, args.json)
    if args.command == "mark":
        try:
            return cmd_mark(args.args, args.note, args.source, args.reopen, args.repair, args.dry_run, args.json, args.setup)
        except Failure as error:
            return fail([str(error)], args.json)
    if args.command == "connect":
        return cmd_connect(args.agents, args.dry_run, args.json)
    profiles, owners, problems = load()
    if problems:
        return fail(problems, args.json)
    try:
        if args.command == "list":
            return cmd_list(profiles, args.json)
        if args.command == "init":
            return cmd_init(args.profiles, profiles, owners, args.dry_run, args.json)
        return cmd_add(args.path, profiles, owners, args.dry_run, args.json)
    except Failure as error:
        return fail([str(error)], args.json)


if __name__ == "__main__":
    sys.exit(main())
