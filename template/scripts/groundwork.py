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


def apply_init(plan: dict, owners: dict[str, str]) -> None:
    config = read_config()
    edited = ["PROJECT.md", "AGENTS.md", "scaffold-manifest.json"]
    was_pristine = pristine(edited, config)
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
        apply_init(plan, owners)
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


def cmd_new(dest: str, name: str, description: str, requested: list[str], dry_run: bool, as_json: bool) -> int:
    profiles, owners, problems = load()
    if problems:
        return fail(problems, as_json)
    target = Path(dest).expanduser().resolve()
    name = (name or target.name).strip()
    description = description.strip()
    requested = normalise(requested)
    selected = sorted(dict.fromkeys(requested))
    errors = check_text(name, "Project name", 100, True) + check_text(description, "Description", 300, False)
    errors += docs.check_selection(requested, profiles)
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
        "init": plan,
    }
    if as_json:
        return emit_json(summary)
    print(f"{'Dry run — nothing written. Would create' if dry_run else 'Created'} {name} in {target}")
    print(f"Groundwork {version} files: {len(hashes)}; profiles: {', '.join(selected) or 'none (core only)'}")
    for doc in plan["documents"]:
        if doc["action"] == "create":
            print(f"  + {doc['path']}")
    if not dry_run:
        print(f"Next: cd {target} and run python3 scripts/check_docs.py")
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
    command("config", "show this project's Groundwork configuration", dry_run=False)
    args = parser.parse_args()

    if args.command == "new":
        return cmd_new(args.dest, args.name, args.description, args.profiles, args.dry_run, args.json)
    if args.command == "config":
        return cmd_config(args.json)
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
