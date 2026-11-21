import { sign } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { trustedPath, type Config } from "./config.js";
import { command } from "./process.js";

export type Credential = string | (() => string);
export function useToken(source: Credential) {
  return typeof source === "string" ? source : source();
}

function scopedCredential(repository: string, appId: number, permissions: Record<string,string>, deadline: number): Credential {
  const key = process.env.TRAIN_APP_KEY_FILE;
  if (!key) {
    if (!process.env.GH_TOKEN) throw new Error("Missing host App key or installation token");
    return process.env.GH_TOKEN;
  }
  trustedPath(key);
  if (statSync(key).mode & 0o077) throw new Error("App key must be private");
  const installation = process.env.TRAIN_INSTALLATION_ID;
  if (!installation || !/^[1-9]\d*$/.test(installation)) throw new Error("Missing host installation ID");
  let token = "", expiry = 0;
  return () => {
    const now = Date.now();
    if (now + 120000 < expiry) return token;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const seconds = Math.floor(now / 1000);
    const claims = encode({alg:"RS256",typ:"JWT"}) + "." + encode({iss:appId,iat:seconds-60,exp:seconds+300});
    const jwt = claims + "." + sign("RSA-SHA256", Buffer.from(claims), readFileSync(key)).toString("base64url");
    const body = JSON.stringify({repositories:[repository.split("/")[1]],permissions});
    const args = ["-q","--silent","--show-error","--fail","--proto","=https","--config","-",
      "--header","Content-Type: application/json","--data-binary",body,
      "https://api.github.com/app/installations/"+installation+"/access_tokens"];
    const minted = JSON.parse(command("curl",args,{deadline,input:'header = "Authorization: Bearer '+jwt+'"\n'}).out);
    expiry = Date.parse(minted.expires_at);
    if (!(expiry > Date.now()+120000) || typeof minted.token !== "string" || !minted.token)
      throw new Error("App returned an unusable installation token");
    token = minted.token;
    return token;
  };
}

// Mint on demand so an expensive offline suite can span multiple installation tokens.
export function writerCredential(c: Config, deadline: number): Credential {
  if (c.branchPolicy === "private-free" && !process.env.TRAIN_APP_KEY_FILE)
    throw new Error("private-free requires the configured writer App key and installation ID");
  const checks = [...c.checks,...c.migrationChecks,...(c.admission?.required ?? [])];
  return scopedCredential(c.repository,c.writerAppId,{contents:"write",pull_requests:"write",checks:"read",
    ...(checks.some(g => g.workflow && !g.workflow.publicRead) ? {actions:"read"} : {})},deadline);
}

export function reviewCredential(repository: string, deadline: number): Credential {
  const appId = Number(process.env.TRAIN_APP_ID);
  if (process.env.TRAIN_APP_KEY_FILE && (!Number.isSafeInteger(appId) || appId <= 0))
    throw new Error("Set TRAIN_APP_ID for the review publisher's host App key");
  return scopedCredential(repository,appId,{pull_requests:"write",contents:"read"},deadline);
}
