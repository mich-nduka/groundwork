#!/usr/bin/env node
// Entry point for `npx create-groundwork [folder] [options]`.
import { main, runCreate } from "./commands.js";

await main(() => runCreate(process.argv.slice(2)));
