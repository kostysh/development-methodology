import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { soloOwner } from "./solo-owner-fixture.ts";
import { add,config,fail,fixture,git,has,makeEnv,mod,Objects,operate,pass,revision } from "./train-runtime-fixture.ts";
function setup(t:TestContext) {
  const root = fixture(); t.after(()=>rmSync(root,{recursive:true,force:true}));
  return {root,c:config(root),base:revision(root)};
}

test("the public train refuses to enable publication with mutable source heads", t => {
  const {root,c}=setup(t);
  const bin=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  const path=join(root,"train.json");
  for (const immutableSources of [false,undefined]) {
    writeFileSync(path,JSON.stringify({...c,mode:"enabled",immutableSources}));
    const result=spawnSync(process.execPath,[bin,"report",path,"2026-01-01T00:00:00Z","2026-01-02T00:00:00Z"],{encoding:"utf8"});
    assert.equal(result.status,2);
    assert.match(result.stderr,/immutableSources/u);
  }
});

test("a passing batch integrates two exact heads, reads the tree and deployed revision; dry mode suppresses both writes", async t => {
  const {root,c,base} = setup(t); const p = add(root,1,"first"), q = add(root,2,"second");
  c.deployment = join(root,"deployment");
  writeFileSync(c.deployment,'#!/bin/sh\ncase "$1" in\nread) cat "$0.state";;\ndeploy) echo "$4" > "$0.state";;\nesac\n',{mode:0o700});
  writeFileSync(c.deployment+".state",base);
  const env = makeEnv(root,(_kind,h,_tests,o)=>has(o,h,"first") && has(o,h,"second") ? pass() : fail());
  const dry = await operate({...c,mode:"dry"},{},env); assert.deepEqual(dry.proposed,[1,2]);
  assert.equal(revision(root),base); assert.equal(readFileSync(c.deployment+".state","utf8"),base);
  const r = await operate(c,{},env); assert.deepEqual(r.incidents,[]);
  assert.deepEqual(r.integrated,[1,2]); assert.equal(r.branchReadback,revision(root)); assert.equal(r.treeReadback,r.tree);
  assert.equal(r.candidate,r.deployed); assert.equal(git(join(root,"remote.git"),"merge-base",p,r.candidate!),p);
  assert.equal(git(join(root,"remote.git"),"merge-base",q,r.candidate!),q);
});

test("reproducible failing PR and dependant leave C1; a red C1 and exhausted retry budget both hold", async t => {
  for (const mode of ["pass","red","exhausted"]) {
    const {root,c,base} = setup(t); add(root,1,"good"); add(root,2,"bad"); add(root,3,"dependent"); c.dependencies={"3":[2]};
    let full = 0;
    const r = await operate(c,{},makeEnv(root,(kind,h,_tests,o)=>{
      if (kind === "full") { full++; if (mode === "exhausted" && full === 1) return {result:"infra"};
        if (mode === "red" && full === 2) return fail(); }
      return has(o,h,"bad") ? fail() : pass();
    }));
    assert.equal(full,2); assert.deepEqual(r.excluded.map(e=>[e.pr,e.cause]),[[2,"test"],[3,"dependency"]]);
    if (mode === "pass") { assert.deepEqual(r.integrated,[1]); assert.equal(r.candidate,r.c1); }
    else { assert.equal(revision(root),base); assert.match(r.incidents.join(),/Final candidate failed|budget exhausted/); }
  }
});

test("two individually green PRs that fail together return the later PR after targeted reproduction", async t => {
  const {root,c} = setup(t); add(root,1,"left"); add(root,2,"right");
  const r = await operate(c,{},makeEnv(root,(_kind,h,_tests,o)=>has(o,h,"left") && has(o,h,"right") ? fail() : pass()));
  assert.deepEqual(r.integrated,[1]); assert.equal(r.excluded[0].cause,"interaction");
  assert.deepEqual(r.attempts.filter(a=>a.kind==="full").map(a=>a.sha),[r.c0,r.c1]);
});

test("a flaky same-candidate rerun records its owner, recurrence on a later train blocks", async t => {
  const {root,c} = setup(t); add(root,1,"flaky"); const env = makeEnv(root,(kind)=>kind==="full"?fail():pass());
  const first = await operate(c,{},env); assert.deepEqual(first.integrated,[1]);
  assert.deepEqual(first.flakes,[{test:"affected",owner:"test owner",blocking:false}]);
  assert.equal(first.attempts[0].sha,first.attempts[1].sha); add(root,2,"recurrence");
  const again = await operate(c,{},env); assert.deepEqual(again.integrated,[]); assert.equal(again.flakes[0].blocking,true);
  assert.equal(revision(root),first.candidate);
});

test("merge conflicts exclude the PR and dependant; changed heads, lost checks and a racing ancestor base reject publication", async t => {
  {
    const {root,c}=setup(t); add(root,1,"base","left"); add(root,2,"child"); c.dependencies={"2":[1]};
    const other=add(root,3,"base","right"); git(join(root,"remote.git"),"update-ref","refs/heads/main",other);
    const r=await operate(c,{},makeEnv(root,pass)); assert.deepEqual(r.excluded.map(x=>x.cause),["conflict","dependency"]);
    assert.equal(r.attempts.length,0); assert.equal(revision(root),other);
  }
  for(const which of ["head","lease","gate"]) {
    const {root,c,base}=setup(t); const head=add(root,1,"change"); let ok = true;
    const r=await operate(c,{},makeEnv(root,()=>{
      if(which==="head") add(root,1,"changed"); if(which==="gate") ok=false; return pass();
    },{permit:()=>ok,publish:(o,b,h)=>{
      if(which==="lease") git(join(root,"remote.git"),"update-ref","refs/heads/main",head,base);
      Objects.prototype.publish.call(o,b,h);
    }}));
    assert.deepEqual(r.integrated,[]); assert.equal(revision(root),which==="lease"?head:base);
    assert.match(r.incidents.join(),/admission rejected|push failed/);
  }
});

