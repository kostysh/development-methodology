import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";
import type { Kind, Suite } from "./engine.js";
import type { Objects } from "./git.js";
import { command } from "./process.js";

export function container(id: string) {
  if (!/^[a-f\d-]{36}$/.test(id)) throw new Error("Invalid owned resource ID");
  return "methodology-train-" + id;
}
export function cleanupContainer(id: string, deadline: number) {
  const name = container(id);
  for (const owned of [name,name+"-app",name+"-db"]) {
    const list = command("docker", ["ps", "-aq", "--filter", "name=^/" + owned + "$"], { deadline });
    if (list.out) {
      const owner = command("docker", ["inspect", "--format", '{{index .Config.Labels "methodology.train.run"}}', owned], {deadline});
      if (owner.out !== id) throw new Error("Container ownership mismatch");
      command("docker", ["rm", "-f", "--volumes", owned], {deadline});
    }
  }
}

function startServices(c: Config, id: string, dir:string, mounts: string[], limits:string[], deadline:number) {
  const name = container(id);
  if (c.postgresImage) {
    const socket = join(dir,"db-socket");
    mkdirSync(socket,{recursive:true});
    chmodSync(socket,0o777); // An inaccessible private parent contains this disposable socket.
    const source = "type=bind,src="+socket+",dst=/socket";
    command("docker",["run","--detach","--name",name+"-db",...limits,"--network=none","--user=postgres",
      "--tmpfs=/tmp:rw,nosuid,nodev,size=768m","--tmpfs=/var/run/postgresql:rw,nosuid,nodev,mode=1777",
      "--mount",source,"--env","PGDATA=/tmp/database","--env","PGHOST=/socket","--env","POSTGRES_HOST_AUTH_METHOD=trust",
      c.postgresImage,"postgres","-c","listen_addresses=","-c","unix_socket_directories=/socket,/var/run/postgresql"],{deadline});
    // The entrypoint first runs a temporary init server. Wait for the final
    // postmaster, otherwise a successful readiness check can precede shutdown.
    const readyBy = Math.min(deadline,Date.now()+60000);
    for (;;) {
      const probe = command("docker",["exec",name+"-db","sh","-c",
        'test "$(cat /proc/1/comm)" = postgres && pg_isready -q -h /socket -U postgres'],{deadline:readyBy,allowed:[0,1]});
      if (probe.code === 0) break;
      if (command("docker",["inspect","--format","{{.State.Running}}",name+"-db"],{deadline:readyBy}).out !== "true")
        throw new Error("Disposable database exited during startup");
      command("sleep",["0.25"],{deadline:readyBy});
    }
    mounts.push("--mount",source+",readonly","--env","PGHOST=/socket","--env","PGUSER=postgres","--env","PGDATABASE=postgres");
  }
  if (c.serviceImage) {
    command("docker",["run","--detach","--name",name+"-app",...limits,"--network=none","--user=65534:65534",
      "--tmpfs=/tmp:rw,nosuid,nodev,size=256m",...mounts,c.serviceImage],{deadline});
    return "--network=container:"+name+"-app";
  }
  return "--network=none";
}

export function runSuite(c: Config, git: Objects, id: string, kind: Kind, sha: string, tests: string[]): Suite {
  const dir = join(git.dir,"..");
  const root = join(dir,"snapshot");
  git.checkout(sha, root);
  const services = kind !== "docs" && Boolean(c.postgresImage || c.serviceImage);
  const limits = ["--pull=never","--label","methodology.train.run="+id,"--read-only","--cap-drop=ALL",
    "--security-opt=no-new-privileges","--pids-limit=256","--memory=1g","--cpus=2"];
  const mounts = ["--mount","type=bind,src="+root+",dst=/candidate,readonly,bind-propagation=rprivate,bind-recursive=disabled"];
  try {
    const network = services ? startServices(c,id,dir,mounts,limits,git.deadline) : "--network=none";
    const run = command("docker", ["run", "--rm", "--name", container(id),...limits,network,
      "--user=65534:65534","--tmpfs=/tmp:rw,nosuid,nodev,size=256m",...mounts,c.suiteImage,kind,sha,...tests],
    { deadline: git.deadline, allowed: [0,1,125,126,127,137] });
    if (run.code !== 0) return { result: "infra", detail: "container exit " + run.code,
      ...([125,126,127].includes(run.code) ? {} : {started:true}) };
    const row = JSON.parse(run.out);
    if (row.result === "pass" && Object.keys(row).length === 1) return {result: "pass"};
    if (row.result === "fail" && Array.isArray(row.tests) && row.tests.length > 0 && row.tests.length <= 256 &&
      row.tests.every((t: unknown) => typeof t === "string" && /^[\w][\w.:/-]{0,199}$/.test(t) &&
        (kind !== "targeted" || tests.includes(t)))) return {result: "fail", tests: [...new Set<string>(row.tests)]};
    return { result: "infra", detail: "Verifier emitted an invalid result", started:true };
  } catch (e) {
    if (e instanceof Error && e.message === "Train timeout" && Date.now() >= git.deadline) throw e;
    return {result: "infra", detail: "Verifier unavailable or malformed output"};
  } finally {
    if (services) cleanupContainer(id, Math.max(Date.now()+5000,git.deadline));
  }
}
