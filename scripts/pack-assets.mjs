// npm never packs files named .gitignore. Before packing, copy the
// template's .gitignore to _gitignore (scripts/groundwork.py `new` restores
// the name); after packing, remove the copy again.
import { copyFileSync, rmSync } from "node:fs";

const [action] = process.argv.slice(2);
if (action === "add") copyFileSync("template/.gitignore", "template/_gitignore");
else if (action === "remove") rmSync("template/_gitignore", { force: true });
else throw new Error("usage: node scripts/pack-assets.mjs add|remove");
