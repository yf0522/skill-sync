// Resolve and persist user config. Defaults pick the standard skill dir for
// each known tool; user can override via `skill-sync init` or by editing
// ~/.skill-sync/config.json.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();
export const ROOT = process.env.SKILL_SYNC_HOME || path.join(HOME, ".skill-sync");
export const STORE = path.join(ROOT, "skills");
export const CONFIG_FILE = path.join(ROOT, "config.json");

export const DEFAULT_TOOLS = {
  claude: {
    label: "Claude Code",
    root: path.join(HOME, ".claude", "skills"),
  },
  codex: {
    label: "Codex CLI",
    // Codex groups skills under a sub-directory; we use a dedicated "skill-sync" group.
    root: path.join(HOME, ".codex", "skills", "skill-sync"),
  },
  cursor: {
    label: "Cursor",
    // Cursor uses ~/.cursor/skills-cursor on the version observed locally.
    // We auto-detect the alternate ~/.cursor/skills path during init.
    root: path.join(HOME, ".cursor", "skills-cursor"),
  },
};

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { tools: cloneDefaults(), initialized: false };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const tools = {};
    for (const [name, def] of Object.entries(DEFAULT_TOOLS)) {
      tools[name] = {
        label: def.label,
        root: raw.tools?.[name]?.root || def.root,
        enabled: raw.tools?.[name]?.enabled !== false,
      };
    }
    return { tools, initialized: true };
  } catch (err) {
    throw new Error(`Cannot parse ${CONFIG_FILE}: ${err.message}`);
  }
}

export function saveConfig(cfg) {
  fs.mkdirSync(ROOT, { recursive: true });
  const out = {
    tools: Object.fromEntries(
      Object.entries(cfg.tools).map(([k, v]) => [k, { root: v.root, enabled: v.enabled !== false }]),
    ),
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(out, null, 2) + "\n");
}

export function ensureStore() {
  fs.mkdirSync(STORE, { recursive: true });
}

function cloneDefaults() {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_TOOLS)) {
    out[k] = { label: v.label, root: v.root, enabled: true };
  }
  return out;
}

export function detectCursorRoot() {
  const candidates = [
    path.join(HOME, ".cursor", "skills-cursor"),
    path.join(HOME, ".cursor", "skills"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}
