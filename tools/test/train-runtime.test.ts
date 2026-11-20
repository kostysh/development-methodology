import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
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
  const release=lock(join(c.stateDir,"train.lock"));
  const env=makeEnv(root,pass);
  try {
    assert.equal((await operate(c,{pr:1},env)).result,"skipped");
    assert.equal((await operate(c,{pr:1,docs:true},env)).result,"skipped");
    const bin=process.env.METHODOLOGY_TRAIN_BIN ?? fileURLToPath(new URL("../dist/train.js",import.meta.url));
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
  const run={workflow_id:81,path:workflow.path,head_sha:head,head_branch:pull.ref,event:"push",check_suite_id:82,
    status:"completed",conclusion:"success",head_repository:{full_name:c.repository}};
  gh.api=()=>({type:"file",sha:observedBlob});
  gh.pages=(path:string)=>path.includes("check-runs")?[actionCheck]:[run];
  const native=[{name:"audited",appId:15368,workflow}];
  assert.equal(gh.gates(pull,native),true);
  observedBlob="e".repeat(40); assert.equal(gh.gates(pull,native),false); observedBlob=workflow.blob;
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
    const profile=join(root,"solo.json"), inbox=join(root,"owner.json");
    const solo=process.env.METHODOLOGY_SOLO_BIN ?? fileURLToPath(new URL("../dist/solo.js",import.meta.url));
    const cfg={repository:c.repository,branch:c.branch,pending_limit:3,approvals:inbox,ledger:join(root,"decisions.sqlite"),
      classes:{established_ui:{allow_merge:true}}};
    writeFileSync(profile,JSON.stringify(cfg),{mode:0o600}); writeFileSync(inbox,"[]",{mode:0o600});
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
        writeFileSync(inbox,JSON.stringify(reversal));check("install-batch");return pass();
      }));
      assert.deepEqual(r.integrated,[]); assert.match(r.incidents.join(),/admission rejected PR #1/);
      assert.equal(revision(root),base); assert.equal(invoke("gate",args1).status,1);
    } else if(order==="train-first") {
      let seen=0;
      const env=makeEnv(root,pass,{permit:p=>{
        if(p.number===2 && ++seen===2) {
          writeFileSync(inbox,JSON.stringify(reversal));
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
      writeFileSync(inbox,JSON.stringify(reversal)); // Owner prepared a batch; it is not installed yet.
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
      writeFileSync(inbox,JSON.stringify(reversal));
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
