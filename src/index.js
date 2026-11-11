/**
 * env-allowlist: replace the built-in bash tool with one that spawns children
 * using only the variables allowed by ~/.pi/agent/env-allowlist.json.
 *
 * Missing config is created from the built-in template on first use; an
 * invalid config fails closed: the command is refused and nothing runs.
 * Edits to the config take effect on the next command (mtime/size check).
 */

import { createBashTool } from "@earendil-works/pi-coding-agent";
import { CONFIG_PATH, ensureConfig, filterEnv, blockedCommand, blockedPath } from "./lib.js";

const BLOCK_REASON =
  "Blocked by env-allowlist: reading /proc/*/environ or /proc/*/mem is not allowed. " +
  "Use the filtered environment (`env`) instead.";

export default function envAllowlist(pi) {
  const bash = createBashTool(process.cwd(), {
    spawnHook: (ctx) => {
      const loaded = ensureConfig();
      if (!loaded.config) {
        throw new Error(
          `env-allowlist: refusing to run bash because ${loaded.error}. ` +
            `Fix that file and retry; no command was executed.`,
        );
      }
      return {
        command: ctx.command,
        cwd: ctx.cwd,
        env: filterEnv(ctx.env, loaded.config),
      };
    },
  });

  pi.registerTool(bash);

  pi.on("tool_call", (event) => {
    const input = event.input ?? {};
    if (event.toolName === "bash" && blockedCommand(input.command)) {
      return { block: true, reason: BLOCK_REASON };
    }
    if (event.toolName === "read" || event.toolName === "grep") {
      if (blockedPath(input.path)) return { block: true, reason: BLOCK_REASON };
    }
    return undefined;
  });

  pi.on("session_start", (_event, ctx) => {
    const loaded = ensureConfig();
    if (loaded.error && ctx.hasUI) {
      ctx.ui.notify(`env-allowlist: ${loaded.error}`, "error");
    } else if (loaded.created && ctx.hasUI) {
      ctx.ui.notify(`env-allowlist: created default config at ${CONFIG_PATH}`, "info");
    }
  });
}
