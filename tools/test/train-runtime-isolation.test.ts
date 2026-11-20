import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { add, config, fixture, git, makeEnv, mod, operate } from "./train-runtime-fixture.ts";

// The isolated verifier is a static test fixture. It needs no registry or network.
test("the actual OCI verifier sees the exact files without writer credentials, host Git data or writable candidate/authority", async t => {
  const root=fixture(); t.after(()=>rmSync(root,{recursive:true,force:true}));
  const imageDir=join(root,"verifier"); mkdirSync(imageDir);
  writeFileSync(join(imageDir,"verify.c"), `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
int main(int argc, char **argv) {
  FILE *f = fopen("/candidate/content", "r"); char row[100] = {0};
  if (!f || !fgets(row, sizeof row, f) || strcmp(row,"accepted $Id$ bytes\\n") ||
      argc != 3 || strcmp(argv[1],"full") || strlen(argv[2]) != 40 ||
      geteuid() == 0 || getenv("GH_TOKEN") || getenv("GITHUB_TOKEN") ||
      !access("/candidate/.git",F_OK) || !access("/var/run/docker.sock",F_OK) ||
      !access("/candidate/outside-secret",R_OK) || open("/candidate/content",O_WRONLY) != -1) return 2;
  puts("{\\"result\\":\\"pass\\"}"); return 0;
}`);
  execFileSync("cc",["-static","-Os","-s","-o","verify","verify.c"],{cwd:imageDir});
  const tag="methodology-train-isolation-"+root.split("-").at(-1)!.toLowerCase();
  const tar=execFileSync("tar",["-cf","-","verify"],{cwd:imageDir});
  execFileSync("docker",["import","--change",'ENTRYPOINT ["/verify"]',"-",tag],{input:tar});
  t.after(()=>execFileSync("docker",["image","rm",tag],{stdio:"pipe"}));
  const c=config(root);
  c.suiteImage=execFileSync("docker",["image","inspect","--format","{{.Id}}",tag],{encoding:"utf8"}).trim();
  add(root,1,"content","accepted $Id$ bytes");
  const sentinel=join(root,"writer-secret"); writeFileSync(sentinel,"writer only");
  const author=join(root,"author"); symlinkSync(sentinel,join(author,"outside-secret"));
  writeFileSync(join(author,".gitattributes"),"content ident\n");
  git(author,"add",".gitattributes","outside-secret"); git(author,"commit","-m","reference outside candidate");
  git(author,"push",join(root,"remote.git"),"HEAD:refs/pull/1/head");
  const {runSuite}=await mod("suite");
  const env = makeEnv(root,()=>{throw new Error("unreachable");}); env.suite=runSuite;
  const previous = process.env.GH_TOKEN; process.env.GH_TOKEN="disposable-fixture-secret";
  const oldMask=process.umask(0o077);
  try {
    const r=await operate(c,{},env); assert.deepEqual(r.incidents,[]);
    assert.deepEqual(r.integrated,[1]); assert.deepEqual(r.attempts.map(a=>a.result),[{result:"pass"}]);
  } finally { process.umask(oldMask); if(previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN=previous; }
});

test("the packaged verifier exercises fresh PostgreSQL on full and targeted runs and releases its resources",async t=>{
  const {dirname,resolve}=await import("node:path");
  const {fileURLToPath}=await import("node:url");
  const {realpathSync,cpSync,readFileSync}=await import("node:fs");
  const {randomUUID}=await import("node:crypto");
  const {Objects}=await import("./train-runtime-fixture.ts");
  const root=fixture();t.after(()=>rmSync(root,{recursive:true,force:true}));
  const src=process.env.METHODOLOGY_TRAIN_BIN?resolve(dirname(realpathSync(process.env.METHODOLOGY_TRAIN_BIN)),"../assets/train/verifier"):
    fileURLToPath(new URL("../assets/train/verifier/",import.meta.url));
  const base=readFileSync(join(src,"Dockerfile"),"utf8").match(/^ARG VERIFY_BASE=(\S+)/m)![1];
  const docker=(...args:string[])=>execFileSync("docker",args,{encoding:"utf8",stdio:["ignore","pipe","pipe"],
    env:{...process.env,BUILDX_CONFIG:join(root,"buildx")}}).trim();
  const c=config(root);
  c.suiteImage=docker("build","--network=none","-q",src);
  c.postgresImage=base;
  const dir=join(root,"run","git");mkdirSync(dir,{recursive:true});
  const obj=new Objects(dir,join(root,"remote.git"),"main",Date.now()+100000);obj.init();
  const edit=join(root,"author");
  writeFileSync(join(edit,"README.md"),"Reference\n");writeFileSync(join(edit,"products.csv"),"id,price_cents\n1,125\n");
  git(edit,"add","README.md","products.csv");git(edit,"commit","-m","contract input");git(edit,"push",obj.remote,"HEAD:main");
  const sha=obj.base(),id=randomUUID(); const {runSuite}=await mod("suite");
  assert.deepEqual(runSuite(c,obj,id,"full",sha,[]),{result:"pass"});
  writeFileSync(join(edit,"products.csv"),"id,price_cents\n1,999\n");git(edit,"add","products.csv");git(edit,"commit","-m","different observed value");
  git(edit,"push",obj.remote,"HEAD:main");
  assert.deepEqual(runSuite(c,obj,id,"targeted",obj.base(),["postgres-roundtrip"]),{result:"fail",tests:["postgres-roundtrip"]});
  assert.deepEqual(runSuite(c,obj,id,"docs",sha,[]),{result:"pass"});
  // The trusted oracle contacts the separately running candidate over
  // loopback and observes the bytes served from the exact selected tree.
  const context=join(root,"service");mkdirSync(context);
  writeFileSync(join(context,"service.pl"),`use IO::Socket::INET;
my $s=IO::Socket::INET->new(LocalAddr=>"127.0.0.1",LocalPort=>8098,Listen=>8,ReuseAddr=>1) or die;
while(my $client=$s->accept){open my $f,"<","/candidate/products.csv" or die;while(my $line=<$f>){print {$client} $line;}close $client;}
`);
  writeFileSync(join(context,"Dockerfile"),"FROM "+base+'\nCOPY service.pl /opt/service.pl\nENTRYPOINT ["perl","/opt/service.pl"]\n');
  c.serviceImage=docker("build","--network=none","--label","methodology.test="+id,"-q",context);
  t.after(()=>docker("image","rm",c.serviceImage!));
  const oracle=join(root,"oracle");cpSync(src,oracle,{recursive:true});
  writeFileSync(join(oracle,"full.list"),"service-readback\n");
  writeFileSync(join(oracle,"cases","service-readback"),`#!/bin/bash
for i in 1 2 3 4 5; do
  if exec 3<>/dev/tcp/127.0.0.1/8098; then grep -qx '1,125' <&3; exit $?; fi
  sleep 0.1
done
exit 2
`,{mode:0o755});
  c.suiteImage=docker("build","--network=none","--label","methodology.test="+id,"-q",oracle);
  t.after(()=>docker("image","rm",c.suiteImage));
  assert.deepEqual(runSuite(c,obj,id,"targeted",sha,["service-readback"]),{result:"pass"});
  assert.equal(docker("ps","-aq","--filter","label=methodology.train.run="+id),"");
});
