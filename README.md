# pi-env-allowlist

A [Pi](https://pi.dev) extension that runs the built-in `bash` tool with an
allowlisted environment, and refuses the obvious reads of another process's
environment through `/proc`.

Pi inherits its whole process environment into every `bash` child, so an API
key exported before starting Pi is one `env` away from the model context,
provider request, and session file. This extension replaces the `bash` tool
with the same tool plus a `spawnHook` that keeps only the variable names matched
by a config file.

## Install from GitHub

```sh
pi install git:github.com/<you>/pi-env-allowlist
```

Pin a tag or commit:

```sh
pi install git:github.com/<you>/pi-env-allowlist@v0.1.0
```

Try it for a single invocation without adding it to settings:

```sh
pi -e git:github.com/<you>/pi-env-allowlist
```

The package has no runtime dependencies. Pi loads `./src/index.js` from the
`pi.extensions` manifest.

If you previously tested a local copy at `~/.pi/agent/extensions/env-allowlist`,
remove it first; otherwise both copies register the same `bash` tool and hooks.

## Configure

On first run, if `~/.pi/agent/env-allowlist.json` does not exist, the extension
writes the built-in template there (mode `0600`) and shows a notice. Edit that
generated file: while it exists, it is the only source for the allowlist.
Deleting it makes the next command recreate the template.

The generated file looks like [`config/env-allowlist.example.json`](config/env-allowlist.example.json):

```json
{
  "allow": ["PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_*", "TMPDIR", "PI_*"],
  "deny": ["SSH_AUTH_SOCK"]
}
```

- `allow` and `deny` are arrays of glob patterns (`*` any run, `?` one
  character), matched against variable names.
- `deny` wins over `allow`.
- The lists apply to the `bash` tool's child environment only.
- Edits are picked up by the next command (mtime/size check); no reload needed.
- A missing file is recreated from the built-in template; an invalid file fails
  closed: the command is refused and the error names the file and the problem.

`PI_*` variables are session metadata injected by Pi and contain no
credentials. `SSH_AUTH_SOCK` is intentionally not allowed by default because it
grants signing access to your ssh-agent.

## What it blocks

The extension also hooks `tool_call` and refuses:

- `bash` commands that mention `/proc` together with `environ` or `mem`;
- `read` / `grep` paths pointing at `/proc/**/environ` or `/proc/**/mem`.

This stops the direct shapes (`cat /proc/$PPID/environ`,
`dd if=/proc/3017/mem`, `open("/proc/3017/environ")`) before execution. It is a
denylist, not a boundary: `ps e`, encoded paths
(`base64 -d <<< ... | sh`), split string construction, and ptrace-based reads
still reach the same data.

## Limits

This is defense in depth, not a sandbox.

- It filters the environment passed to `bash`; it does not restrict what the
  process can read from disk or `/proc`.
- `ps e`, `/proc/<pid>/mem`, and encoded paths bypass the `/proc` guard.
- `read` can still read credential files such as `~/.pi/agent/auth.json` or
  `~/.aws/credentials`; file access is out of scope.
- Commands you type with `!` or `!!` are not filtered.
- Background processes are unaffected: no namespaces are used, so `dev` servers
  and watchers keep running across commands.
- If a shell profile, `direnv`, or `BASH_ENV` exports a credential again, it
  reappears in the child environment. Keep such exports out of login shells.

For enforceable containment use an OS sandbox, container, or a dedicated user
account, and keep credentials short-lived and scoped.

## Development

```sh
npm test        # node --test, no dependencies
```

Layout:

```
src/index.js    extension entry (bash tool + tool_call guard)
src/lib.js      config parsing, glob, env filter, /proc matchers
config/         example configuration
test/           unit tests
```

## License

MIT
