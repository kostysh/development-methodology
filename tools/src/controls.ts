#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import packageInfo from "../package.json" with { type: "json" };
import { checkArtifacts } from "./controls/artifacts.js";
import { checkResults } from "./controls/checks.js";
import { checkGit } from "./controls/git.js";
import { config, Rejection, ResourceBusy } from "./controls/input.js";
import { runControl, supervise } from "./controls/run.js";
import { trustedPath } from "./train/config.js";
import { checkReviewControls, reviewControls } from "./train/review-policy.js";

const usage = "Usage: methodology-controls artifacts|git|run|reconcile <policy.json>\n"
  + "       methodology-controls checks <policy.json> <trusted-results.json>\n"
  + "       methodology-controls review-policy POLICY BASE HEAD [--owner-message REFERENCE]";

async function worker(mode: string, path: string) {
  if (!process.connected || (mode !== "run" && mode !== "reconcile")) throw new Error("Invalid resource worker invocation");
  const abort = new AbortController();
  const stop = () => abort.abort();
  const message = (value: unknown) => { if (value === "stop") stop(); };
  process.on("message", message);
  process.on("disconnect", stop);
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    return await runControl(config(path), mode === "reconcile", abort.signal);
  } finally {
    process.off("message", message);
    process.off("disconnect", stop);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    if (process.connected) process.disconnect();
  }
}

async function run([command, ...args]: string[]): Promise<number> {
  if (!args.length && (command === "--version" || command === "--help")) {
    console.log(command === "--version" ? packageInfo.version : usage);
    return 0;
  }
  if (command === "--resource-worker" && args.length === 2) return worker(args[0], args[1]);
  if ((command === "run" || command === "reconcile") && args.length === 1) {
    return supervise(fileURLToPath(import.meta.url), command, args[0]);
  }
  if (command === "artifacts" && args.length === 1) {
    console.log(JSON.stringify(checkArtifacts(config(args[0]), process.cwd())));
    return 0;
  }
  if (command === "git" && args.length === 1) {
    console.log(JSON.stringify(checkGit(config(args[0]))));
    return 0;
  }
  if (command === "checks" && args.length === 2) {
    console.log(JSON.stringify(checkResults(config(args[0]), args[1])));
    return 0;
  }
  if (command === "review-policy" && (args.length === 3 || (args.length === 5 && args[3] === "--owner-message"))) {
    const [path, base, head, , message] = args;
    trustedPath(path);
    const controls = reviewControls(config(path).reviewControls);
    if (!controls) throw new Error("Missing reviewControls in the coordinator policy");
    const result = checkReviewControls(controls, base, head, message);
    console.log(JSON.stringify({ base, head, ...result }));
    return 0;
  }
  throw new Error(usage);
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(`methodology-controls: ${error instanceof Error ? error.message : "Control failed"}`);
  process.exitCode = error instanceof ResourceBusy ? 75 : error instanceof Rejection ? 1 : 2;
}
