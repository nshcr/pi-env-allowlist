/**
 * Bootstrap template written to ~/.pi/agent/env-allowlist.json when that file
 * does not exist yet. Runtime filtering still reads only the file; edit the
 * generated copy, not this constant.
 *
 * `test/lib.test.mjs` asserts this object stays identical to
 * `config/env-allowlist.example.json`.
 */
export const DEFAULT_CONFIG = {
  _notes: [
    "Names are glob patterns: * matches any run, ? matches one character.",
    "deny wins over allow. Both lists apply to the bash tool's child environment only.",
    "Nothing outside this file is allowed: a missing or invalid file fails closed.",
    "Add SSH_AUTH_SOCK only if commands must use your ssh-agent (it grants signing access).",
    "PI_* carries session metadata injected by Pi; it contains no credentials.",
    "If this file is deleted, the extension recreates it from its built-in template.",
    "Changes take effect on the next bash command; no reload needed."
  ],
  allow: [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TERM",
    "TERM_PROGRAM",
    "COLORTERM",
    "LANG",
    "LANGUAGE",
    "LC_*",
    "NO_COLOR",
    "FORCE_COLOR",
    "CLICOLOR*",
    "TMPDIR",
    "TMP",
    "TEMP",
    "PWD",
    "OLDPWD",
    "SHLVL",
    "XDG_*",
    "PI_*"
  ],
  deny: []
};
