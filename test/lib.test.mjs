import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_CONFIG } from "../src/default-config.js";
import {
  blockedCommand,
  blockedPath,
  ensureConfig,
  filterEnv,
  globToRegExp,
  loadConfig,
  parseConfig,
} from "../src/lib.js";

test("glob semantics: * and ? are patterns, other characters are literal", () => {
  assert.equal(globToRegExp("LC_*").test("LC_ALL"), true);
  assert.equal(globToRegExp("LC_*").test("LC_"), true);
  assert.equal(globToRegExp("LC_*").test("XLC_ALL"), false);
  assert.equal(globToRegExp("A?C").test("ABC"), true);
  assert.equal(globToRegExp("A?C").test("AC"), false);
  assert.equal(globToRegExp("A.B").test("AxB"), false);
});

test("parseConfig rejects unusable configs", () => {
  assert.throws(() => parseConfig("{"), /invalid JSON/);
  assert.throws(() => parseConfig("[]"), /JSON object/);
  assert.throws(() => parseConfig('{"allow":[]}'), /non-empty/);
  assert.throws(() => parseConfig('{"allow":"PATH"}'), /array/);
  assert.throws(() => parseConfig('{"allow":[""]}'), /non-empty string/);
  assert.throws(() => parseConfig('{"allow":["PATH"],"deny":"X"}'), /array/);
});

test("filterEnv keeps allowed names, drops secrets, deny wins", () => {
  const config = parseConfig('{"allow":["PATH","LC_*","PI_*","SSH_*"],"deny":["SSH_AUTH_SOCK"]}');
  const env = {
    PATH: "/usr/bin",
    LC_ALL: "C.UTF-8",
    PI_SESSION_ID: "s1",
    EXA_API_KEY: "00000000-0000-0000-0000-000000000000",
    OPENAI_API_KEY: "sk-test",
    SSH_AUTH_SOCK: "/tmp/agent.sock",
    SSH_AGENT_PID: "1",
    DROPPED: "x",
  };
  assert.deepEqual(Object.keys(filterEnv(env, config)).sort(), [
    "LC_ALL",
    "PATH",
    "PI_SESSION_ID",
    "SSH_AGENT_PID",
  ]);
  assert.deepEqual(filterEnv({ PATH: "/p", BAD: undefined }, config), { PATH: "/p" });
});

test("loadConfig reports missing and invalid files, and picks up edits", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-env-allowlist-"));
  const path = join(dir, "config.json");

  assert.match(loadConfig(path).error, /missing config file/);

  writeFileSync(path, '{"allow":["A"]}');
  assert.deepEqual(Object.keys(filterEnv({ A: "1", B: "2" }, loadConfig(path).config)), ["A"]);

  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFileSync(path, '{"allow":["A","B"]}');
  assert.deepEqual(Object.keys(filterEnv({ A: "1", B: "2" }, loadConfig(path).config)), ["A", "B"]);

  writeFileSync(path, '{"allow":[]}');
  assert.match(loadConfig(path).error, /non-empty/);
});

test("ensureConfig writes the template once and never overwrites it", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-env-allowlist-"));
  const path = join(dir, "nested", "config.json");
  const template = { allow: ["PATH"], deny: [] };

  const first = ensureConfig(path, template);
  assert.ok(first.config, first.error);
  assert.equal(first.created, true);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(parseConfig(readFileSync(path, "utf8")).allow[0].test("PATH"), true);

  writeFileSync(path, '{"allow":["HOME"]}');
  const second = ensureConfig(path, template);
  assert.equal(second.created, undefined);
  assert.deepEqual(Object.keys(filterEnv({ HOME: "/h", PATH: "/p" }, second.config)), ["HOME"]);

  const invalid = ensureConfig(join(dir, "other.json"), { allow: [] });
  assert.match(invalid.error, /built-in default config is invalid/);
  assert.equal(existsSync(join(dir, "other.json")), false);
});

test("shipped example matches the built-in template", () => {
  const example = JSON.parse(readFileSync(new URL("../config/env-allowlist.example.json", import.meta.url), "utf8"));
  assert.deepEqual(example, DEFAULT_CONFIG);
  assert.ok(parseConfig(JSON.stringify(DEFAULT_CONFIG)).allow.length > 0);
});

test("blockedCommand catches direct /proc environment and memory reads", () => {
  for (const command of [
    'cat /proc/$PPID/environ',
    'cat /proc/3017/environ',
    'cat /proc/self/environ',
    'cd /proc/3017 && cat environ',
    'python3 -c \'print(open("/proc/3017/environ").read())\'',
    'tr "\\0" "\\n" < /proc/3017/environ',
    'dd if=/proc/3017/mem of=/tmp/x',
    'cat /proc/3017/task/3017/environ',
    'grep -h environ /proc/3017/*',
  ]) {
    assert.equal(blockedCommand(command), true, command);
  }

  for (const command of ["env", "printenv PATH", "ls /proc/3017", "cat /proc/cpuinfo", "grep -r environment docs/"]) {
    assert.equal(blockedCommand(command), false, command);
  }
});

test("blockedPath covers read/grep arguments, including arrays", () => {
  assert.equal(blockedPath("/proc/3017/environ"), true);
  assert.equal(blockedPath("/proc/self/environ"), true);
  assert.equal(blockedPath("/proc/3017/mem"), true);
  assert.equal(blockedPath(["/tmp/a", "/proc/1/environ"]), true);
  assert.equal(blockedPath("/proc/3017/cmdline"), false);
  assert.equal(blockedPath("/proc/cpuinfo"), false);
  assert.equal(blockedPath(undefined), false);
});