test("infrastructure retry is bounded, empty queue allocates no environment", async t => {
  const {root,c,base} = setup(t); let cleanup=0;
  const env=makeEnv(root,()=>({result:"infra"}),{cleanup:()=>cleanup++});
  const empty=await operate(c,{},env); assert.deepEqual(empty.incidents,[]); assert.equal(cleanup,0);
  assert.equal(readdirSync(c.stateDir).some(p=>p.startsWith("work-")),false);
  add(root,1,"change"); const r=await operate(c,{},env); assert.equal(r.attempts.length,2);
  assert.match(r.incidents.join(),/Environment action/); assert.equal(revision(root),base);
  c.timeoutSeconds=1; c.mergeGate=join(root,"slow-gate"); c.mergeGateLock=join(root,"train.json");
  writeFileSync(c.mergeGate,"#!/bin/sh\nexec sleep 8\n",{mode:0o700});
  const expired=await operate(c,{},env);
  assert.equal(expired.result,"interrupted"); assert.match(expired.incidents.join(),/Train timeout/);
  assert.equal(revision(root),base);
});

test("SIGKILL during verification and after push releases the lock, reaps owned state and catches up deployment without republishing", async t => {
  for(const boundary of ["suite","after-push"]) {
    const {root,c,base}=setup(t); add(root,1,"change");
    c.deployment=join(root,"deployment"); writeFileSync(c.deployment,'#!/bin/sh\ncase "$1" in\nread) cat "$0.state";;\ndeploy) echo "$4" > "$0.state";;\nesac\n',{mode:0o700});
    writeFileSync(c.deployment+".state",base); writeFileSync(join(root,"train.json"),JSON.stringify(c));
    const killed=spawnSync(process.execPath,[fileURLToPath(new URL("./train-runtime-fixture.ts",import.meta.url)),"--crash-worker",root,boundary],{encoding:"utf8"});
    assert.equal(killed.signal,"SIGKILL",killed.stderr); const before=revision(root);
    assert.equal(readFileSync(c.deployment+".state","utf8"),base);
    assert.ok(readdirSync(c.stateDir).some(p=>p.startsWith("work-")));
    const r=await operate(c,{},makeEnv(root,pass)); assert.deepEqual(r.incidents,[]);
    assert.match(r.recovery.join(),/Cleaned run-owned/); assert.equal(readdirSync(c.stateDir).some(p=>p.startsWith("work-")),false);
    assert.equal(readFileSync(c.deployment+".state","utf8").trim(),revision(root));
    if(boundary==="after-push") { assert.equal(revision(root),before); assert.equal(r.attempts.length,0); assert.match(r.recovery.join(),/Verified previous merge/); }
    else assert.deepEqual(r.integrated,[1]);
  }
});

test("overlap immediately skips urgent and documentation trains; documentation uses fresh gates and the shared writer",async t=>{
  const {root,c,base}=setup(t); add(root,1,"docs/guide"); const {lock}=await mod("state");
  const bin=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  const clock=join(root,"admission-clock.mjs"), profile=join(root,"scheduled.json");
  writeFileSync(clock,'import {mock} from "node:test"; mock.timers.enable({apis:["Date"], now:Date.parse("2026-11-20T04:00:00Z")});');
  writeFileSync(profile,JSON.stringify({...c,schedule:{hoursUtc:[3,4,5],graceMinutes:10}}),{mode:0o600});
  const scheduled=(...args:string[])=>spawnSync(process.execPath,["--import",clock,bin,"run",profile,...args],{encoding:"utf8"});
  // A dispatch for 03:00 arrives just as another valid slot opens. Neither
  // a delayed delivery nor a caller-supplied future hour may claim 04:00.
  for (const slot of ["2026-11-20T03:00:00Z","2026-11-20T05:00:00Z","2026-11-20T04:00:00.000Z",""]) {
    const declined=scheduled("--scheduled","--slot",slot);
    assert.equal(declined.status,2); assert.match(declined.stderr,/Requested slot must match/);
  }
  assert.equal(scheduled("--slot","2026-11-20T04:00:00Z").status,2);
  assert.deepEqual(readdirSync(c.stateDir),[]);
  const release=lock(join(c.stateDir,"train.lock"));
  const env=makeEnv(root,pass);
  try {
    for (const args of [["--scheduled","--slot","2026-11-20T04:00:00Z"],["--scheduled"]]) {
      const current=scheduled(...args);
      assert.equal(current.status,0,current.stderr);
      const receipt=JSON.parse(current.stdout);
      assert.equal(receipt.slot,"2026-11-20T04:00:00.000Z"); assert.equal(receipt.result,"skipped");
    }
    assert.equal((await operate(c,{pr:1},env)).result,"skipped");
    assert.equal((await operate(c,{pr:1,docs:true},env)).result,"skipped");
    const cli=spawnSync(process.execPath,[bin,"run",join(root,"train.json"),"--pr","1","--docs"],{encoding:"utf8"});
    assert.equal(cli.status,0,cli.stderr); assert.equal(JSON.parse(cli.stdout).result,"skipped"); assert.equal(revision(root),base);
  } finally {release();}
  const r=await operate(c,{pr:1,docs:true},env); assert.deepEqual(r.integrated,[1]); assert.equal(r.attempts[0].kind,"docs");
});

test("a requested solo hold is checked again on the final admitted head",async t=>{
  const {root,c,base}=setup(t); add(root,1,"docs/guide"); c.mergeGate=join(root,"authority"); c.mergeGateLock=join(root,"train.json");
  writeFileSync(c.mergeGate,'#!/bin/sh\ntest ! -f "$0.hold"\n',{mode:0o700});
  const r=await operate(c,{},makeEnv(root,()=>{writeFileSync(c.mergeGate+".hold","hold");return pass();}));
  assert.deepEqual(r.integrated,[]); assert.match(r.incidents.join(),/Final admission/); assert.equal(revision(root),base);
});

