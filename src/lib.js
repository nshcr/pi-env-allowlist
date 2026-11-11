/**
 * env-allowlist: pure helpers (no Pi imports), so they can be tested directly.
 *
 * The set of variables that reach a bash child process is defined only by
 * ~/.pi/agent/env-allowlist.json. Nothing here names a variable.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "./default-config.js";

export const CONFIG_PATH = join(homedir(), ".pi", "agent", "env-allowlist.json");

/** glob -> anchored RegExp; supports `*` (any run) and `?` (one character). */
export function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

function toPatterns(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`"${field}" must be an array of glob patterns`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item === "") {
      throw new Error(`"${field}[${index}]" must be a non-empty string`);
    }
    return globToRegExp(item);
  });
}

/** Parse and validate the config text. Throws on anything unusable. */
export function parseConfig(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("config must be a JSON object");
  }
  if (!Array.isArray(data.allow) || data.allow.length === 0) {
    throw new Error('"allow" must be a non-empty array of glob patterns');
  }
  return {
    allow: toPatterns(data.allow, "allow"),
    deny: toPatterns(data.deny, "deny"),
  };
}

let cache = null;

/**
 * Load the config, reusing the parsed copy while the file stays unchanged.
 * Returns { config } or { error }. Callers must fail closed on { error }.
 */
export function loadConfig(path = CONFIG_PATH) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return { error: `missing config file ${path}` };
  }
  const key = `${stat.mtimeMs}:${stat.size}`;
  if (cache && cache.path === path && cache.key === key) {
    return cache.config ? { config: cache.config } : { error: cache.error };
  }
  try {
    const config = parseConfig(readFileSync(path, "utf8"));
    cache = { path, key, config, error: null };
    return { config };
  } catch (error) {
    const message = `${path}: ${error instanceof Error ? error.message : String(error)}`;
    cache = { path, key, config: null, error: message };
    return { error: message };
  }
}

/**
 * Ensure the config exists, writing the built-in template on first use.
 * Never overwrites an existing file. Returns { config } or { error };
 * sets `created: true` when this call wrote the template.
 */
export function ensureConfig(path = CONFIG_PATH, template = DEFAULT_CONFIG) {
  try {
    statSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return { error: `cannot access ${path}: ${error instanceof Error ? error.message : String(error)}` };
    }
    let text;
    try {
      text = `${JSON.stringify(template, null, 2)}\n`;
      parseConfig(text);
    } catch (parseError) {
      return { error: `built-in default config is invalid: ${parseError instanceof Error ? parseError.message : String(parseError)}` };
    }
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text, { flag: "wx", mode: 0o600 });
      return { ...loadConfig(path), created: true };
    } catch (writeError) {
      if (writeError?.code === "EEXIST") return loadConfig(path);
      return { error: `could not create ${path}: ${writeError instanceof Error ? writeError.message : String(writeError)}` };
    }
  }
  return loadConfig(path);
}

/**
 * Commands that would read another process's environment or memory through
 * /proc. This is a guard against the obvious shapes, not a security boundary:
 * encoding the path, `ps e`, or ptrace-based reads still bypass it.
 */
export function blockedCommand(command) {
  if (typeof command !== "string" || !command.includes("/proc")) return false;
  return /environ\b/i.test(command) || /\/mem\b/i.test(command);
}

/** Path arguments to read/grep that point at /proc/<pid>/{environ,mem}. */
export function blockedPath(value) {
  if (Array.isArray(value)) return value.some(blockedPath);
  if (typeof value !== "string" || !/(^|\/)proc(\/|$)/.test(value)) return false;
  return /(^|\/)(environ|mem)$/.test(value);
}

/** Keep only string values whose name matches allow and not deny. */
export function filterEnv(env, config) {
  const out = {};
  for (const [name, value] of Object.entries(env ?? {})) {
    if (typeof value !== "string") continue;
    if (config.deny.some((re) => re.test(name))) continue;
    if (config.allow.some((re) => re.test(name))) out[name] = value;
  }
  return out;
}
