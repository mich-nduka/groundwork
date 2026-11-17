// Show profiles exactly as their manifests describe them. Nothing here
// decides anything: the manifests are the source of truth, and the engine
// enforces the rules.

import type { Profile } from "./engine.js";
import { bold, bullet, dim, wrap } from "./text.js";

export const CORE = "core";

function list(items: string[], last = "or"): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;
}

/** Human-readable dependency lines, using profile names. */
export function describeRequires(profile: Profile, all: Profile[]): string[] {
  const name = (id: string) => all.find((p) => p.id === id)?.name ?? id;
  return (profile.requires ?? []).map((entry) =>
    typeof entry === "string" ? name(entry) : entry.length === 1 ? name(entry[0]!) : `one of ${list(entry.map(name))}`,
  );
}

/** The first sentence of a purpose, for short hints. */
export function summary(profile: Profile): string {
  const match = profile.purpose.match(/^.*?[.:](\s|$)/);
  return (match ? match[0] : profile.purpose).trim().replace(/[.:]$/, "");
}

export function formatProfileList(profiles: Profile[], source: string): string {
  const out = [`${bold("Groundwork profiles")} ${dim(`(from ${source})`)}`, ""];
  for (const profile of profiles) {
    const core = profile.id === CORE;
    out.push(`  ${bold(profile.id)} — ${profile.name}${core ? dim(" (always active)") : ""}`);
    out.push(wrap(profile.purpose, "    "));
    if (!core) {
      out.push(`    Use when:`);
      for (const item of profile.use_when ?? []) out.push(bullet(item, "      "));
      out.push(`    Not when:`);
      for (const item of profile.not_when ?? []) out.push(bullet(item, "      "));
      const requires = describeRequires(profile, profiles);
      if (requires.length) out.push(`    Requires: ${requires.join("; ")}`);
      if (profile.incompatible_with?.length) out.push(`    Incompatible with: ${profile.incompatible_with.join(", ")}`);
    }
    out.push("");
  }
  out.push("Choose by what the system does, not by the technology it uses.");
  out.push(`Details of one profile: ${bold("groundwork profiles <id>")}`);
  return out.join("\n");
}

export function formatProfile(profile: Profile, all: Profile[], source: string): string {
  const core = profile.id === CORE;
  const out = [`${bold(profile.name)} ${dim(`(${profile.id}${core ? ", always active" : ""}) — from ${source}`)}`, ""];
  out.push(wrap(profile.purpose), "");
  if (!core) {
    out.push(bold("When to use it"));
    for (const item of profile.use_when ?? []) out.push(bullet(item));
    out.push("", bold("When not to use it"));
    for (const item of profile.not_when ?? []) out.push(bullet(item));
    out.push("", bold("Dependencies"));
    const requires = describeRequires(profile, all);
    out.push(requires.length ? requires.map((r) => `  - Requires ${r}`).join("\n") : "  - None");
    if (profile.incompatible_with?.length) out.push(`  - Incompatible with ${profile.incompatible_with.join(", ")}`);
    out.push("");
  }
  const required = profile.documents.filter((d) => d.required);
  const optional = profile.documents.filter((d) => !d.required);
  out.push(bold("Required documents"));
  out.push(required.length ? required.map((d) => `  - ${d.path}`).join("\n") : "  - None");
  out.push("", bold("Optional documents") + dim(" (create one when its condition holds: groundwork add <path>)"));
  out.push(optional.length ? optional.map((d) => bullet(`${d.path}: ${d.when}`)).join("\n") : "  - None");
  if (!core) {
    out.push("", bold("Engineering checks") + dim(" (rows in the AGENTS.md tooling table)"));
    const checks = profile.checks ?? [];
    out.push(checks.length ? checks.map((c) => bullet(`${c.name}: ${c.what}`)).join("\n") : "  - None");
  }
  out.push("", `Standards and agent instructions: ${profile.readme}`);
  return out.join("\n");
}
