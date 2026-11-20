import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { object, readJson } from "../baseline/manifest.js";

export class Rejection extends Error {}
export class ResourceBusy extends Rejection {}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!object(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function config(path: string): Record<string, unknown> {
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error("Cannot read control input");
  }
  return record(readJson(bytes, "control input"), "control input");
}

export function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((name) => !keys.includes(name))) throw new Error("Unknown control policy field");
}

export function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.includes("\0") || !value.isWellFormed()) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function absolute(value: unknown, label: string): string {
  const path = string(value, label);
  if (!isAbsolute(path)) throw new Error(`Expected absolute ${label}`);
  return path;
}

export function canonical(value: unknown, label: string): string {
  const path = absolute(value, label);
  try {
    if (realpathSync(path) === path) return path;
  } catch {
    throw new Error(`Unavailable ${label}`);
  }
  throw new Rejection(`Unexpected canonical ${label}`);
}

export function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function strings(value: unknown, label: string): string[] {
  return array(value, label).map((item) => string(item, label));
}

export function identifier(value: unknown, label: string): string {
  const result = string(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/u.test(result)) throw new Error(`Invalid ${label}`);
  return result;
}

export function oid(value: unknown, label: string): string {
  const result = string(value, label);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(result)) throw new Error(`Invalid ${label}`);
  return result;
}