test("admission verifies check publisher, exact head and newest attempt; writer bypass must be the sole actor and immutable sources fully locked",async t=>{
  const {c}=setup(t); const {GitHub}=await mod("github"); const gh=new GitHub(c,"unused",Date.now()+10000);
  const head="a".repeat(40);
  const pull={number:1,head,ref:"ready/1",open:true,merged:false,draft:false,target:"main",sameRepo:true,labels:[]};
  const check={id:1,head_sha:head,name:"audited",status:"completed",conclusion:"success",app:{id:124}};
  let checks=[check];
  let actors=[{actor_type:"Integration",actor_id:123,bypass_mode:"always"}];
  const rule=(type:string,id:number)=>({type,ruleset_id:id,ruleset_source_type:"Repository",ruleset_source:c.repository});
  gh.pages=(path:string)=>path.includes("check-runs")?checks:[rule("update",1),rule("deletion",2),rule("non_fast_forward",2)];
  gh.api=(path:string)=>path.endsWith("rulesets/1")?{enforcement:"active",bypass_actors:actors}:{enforcement:"active",bypass_actors:[]};
  assert.equal(gh.gates(pull,c.checks),true);
  assert.equal(gh.gates({...pull,sameRepo:false},c.checks),false); gh.verifyWriter();
  assert.throws(()=>gh.verifyImmutable("ready/1"),/immutable/);
  actors.push({...actors[0],actor_id:999}); assert.throws(()=>gh.verifyWriter(),/branch rule/);
  actors=[]; gh.verifyImmutable("ready/1");
  checks=[{...check,head_sha:"b".repeat(40)},{...check,app:{id:999}}];
  assert.equal(gh.gates(pull,c.checks),false);
  checks=[check,{...check,id:2,status:"in_progress"}]; assert.equal(gh.gates(pull,c.checks),false);
  const workflow={id:81,path:".github/workflows/check.yml",blob:"c".repeat(40)};
  let observedBlob=workflow.blob;
  const actionCheck={...check,app:{id:15368},check_suite:{id:82}};
  const run={id:73,workflow_id:81,path:workflow.path,head_sha:head,head_branch:pull.ref,event:"push",check_suite_id:82,
    status:"completed",conclusion:"success",head_repository:{full_name:c.repository}};
  gh.api=()=>({type:"file",sha:observedBlob});
  const job={run_id:run.id,head_sha:head,status:"completed",conclusion:"success",name:check.name,
    check_run_url:"https://api.github.com/repos/"+c.repository+"/check-runs/"+check.id};
  gh.pages=(path:string)=>path.includes("/jobs?")?[job]:path.includes("check-runs")?[actionCheck]:[run];
  const native=[{name:"audited",appId:15368,workflow}];
  assert.equal(gh.gates(pull,native),true);
  observedBlob="e".repeat(40); assert.equal(gh.gates(pull,native),false); observedBlob=workflow.blob;
  const realJob=job.check_run_url; job.check_run_url+="-wrong"; assert.equal(gh.gates(pull,native),false); job.check_run_url=realJob;
  run.event="workflow_dispatch"; assert.equal(gh.gates(pull,native),false);
  assert.equal(gh.gates(pull,[{...native[0],workflow:{...workflow,event:"workflow_dispatch"}}]),true);
  run.event="push";
  run.check_suite_id=111; assert.equal(gh.gates(pull,native),false);
  const set={id:1,target:"branch",source:c.repository,source_type:"Repository",enforcement:"active",
    updated_at:"2026-11-20T12:30:33.123Z",conditions:{ref_name:{include:["refs/heads/main"],exclude:[]}},rules:[{type:"update"}]};
  const captured={...set,bypass_actors:[{actor_type:"Integration",actor_id:123,bypass_mode:"always"}]};
  c.ruleEvidence=join(c.stateDir,"operator.json");
  writeFileSync(c.ruleEvidence,JSON.stringify({repository:c.repository,repositoryId:323,byBranch:{main:[captured]}}));
  gh.api=()=>({full_name:c.repository,id:323});
  assert.deepEqual(gh.actors("main",rule("update",1),set),captured.bypass_actors);
  assert.equal(gh.actors("other",rule("update",1),set),undefined);
  assert.equal(gh.actors("main",rule("update",1),{...set,updated_at:"2026-11-20T12:30:33.124Z"}),undefined);
  const pattern={...captured,conditions:{ref_name:{include:["refs/heads/ready/*"],exclude:[]}},bypass_actors:[]};
  writeFileSync(c.ruleEvidence,JSON.stringify({repository:c.repository,repositoryId:323,rulesets:[pattern]}));
  const live={...pattern,bypass_actors:undefined};
  assert.deepEqual(gh.actors("ready/new",rule("update",1),live),[]);
  assert.equal(gh.actors("ready/new",rule("update",1),{...live,conditions:set.conditions}),undefined);
});

test("receipts produce bounded train observations, operator report and idempotent journal replay",async t=>{
  const {root,c}=setup(t); add(root,1,"change");
  const path=join(root,"metrics.json");
  writeFileSync(path,JSON.stringify({project_id:"fixture",project_root:join(root,"author"),journal:"journal.jsonl",
    identity_key:"ae".repeat(32),issued_ids:["pilot"],sources:{train:{kind:"normalized",task_id:"pilot"}}}),{mode:0o600});
  c.metrics={profile:path,source:"train",task:"pilot"}; writeFileSync(join(root,"train.json"),JSON.stringify(c));
  const r=await operate(c,{},makeEnv(root,pass)); assert.deepEqual(r.incidents,[]);
  const bin=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  const cli=(...args:string[])=>execFileSync(process.execPath,[bin,...args],{encoding:"utf8"});
  const bytes=readFileSync(join(root,"journal.jsonl"),"utf8"); const e=JSON.parse(bytes);
  assert.equal(e.event_type,"train.observed"); assert.equal(e.data.full_suite_runs,1);
  assert.equal(e.data.queue_entries,1); assert.equal(e.data.flaky_tests,0); assert.equal(e.data.excluded_test,0);
  assert.ok(!bytes.includes(r.candidate!)); cli("observations",join(root,"train.json"));
  assert.equal(readFileSync(join(root,"journal.jsonl"),"utf8"),bytes);
  const window=JSON.parse(cli("report",join(root,"train.json"),r.started,r.ended!));
  assert.deepEqual(window.runs[0].integrated,[1]); assert.deepEqual(window.remainingQueue,[]);
});

