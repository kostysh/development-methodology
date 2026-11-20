#!/usr/bin/env node
import { parseArgs } from "node:util";
import packageInfo from "../package.json" with {type:"json"};
import { readConfig } from "./train/config.js";
import { evidence } from "./train/evidence.js";
import { publishReview } from "./train/publish-review.js";
import { operate } from "./train/operate.js";
import { morning, observe } from "./train/report.js";
import { history } from "./train/state.js";

const usage = "Usage: methodology-train run PROFILE [--scheduled | --pr NUMBER [--docs]]\n" +
  "       methodology-train report PROFILE FROM_UTC THROUGH_UTC\n" +
  "       methodology-train observations PROFILE\n" +
  "       methodology-train identity|export-checks|admission POLICY PR HEAD REF\n" +
  "       methodology-train publish-review POLICY PR HEAD REF VERDICT [--owner-message REFERENCE]";
try {
  const { values, positionals } = parseArgs({allowPositionals:true, options:{help:{type:"boolean"},version:{type:"boolean"},
    "owner-message":{type:"string"},scheduled:{type:"boolean"},pr:{type:"string"},docs:{type:"boolean"}}});
  if (process.argv.length === 3 && values.help) console.log(usage);
  else if (process.argv.length === 3 && values.version) console.log(packageInfo.version);
  else if (["identity","export-checks","admission"].includes(positionals[0]) && positionals.length === 5 && !Object.keys(values).length) {
    const [op,path,pr,head,ref] = positionals;
    console.log(JSON.stringify(evidence(op,path,pr,head,ref)));
  } else if (positionals[0] === "publish-review" && positionals.length === 6 && Object.keys(values).every(k=>k==="owner-message")) {
    const [,path,pr,head,ref,verdict] = positionals;
    console.log(JSON.stringify(publishReview(path,pr,head,ref,verdict,values["owner-message"])));
  } else {
    const [op, path, from, through] = positionals;
    if (values["owner-message"] !== undefined || !path || !["run","report","observations"].includes(op) || values.help || values.version ||
      positionals.length !== (op === "report" ? 4 : 2) ||
      (op !== "run" && Object.keys(values).length) || (values.docs && !values.pr) ||
      (values.scheduled && values.pr) || (values.pr !== undefined && (!/^[1-9]\d*$/.test(values.pr) || !Number.isSafeInteger(Number(values.pr)))))
      throw new Error(usage);
    const c = readConfig(path);
    if (op === "report") console.log(JSON.stringify(morning(c,from,through),null,2));
    else if (op === "observations") {
      if (!c.metrics) throw new Error("Missing bound metrics profile");
      for (const r of history(c)) observe(c,r);
    } else {
      const r = await operate(c,{pr: values.pr ? Number(values.pr):undefined, docs:values.docs, scheduled:values.scheduled});
      console.log(JSON.stringify(r,null,2));
      if (r.retryable) process.exitCode = 75;
      else if (r.incidents.length || r.decisions.length) process.exitCode = 1;
    }
  }
} catch (error) {
  console.error("methodology-train: " + (error as Error).message); process.exitCode = 2;
}
