import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Config } from "../src/train/config.ts";
import type { Kind, Suite } from "../src/train/engine.ts";
import type { Environment } from "../src/train/operate.ts";
import type { Objects as GitObjects } from "../src/train/git.ts";
import type { Pull } from "../src/train/github.ts";

const dist = process.env.METHODOLOGY_TRAIN_BIN ? dirname(realpathSync(process.env.METHODOLOGY_TRAIN_BIN))
  : fileURLToPath(new URL("../dist/",import.meta.url));
export async function mod(name: string) { return import(pathToFileURL(join(dist,"train",name+".js")).href); }
export const { operate } = await mod("operate") as typeof import("../src/train/operate.ts");
export const { Objects } = await mod("git") as typeof import("../src/train/git.ts");

export function git(dir: string,...args: string[]) {
  return execFileSync("git",["-c","core.hooksPath=/dev/null",...args],{cwd:dir,encoding:"utf8",
    env:{PATH:process.env.PATH,GIT_CONFIG_GLOBAL:"/dev/null",GIT_CONFIG_NOSYSTEM:"1",
      GIT_AUTHOR_NAME:"Fixture",GIT_COMMITTER_NAME:"Fixture",GIT_AUTHOR_EMAIL:"a@localhost",GIT_COMMITTER_EMAIL:"a@localhost"},
    stdio:["ignore","pipe","pipe"]}).trim();
}
export function config(root: string): Config {
  return {repository:"example/disposable",branch:"main",stateDir:join(root,"state"),mode:"enabled",immutableSources:true,writerAppId:123,
    checks:[{name:"audited",appId:124}],migrationChecks:[],queueLabel:"train-ready",suiteImage:"sha256:" + "f".repeat(64),
    timeoutSeconds:120,maxPrs:8,maxMigrations:1,fullBudget:2,flakeDays:7,flakeOwner:"test owner",
    migrationPaths:[],docsPaths:["docs/"],dependencies:{}};
}
export function fixture() {
  const root = mkdtempSync(join(realpathSync(tmpdir()),"methodology-train-case-"));
  const repo = join(root,"remote.git"), edit = join(root,"author");
  mkdirSync(repo); mkdirSync(edit); mkdirSync(join(root,"state"),{mode:0o700});
  git(repo,"init","--bare","--initial-branch=main");
  git(edit,"init","--initial-branch=main"); writeFileSync(join(edit,"base"),"base\n");
  git(edit,"add","."); git(edit,"commit","-m","base"); git(edit,"push",repo,"HEAD:refs/heads/main");
  writeFileSync(join(root,"pulls.json"),"[]");
  writeFileSync(join(root,"train.json"),JSON.stringify(config(root)),{mode:0o600});
  return root;
}
export function add(root: string,n: number,path: string,value = "1") {
  const edit = join(root,"author"), repo = join(root,"remote.git");
  git(edit,"fetch",repo,"main"); git(edit,"checkout","-q","--detach","FETCH_HEAD");
  mkdirSync(dirname(join(edit,path)),{recursive:true}); writeFileSync(join(edit,path),value + "\n");
  git(edit,"add","."); git(edit,"commit","-m","change " + n);
  git(edit,"push","--force",repo,"HEAD:refs/pull/" + n + "/head");
  const numbers = JSON.parse(readFileSync(join(root,"pulls.json"),"utf8")) as number[];
  if (!numbers.includes(n)) writeFileSync(join(root,"pulls.json"),JSON.stringify([...numbers,n]));
  return git(edit,"rev-parse","HEAD");
}
export function makeEnv(root: string, suite: (kind:Kind, sha:string, tests:string[], git:GitObjects)=>Suite,
  opts: { publish?: (git: GitObjects, base:string, candidate:string) => void; cleanup?: ()=>void; permit?: (p:Pull)=>boolean } = {}) {
  const remote = join(root,"remote.git");
  function get(n: number): Pull {
    const head = git(remote,"rev-parse","refs/pull/" + n + "/head");
    const merged = git(remote,"merge-base", head, "main") === head;
    return {number:n,head,ref:"change/"+n,open:!merged,merged,draft:false,target:"main",sameRepo:true,labels:[]};
  }
  const env: Environment = {
    host: () => ({ get,list:(state="open")=> (JSON.parse(readFileSync(join(root,"pulls.json"),"utf8")) as number[]).map(get).filter(p=>state==="all" || p.open),
      audit:()=>false, gates:p=>p.open && (opts.permit?.(p) ?? true), verifyWriter:()=>{},verifyImmutable:()=>{},mark:()=>{},comment:()=>{} }),
    objects: (dir,c,d) => {
      const o = new Objects(dir,remote,c.branch,d);
      if (opts.publish) o.publish = (base,candidate) => opts.publish!(o,base,candidate);
      return o;
    },
    suite: (_c,o,_id,kind,sha,tests) => suite(kind,sha,tests,o), cleanup:()=>opts.cleanup?.(),
  };
  return env;
}
export const pass = ():Suite => ({result:"pass"});
export const fail = ():Suite => ({result:"fail",tests:["affected"]});
export function has(o:GitObjects,sha:string,path:string) {
  return o.git(["cat-file","-e",sha+":"+path],[0,128]).code === 0;
}
export function revision(root:string) { return git(join(root,"remote.git"),"rev-parse","main"); }

if (process.argv[2] === "--crash-worker") {
  const [, , , root, boundary] = process.argv;
  const c = JSON.parse(readFileSync(join(root,"train.json"),"utf8")) as Config;
  function crash(): never { process.kill(process.pid,"SIGKILL"); throw new Error("SIGKILL failed"); }
  await operate(c,{},makeEnv(root,() => boundary === "suite" ? crash() : pass(),{
    publish: (o,b,h) => { Objects.prototype.publish.call(o,b,h); if (boundary === "after-push") crash(); },
  }));
}
