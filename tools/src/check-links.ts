#!/usr/bin/env node
import { parseArgs } from "node:util";
import packageInfo from "../package.json" with { type: "json" };
import { checkLinks } from "./links/check.js";

const usage = "Usage: methodology-check-links [project-root]";

function run(): number {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { help: { type: "boolean", short: "h" }, version: { type: "boolean" } },
    });
    if (positionals.length > 1 || positionals[0] === ""
        || (values.help && values.version) || ((values.help || values.version) && positionals.length)) {
      throw new Error(usage);
    }
    if (values.help) {
      console.log(usage);
      return 0;
    }
    if (values.version) {
      console.log(packageInfo.version);
      return 0;
    }

    const { filesChecked, diagnostics } = checkLinks(positionals[0] ?? ".");
    if (diagnostics.length) {
      for (const diagnostic of diagnostics) console.error(diagnostic);
      return 1;
    }
    console.log(`Checked ${filesChecked} Markdown files.`);
    return 0;
  } catch (error) {
    console.error(`methodology-check-links: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

process.exitCode = run();
