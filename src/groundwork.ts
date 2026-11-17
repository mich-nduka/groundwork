#!/usr/bin/env node
// Entry point for `groundwork <command> [options]`.
import { main, runGroundwork } from "./commands.js";

await main(() => runGroundwork(process.argv.slice(2)));