test("serializes owner batches and both PR gates with publication, ordinary Git updates and process death",async t=>{
  for (const order of ["owner-first","train-first","ordinary","crash"]) {
    const {root,c,base}=setup(t);
    const first=add(root,1,"first"), second=add(root,2,"second");
    const owner=soloOwner(t), profile=owner.profile;
    const solo=process.env.METHODOLOGY_SOLO_BIN ?? fileURLToPath(new URL("../dist/solo.js",import.meta.url));
    const cfg={repository:c.repository,branch:c.branch,pending_limit:3,ledger:join(root,"decisions.sqlite"),
      classes:{established_ui:{allow_merge:true}}};
    owner.setup(cfg);
    const invoke=(op:string,args:string[]=[],input?:unknown)=>spawnSync(process.execPath,[solo,op,profile,...args],{
      encoding:"utf8", input:input===undefined?undefined:JSON.stringify(input),
    });
    const check=(op:string,args:string[]=[],input?:unknown)=>{
      const r=invoke(op,args,input); assert.equal(r.status,0,r.stderr); return JSON.parse(r.stdout);
    };
    check("install-batch");
    const decision={id:"D1",task:"T1",decision_class:"established_ui",scope:"certain",exclusions:[],
      choice:"A",basis:"Existing layout",alternatives:"B",reversal_cost:"One view",dependent_work:"PR 1",impact:"UI",next_action:"implement"};
    const row=check("propose",[],decision);
    check("bind",["T1","1",first]); check("bind",["T2","2",second]);
    const reversal=[{id:"D1",digest:row.digest,status:"changed",at:new Date().toISOString(),owner_source:"Owner record",
      document:"UI decision",choice:"B",rework:"T3",superseded_head:first}];
    const args1=[c.repository,c.branch,"1",first];
    const args2=[c.repository,c.branch,"2",second];
    // Node's test runner may use an uninstalled, non-executable dist/solo.js.
    // The test wrapper forwards to the same installed source selected by the packed gate.
    const adapter=join(root,"gate");
    writeFileSync(adapter,'#!/bin/sh\nexec "$1" "$2" gate "$3" "$4" "$5" "$6" "$7"\n',{mode:0o700});
    c.mergeGate=[adapter,process.execPath,solo,profile]; c.mergeGateLock=profile;

    if(order==="owner-first") {
      const r=await operate(c,{},makeEnv(root,()=>{
        owner.save(reversal);check("install-batch");return pass();
      }));
      assert.deepEqual(r.integrated,[]); assert.match(r.incidents.join(),/admission rejected PR #1/);
      assert.equal(revision(root),base); assert.equal(invoke("gate",args1).status,1);
    } else if(order==="train-first") {
      let seen=0;
      const env=makeEnv(root,pass,{permit:p=>{
        if(p.number===2 && ++seen===2) {
          owner.save(reversal);
          assert.equal(invoke("install-batch").status,75);
          assert.equal(invoke("propose",[],{...decision,id:"NEW"}).status,75);
          assert.equal(invoke("bind",["T1","1",first]).status,75);
          check("gate",args1);check("gate",args2);
        }
        return true;
      },publish:(o,b,h)=>{
        assert.equal(invoke("install-batch").status,75);
        Objects.prototype.publish.call(o,b,h);
      }});
      const r=await operate(c,{},env);
      assert.deepEqual(r.incidents,[]); assert.equal(seen,2); assert.deepEqual(r.integrated,[1,2]);
      assert.equal(revision(root),r.candidate);check("install-batch");assert.equal(invoke("gate",args1).status,1);
    } else if(order==="ordinary") {
      owner.save(reversal); // Owner prepared a batch; it is not installed yet.
      const cmd='set -eu\n"$1" "$2" gate "$3" "$4" "$5" 1 "$6"\n' +
        'if "$1" "$2" install-batch "$3"; then exit 19; else test "$?" = 75; fi\n' +
        'git -C "$7" merge-base --is-ancestor "$8" "$6"\n' +
        'exec git -C "$7" push "--force-with-lease=refs/heads/main:$8" "$9" "$6:refs/heads/main"';
      const merge=()=>spawnSync("flock",["--shared","--nonblock","--conflict-exit-code","75","--no-fork",profile,
        "sh","-c",cmd,"ordinary",process.execPath,solo,profile,c.repository,c.branch,first,
        join(root,"author"),base,join(root,"remote.git")],{encoding:"utf8"});
      const allowed=merge();assert.equal(allowed.status,0,allowed.stderr);assert.equal(revision(root),first);
      check("install-batch");assert.equal(merge().status,1);
    } else {
      owner.save(reversal);
      writeFileSync(join(root,"train.json"),JSON.stringify(c));
      const tools=join(root,"bin");mkdirSync(tools);
      const realGit=execFileSync("which",["git"],{encoding:"utf8"}).trim();
      const entered=join(root,"pushing"), resume=join(root,"continue");
      writeFileSync(join(tools,"git"),`#!/bin/sh
if test "$3" = push; then
  touch "${entered}"
  for n in $(seq 1 200); do test -e "${resume}" && break; sleep 0.05; done
  test -e "${resume}" || exit 78
fi
exec "${realGit}" "$@"`,{mode:0o700});
      const worker=spawn(process.execPath,[fileURLToPath(new URL("./train-runtime-fixture.ts",import.meta.url)),
        "--crash-worker",root,"during-push"],{stdio:"ignore",env:{...process.env,PATH:tools+":"+process.env.PATH}});
      const ended=new Promise(resolve=>worker.once("exit",(_code,signal)=>resolve(signal)));
      async function waitFor(probe:()=>boolean) {
        const until=Date.now()+8000;
        while(!probe() && Date.now()<until) await new Promise(resolve=>setTimeout(resolve,25));
        assert.ok(probe(),"worker boundary was not reached");
      }
      try {
        await waitFor(()=>existsSync(entered));
        assert.equal(worker.kill("SIGKILL"),true);assert.equal(await ended,"SIGKILL");
        // The orphaned Git invocation still owns both file descriptors.
        assert.equal(revision(root),base);assert.equal(invoke("install-batch").status,75);
        writeFileSync(resume,"continue");
        await waitFor(()=>revision(root)!==base);
        await waitFor(()=>invoke("install-batch").status===0);
      } finally {writeFileSync(resume,"continue");worker.kill("SIGKILL");}
      check("install-batch");assert.equal(invoke("gate",args1).status,1);
    }
  }
});

test("the installed admission and results exporter read the independent review and required exact-head runs", t => {
  const {root,c} = setup(t), author = join(root,"author"), fake = join(root,"cli");
  mkdirSync(fake);
  const bin = process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  const baseline = process.env.METHODOLOGY_BASELINE_BIN ?? fileURLToPath(new URL("../dist/baseline.js",import.meta.url));
  const source = revision(root);
  writeFileSync(join(author,"manifest.json"),execFileSync(process.execPath,[baseline,"freeze","--source",source,"--protect","base"],{cwd:author}));
  git(author,"add","manifest.json"); git(author,"commit","-m","accepted baseline");
  git(author,"push",join(root,"remote.git"),"HEAD:main");
  const baselineCommit = revision(root), head = add(root,1,"feature");
  const ref = "ready/task-7-"+head;
  const policy = {repository:c.repository,branch:c.branch,reviewerId:81,
    required:[{id:"fast",name:"Fast",appId:234,minimum:80}], baseline:{commit:baselineCommit,manifest:"manifest.json"}};
  const policyPath=join(root,"policy.json"), data=join(fake,"provider.json");
  writeFileSync(policyPath,JSON.stringify(policy),{mode:0o600});
  const pr={number:1,head:{sha:head,ref,repo:{full_name:c.repository}},base:{ref:c.branch},user:{id:73},labels:[],state:"open",draft:false};
  const review={user:{id:81},state:"APPROVED",commit_id:head,body:"Methodology audit: PASS"};
  const check={id:5,name:"Fast",app:{id:234},head_sha:head,status:"completed",conclusion:"success",output:{summary:'{"threshold":85,"measured":90}'}};
  const state={pr,reviews:[review],checks:[check]};
  writeFileSync(join(fake,"gh"),`#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),s=JSON.parse(fs.readFileSync(path.join(__dirname,"provider.json")));
const route=process.argv.at(-1);
if(route.includes("/check-runs?"))console.log(JSON.stringify({check_runs:s.checks}));
else if(route.includes("/reviews?"))console.log(JSON.stringify(s.reviews));
else if(route.endsWith("/pulls/1"))console.log(JSON.stringify(s.pr)); else process.exit(1);
`,{mode:0o700});
  function run(op="admission",sha=pr.head.sha,branch=pr.head.ref) {
    writeFileSync(data,JSON.stringify(state));
    return spawnSync(process.execPath,[bin,op,policyPath,"1",sha,branch],{cwd:author,encoding:"utf8",
      env:{PATH:fake+":"+process.env.PATH, GH_TOKEN:"read-only-contract-fixture"}});
  }
  assert.equal(run().status,0);
  assert.deepEqual(JSON.parse(run("export-checks").stdout).results,[{id:"fast",candidate:head,status:"completed",exitCode:0,threshold:85,measured:90}]);
  for (const other of [{...review,commit_id:source},{...review,state:"DISMISSED"},{...review,body:"ok"},
    {...review,user:{id:73}},{...review,state:"CHANGES_REQUESTED"}]) {
    state.reviews = [other]; assert.match(run().stderr,/independent audit/);
  }
  state.reviews=[review]; pr.user.id=81; assert.notEqual(run().status,0); pr.user.id=73;
  assert.notEqual(run("admission",source).status,0); assert.notEqual(run("admission",head,"edit/task").status,0);
  for (const extra of [{...check,app:{id:999}},{...check,head_sha:source},{...check,conclusion:"skipped"},
    {...check,output:{summary:'{"threshold":10,"measured":10}'}},{...check,output:{summary:"unavailable"}}]) {
    state.checks=[extra]; assert.notEqual(run().status,0); assert.equal(JSON.parse(run("export-checks").stdout).results[0].exitCode,1);
  }
  state.checks=[check,{...check,id:6,status:"in_progress"}]; assert.notEqual(run().status,0);
  state.checks=[check]; const changed = add(root,2,"base","changed");
  pr.head.sha=review.commit_id=check.head_sha=changed; pr.head.ref="ready/task-7-"+changed;
  assert.match(run().stderr,/Changed protected content/);
});

test("the host refreshes the scoped writer credential after two forty-minute suites",async t=>{
  const {root,c}=setup(t), key=join(root,"test-key"), cli=join(root,"cli"), minted=join(cli,"minted");
  const {generateKeyPairSync}=await import("node:crypto");
  const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
  writeFileSync(key,privateKey.export({format:"pem",type:"pkcs8"}),{mode:0o600}); mkdirSync(cli);
  writeFileSync(join(cli,"curl"),`#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),file=path.join(__dirname,"minted");
const claims=JSON.parse(Buffer.from(fs.readFileSync(0,"utf8").split(".")[1],"base64url"));
const serial=fs.existsSync(file)?1+JSON.parse(fs.readFileSync(file)).serial:1;
fs.writeFileSync(file,JSON.stringify({serial,body:JSON.parse(process.argv[process.argv.indexOf("--data-binary")+1]),iss:claims.iss}));
console.log(JSON.stringify({expires_at:new Date((claims.iat+60+3600)*1000).toISOString(),token:"test-installation-"+serial}));
`,{mode:0o700});
  const previous={path:process.env.PATH,key:process.env.TRAIN_APP_KEY_FILE,id:process.env.TRAIN_INSTALLATION_ID};
  const restore=(k:string,v:string|undefined)=>{if(v===undefined)delete process.env[k];else process.env[k]=v;};
  t.after(()=>{restore("PATH",previous.path);restore("TRAIN_APP_KEY_FILE",previous.key);restore("TRAIN_INSTALLATION_ID",previous.id);});
  process.env.PATH=cli+":"+previous.path;process.env.TRAIN_APP_KEY_FILE=key;process.env.TRAIN_INSTALLATION_ID="321";
  const {writerCredential}=await mod("credential");
  const start=Date.now();
  t.mock.timers.enable({apis:["Date"],now:start});
  c.timeoutSeconds=9000;
  const token=writerCredential(c,start+c.timeoutSeconds*1000);
  assert.equal(token(),"test-installation-1");
  add(root,1,"good"); add(root,2,"bad");
  const calls=join(cli,"git-calls"),realGit=execFileSync("which",["git"],{encoding:"utf8"}).trim();
  writeFileSync(join(cli,"git"),`#!/usr/bin/env node
const fs=require("node:fs"),path=require("node:path"),args=process.argv.slice(2);
const op=args[2],auth=process.env.GIT_CONFIG_VALUE_0;
if(["push","fetch"].includes(op) && auth){
  const supplied=Buffer.from(auth.slice("Authorization: Basic ".length),"base64").toString().split(":")[1];
  const clock=Number(fs.readFileSync(path.join(__dirname,"clock")));
  const serial=Number(supplied.split("-").pop());
  if(clock>=${start}+3600000 && serial<2)process.exit(1);
  fs.appendFileSync(path.join(__dirname,"git-calls"),op+" "+serial+"\\n");
}
process.exit(require("node:child_process").spawnSync(${JSON.stringify(realGit)},args,{stdio:"inherit"}).status);
`,{mode:0o700});
  const clock=join(cli,"clock");writeFileSync(clock,String(start));
  const env=makeEnv(root,(kind,sha,_tests,o)=>{
    if(kind==="full"){
      t.mock.timers.tick(40*60000);writeFileSync(clock,String(Date.now()));
    }
    return has(o,sha,"bad")?fail():pass();
  });
  env.objects=(dir,cfg,d)=>new Objects(dir,join(root,"remote.git"),cfg.branch,d,token);
  const completed=await operate(c,{},env);
  assert.deepEqual(completed.incidents,[]);
  assert.equal(completed.attempts.filter(a=>a.kind==="full").length,2);
  assert.deepEqual(completed.integrated,[1]);
  assert.match(readFileSync(calls,"utf8"),/^fetch 1$/m);
  assert.match(readFileSync(calls,"utf8"),/^push 2$/m);
  assert.deepEqual(JSON.parse(readFileSync(minted,"utf8")),{serial:2,iss:c.writerAppId,
    body:{repositories:["disposable"],permissions:{contents:"write",pull_requests:"write",checks:"read"}}});
  t.mock.timers.tick(58*60000); assert.equal(token(),"test-installation-3");
});

test("a returned submission re-enters on its corrected immutable head and preserves the task exclusion limit",async t=>{
  const {root,c}=setup(t); add(root,1,"bad"); add(root,2,"ok");
  const {submissionTask}=await mod("github");
  const env=makeEnv(root,(_kind,h,_tests,o)=>has(o,h,"bad")?fail():pass());
  const old=env.host;
  env.host=(cfg,deadline)=>{
    const original=old(cfg,deadline);
    const ref=(p:ReturnType<typeof original.get>)=>({...p,ref:"ready/"+(p.number===2?"other":"stable-task")+"-"+p.head});
    return {...original,get:n=>ref(original.get(n)),list:()=>original.list().map(ref)};
  };
  const initial=await operate(c,{},env);
  assert.deepEqual(initial.integrated,[2]); assert.equal(initial.excluded[0].task,"stable-task");
  writeFileSync(join(root,"pulls.json"),"[]"); add(root,3,"bad","still broken");
  const again=await operate(c,{},env);
  assert.match(again.decisions.join(),/repeated exclusion/);
  writeFileSync(join(root,"pulls.json"),"[]"); const corrected=add(root,4,"ok","corrected");
  const held=await operate(c,{},env);
  assert.equal(held.attempts.length,0); assert.match(held.decisions.join(),/disposition/);
  c.disposition={"stable-task":again.id};
  const admitted=await operate(c,{},env); assert.deepEqual(admitted.integrated,[4]);
  assert.equal(submissionTask({ref:"ready/stable-task-"+corrected,head:corrected}),"stable-task");
  assert.equal(submissionTask({ref:"ready/stable-task-"+corrected,head:initial.excluded[0].head}),undefined);
});

test("independent submission identity is checked before admission work",async t=>{
  const {root,c,base}=setup(t);
  const head=add(root,1,"feature"), ref="ready/feature-"+head;
  const policy={repository:c.repository,branch:c.branch,submitterId:73,reviewerId:81,required:[{name:"Fast",appId:234,id:"fast"}]};
  const path=join(root,"admission.json"), binDir=join(root,"fake-gh"), log=join(root,"calls");
  mkdirSync(binDir);
  const pr={number:1,head:{sha:head,ref,repo:{full_name:c.repository}},base:{ref:c.branch},user:{id:73},labels:[],state:"open",draft:false};
  const data=join(root,"provider.json");
  writeFileSync(join(binDir,"gh"),`#!/bin/sh
echo "$*" >> "${log}"
case "$*" in *"/pulls/1") cat "${data}" ;; *) exit 99 ;; esac
`,{mode:0o700});
  const exe=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  function run(op:string) {
    writeFileSync(path,JSON.stringify(policy),{mode:0o600}); writeFileSync(data,JSON.stringify(pr)); writeFileSync(log,"");
    return spawnSync(process.execPath,[exe,op,path,"1",head,ref],{encoding:"utf8",
      env:{PATH:binDir+":"+process.env.PATH, GH_TOKEN:"read-only-fixture"}});
  }
  const ok=run("identity"); assert.equal(ok.status,0,ok.stderr);
  assert.deepEqual(JSON.parse(ok.stdout),{pr:1,head,authorId:73,reviewerId:81});
  for (const [author,reason] of [[81,/share GitHub ID 81/],[77,/differs from the configured submitter/]] as const) {
    pr.user.id=author;
    assert.match(run("admission").stderr,reason); assert.equal(readFileSync(log,"utf8").trim().split("\n").length,1);
  }
  policy.submitterId=81;
  assert.match(run("identity").stderr,/submission identity must differ/); assert.equal(readFileSync(log,"utf8"),"");
  policy.submitterId=73; c.admission=policy;
  const env=makeEnv(root,pass); const host=env.host;
  env.host=(cfg,d)=>{
    const original=host(cfg,d);
    return {...original,list:()=>original.list().map(p=>({...p,ref,authorId:81})),
      gates:()=>{throw new Error("unexpected check lookup");}};
  };
  env.objects=()=>{throw new Error("unexpected git fetch");};
  const receipt=await operate(c,{},env);
  assert.deepEqual(receipt.incidents,[]); assert.match(receipt.excluded[0].reason,/share GitHub ID 81/);
  assert.deepEqual(receipt.attempts,[]); assert.equal(revision(root),base);
});

test("stable task dependencies follow corrected submissions and reject ambiguous or missing prerequisites",async t=>{
  const {root,c,base}=setup(t);
  c.taskDependencies={child:["parent"],later:["parent"]};
  add(root,1,"child"); add(root,2,"broken");
  const names:Record<number,string>={1:"child",2:"parent",3:"parent",4:"later"};
  const closed=new Set<number>();
  const env=makeEnv(root,(_kind,h,_tests,o)=>has(o,h,"broken")?fail():pass());
  const host=env.host;
  env.host=(cfg,d)=>{
    const original=host(cfg,d);
    const ref=(p:ReturnType<typeof original.get>)=>({...p,ref:"ready/"+names[p.number]+"-"+p.head,open:p.open&&!closed.has(p.number)});
    return {...original,get:n=>ref(original.get(n)),list:state=>original.list("all").map(ref).filter(p=>p.open||state==="all")};
  };
  const failed=await operate(c,{},env); assert.deepEqual(failed.selected,[2,1]);
  assert.deepEqual(failed.excluded.map(x=>[x.pr,x.cause]),[[2,"test"],[1,"dependency"]]);
  add(root,3,"corrected");
  const ambiguous=await operate(c,{},env);
  assert.match(ambiguous.excluded.find(x=>x.pr===1)!.reason,/Ambiguous prerequisite task parent/);
  assert.deepEqual(ambiguous.attempts,[]);
  closed.add(2); closed.add(3);
  const missing=await operate(c,{},env); assert.match(missing.excluded[0].reason,/Missing prerequisite task parent/);
  assert.equal(revision(root),base);
  closed.delete(3);
  const fixed=await operate(c,{},env); assert.deepEqual(fixed.integrated,[3,1]);
  add(root,4,"late-child");
  const after=await operate(c,{},env); assert.deepEqual(after.integrated,[4]); assert.deepEqual(after.incidents,[]);
});

test("the trusted App publishes the independent exact-head verdict and holds unconfirmed protected changes",t=>{
  const {root,c,base}=setup(t), dir=join(root,"orchestrator"), fake=join(root,"fake-gh"), author=join(root,"author");
  mkdirSync(dir,{mode:0o700}); mkdirSync(fake);
  const head=add(root,1,"ci.yml"), ref="ready/ci-"+head;
  const policy={repository:c.repository,branch:c.branch,submitterId:73,reviewerId:81,reviewControls:{paths:["ci.yml"]},
    required:[{name:"Fast",appId:234,id:"fast"}]};
  const path=join(dir,"policy.json"), record=join(dir,"review.json");
  writeFileSync(path,JSON.stringify(policy),{mode:0o600});
  const pr={number:1,head:{sha:head,ref,repo:{full_name:c.repository}},base:{ref:c.branch,sha:base},user:{id:73},labels:[],state:"open",draft:false};
  const v={repository:c.repository,branch:c.branch,pr:1,base,head,ref,reviewer:"review-session-1",evidence:"review-record-1",verdict:"PASS"};
  const db=join(fake,"state.json");
  writeFileSync(db,JSON.stringify({pr,viewer:81,reviews:[],posts:0}));
  writeFileSync(join(fake,"gh"),`#!/usr/bin/env node
const fs=require("node:fs"), db=require("node:path").join(__dirname,"state.json"), s=JSON.parse(fs.readFileSync(db));
const method=process.argv.indexOf("-X"), route=process.argv[method+2];
let data;
if(route.includes("/installation/repositories"))data={total_count:1,repositories:[{full_name:s.pr.head.repo.full_name}]};
else if(route==="graphql")data={data:{viewer:{databaseId:s.viewer}}};
else if(route.endsWith("/pulls/1"))data=s.pr;
else if(route.includes("/reviews?"))data=s.reviews;
else if(route.endsWith("/reviews") && process.argv[method+1]==="POST"){
 const req=JSON.parse(fs.readFileSync(0,"utf8"));
 data={id:++s.posts,user:{id:81},commit_id:req.commit_id,body:req.body,state:req.event==="APPROVE"?"APPROVED":"CHANGES_REQUESTED"};
 s.reviews.push(data);fs.writeFileSync(db,JSON.stringify(s));
} else process.exit(1);
console.log(JSON.stringify(data));
`,{mode:0o700});
  const exe=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  const read=()=>JSON.parse(readFileSync(db,"utf8"));
  function run(...opts:string[]) {
    writeFileSync(record,JSON.stringify(v),{mode:0o600});
    return spawnSync(process.execPath,[exe,"publish-review",path,"1",head,ref,record,...opts],{cwd:author,encoding:"utf8",
      env:{PATH:fake+":"+process.env.PATH, GH_TOKEN:"scoped-review-app-fixture"}});
  }
  v.base="0".repeat(40); assert.match(run().stderr,/exact target, base/); v.base=base;
  assert.notEqual(run().status,0); assert.equal(read().posts,0);
  const confirm=["--owner-message","message-123"];
  writeFileSync(db,JSON.stringify({...read(),viewer:999}));
  assert.match(run(...confirm).stderr,/App identity differs/); assert.equal(read().posts,0);
  writeFileSync(db,JSON.stringify({...read(),viewer:81}));
  const approved=run(...confirm); assert.equal(approved.status,0,approved.stderr);
  assert.deepEqual(JSON.parse(approved.stdout),{pr:1,base,head,authorId:73,reviewerId:81,reviewId:1,state:"APPROVED"});
  assert.match(read().reviews[0].body,/Owner confirmation: message-123/);
  function audit() {
    return spawnSync(process.execPath,[exe,"admission",path,"1",head,ref],{cwd:author,encoding:"utf8",
      env:{PATH:fake+":"+process.env.PATH, GH_TOKEN:"read-only-audit-fixture"}});
  }
  writeFileSync(db,JSON.stringify({...read(),pr:{...pr,base:{...pr.base,sha:"a".repeat(40)}}}));
  assert.match(audit().stderr,/Missing independent audit/);
  const {reviewControls: _protectedPaths, ...ordinaryPolicy}=policy;
  writeFileSync(path,JSON.stringify(ordinaryPolicy));
  assert.match(audit().stderr,/Missing independent audit/);
  writeFileSync(path,JSON.stringify(policy));
  writeFileSync(db,JSON.stringify({...read(),pr}));
  assert.equal(run(...confirm).status,0); assert.equal(read().posts,1);
  v.verdict="FAIL"; v.evidence="review-record-2";
  const failed=run(); assert.equal(failed.status,0,failed.stderr);
  assert.equal(JSON.parse(failed.stdout).state,"CHANGES_REQUESTED"); assert.equal(read().posts,2);
  v.verdict="PASS"; v.evidence="review-record-1";
  assert.match(run(...confirm).stderr,/superseded/);
  assert.match(run("--owner-message","message-124").stderr,/superseded/); assert.equal(read().posts,2);
});

test("an unattended train holds protected changes and their dependants while an independent PR integrates",async t=>{
  const {root,c,base}=setup(t);
  c.maxPrs=1;
  c.taskDependencies={child:["policy"],grandchild:["child"],multi:["policy","second-policy"]};
  c.schedule={hoursUtc:Array.from({length:24},(_,i)=>i),graceMinutes:60};
  const policy={repository:c.repository,branch:c.branch,submitterId:73,reviewerId:81,reviewControls:{paths:["ci"]},
    required:[{name:"Fast",appId:234,id:"fast"}]};
  c.admission=policy;
  const keys=["","grandchild","child","policy","ordinary","confirmed-with-red-CI","second-policy","multi"];
  const heads=[base,add(root,1,"grandchild"),add(root,2,"child"),add(root,3,"ci/policy"),add(root,4,"ordinary"),add(root,5,"ci/other"),add(root,6,"ci/second"),add(root,7,"multi")];
  const {GitHub}=await mod("github") as typeof import("../src/train/github.ts");
  const env=makeEnv(root,pass), host=env.host;
  let confirmed=false, withdraw=false;
  env.host=(cfg,deadline)=>{
    const original=host(cfg,deadline);
    const identify=(p:ReturnType<typeof original.get>)=>({...p,authorId:73,baseSha:revision(root),ref:"ready/"+keys[p.number]+"-"+p.head});
    const gh=new GitHub(cfg,"fixture",deadline);
    gh.decisions=p=>[{id:p.number,user:{id:81},state:"APPROVED",commit_id:p.head,body:
      "Methodology audit: PASS\nReview base: "+p.baseSha+
      (p.number===5 || p.number===3 && confirmed ? "\nOwner confirmation: chat-123":"")}];
    gh.results=(p,required)=>required.map(()=>({candidate:p.head,status:p.number===5?"unverified":"completed",exitCode:p.number===5?1:0}));
    return {...original,get:n=>identify(original.get(n)),list:state=>original.list(state).map(identify),
      audit:gh.audit.bind(gh),gates:gh.gates.bind(gh)};
  };
  const secondHolds=[{pr:6,head:heads[6],paths:["ci"]},{pr:7,head:heads[7],requires:6}];
  const expectedHolds=[{pr:3,head:heads[3],paths:["ci"]},secondHolds[0],{pr:2,head:heads[2],requires:3},
    {pr:7,head:heads[7],requires:3},secondHolds[1],{pr:1,head:heads[1],requires:2}];
  const night=await operate(c,{scheduled:true},env);
  assert.deepEqual(night.incidents,[]); assert.deepEqual(night.decisions,[]); assert.equal(night.result,"completed");
  assert.deepEqual(night.integrated,[4]); assert.deepEqual(night.ownerHolds,expectedHolds);
  const bin=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
  const morning=(end:string)=>JSON.parse(execFileSync(process.execPath,[bin,"report",join(root,"train.json"),night.started,end],{encoding:"utf8"}));
  const report=morning(night.ended!);
  assert.deepEqual(report.ownerHolds,expectedHolds); assert.deepEqual(report.runs[0].integrated,[4]);
  const suite=env.suite;
  env.suite=(...args)=>{if(withdraw) confirmed=false;return suite(...args);};
  confirmed=true; withdraw=true;
  const lost=await operate(c,{},env);
  assert.deepEqual(lost.integrated,[]); assert.match(lost.incidents.join(),/Final admission rejected PR #3/);
  confirmed=true; withdraw=false;
  const retry=await operate(c,{pr:3},env);
  assert.deepEqual(retry.ownerHolds,[]); assert.deepEqual(retry.integrated,[3]);
  assert.deepEqual(morning(retry.ended!).ownerHolds,secondHolds);
});
