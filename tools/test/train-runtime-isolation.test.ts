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
