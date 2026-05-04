import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import {
  ROOT,
  STORE,
  CONFIG_FILE,
  loadConfig,
  saveConfig,
  ensureStore,
  detectCursorRoot,
  DEFAULT_TOOLS,
} from "./config.mjs";
import {
  listStoreSkills,
  storePathFor,
  readSkill,
  writeSkill,
  existsInStore,
  copyDirIntoStore,
  removeFromStore,
} from "./store.mjs";
import {
  ensureLink,
  removeLink,
  inspect,
  listLinks,
  LINK_STATES,
} from "./linker.mjs";

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
};

const SYMBOL = {
  [LINK_STATES.LINKED]: c.green("●"),
  [LINK_STATES.MISSING]: c.dim("○"),
  [LINK_STATES.BROKEN]: c.red("✕"),
  [LINK_STATES.CONFLICT]: c.yellow("!"),
};

// ---- init ----------------------------------------------------------------

export async function cmdInit(args) {
  const force = args.includes("--force");
  if (fs.existsSync(CONFIG_FILE) && !force) {
    console.log(`${c.cyan("skill-sync already initialized")} at ${ROOT}`);
    console.log(`Use --force to overwrite config (skills are kept).`);
    return;
  }
  fs.mkdirSync(ROOT, { recursive: true });
  fs.mkdirSync(STORE, { recursive: true });

  const tools = {};
  for (const [name, def] of Object.entries(DEFAULT_TOOLS)) {
    let root = def.root;
    if (name === "cursor") root = detectCursorRoot();
    tools[name] = { label: def.label, root, enabled: true };
  }
  saveConfig({ tools });

  console.log(`${c.green("✔")} initialized skill-sync at ${c.bold(ROOT)}`);
  console.log(`  store: ${STORE}`);
  console.log(`  config: ${CONFIG_FILE}`);
  console.log("");
  console.log("Configured tools:");
  for (const [n, t] of Object.entries(tools)) {
    console.log(`  ${n.padEnd(8)} → ${t.root}`);
  }
  console.log("");
  console.log(`Edit ${CONFIG_FILE} to change tool paths or disable a tool.`);
  console.log(`Next: ${c.bold("skill-sync import --all")} to bring existing skills into the store.`);
}

// ---- list ----------------------------------------------------------------

export async function cmdList(args) {
  const cfg = loadConfig();
  const skills = listStoreSkills();
  const tools = enabledTools(cfg);

  if (skills.length === 0) {
    console.log(c.dim("(no skills in canonical store yet)"));
    console.log("");
    console.log(`Add one:    ${c.bold("skill-sync add <name>")}`);
    console.log(`Or import:  ${c.bold("skill-sync import --all")}`);
    return;
  }

  const header = ["skill", ...tools.map((t) => t.key)];
  const rows = skills.map((name) => {
    const desc = safeDescription(name);
    const link = tools.map((t) => SYMBOL[inspect(t.root, name).state]);
    return [`${name}${desc ? c.dim("  " + desc) : ""}`, ...link];
  });
  printTable(header, rows);
  console.log("");
  console.log(
    `${c.green("●")} linked   ${c.dim("○")} missing   ${c.red("✕")} broken   ${c.yellow("!")} conflict`,
  );
}

function safeDescription(name) {
  try {
    const { data } = readSkill(name);
    const d = String(data.description || "").replace(/\s+/g, " ").trim();
    return d.length > 60 ? d.slice(0, 57) + "…" : d;
  } catch {
    return "";
  }
}

// ---- add -----------------------------------------------------------------

export async function cmdAdd(args) {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) die("usage: skill-sync add <name> [--description '...'] [--no-link]");
  if (!/^[a-z0-9][a-z0-9_\-]*$/i.test(name)) {
    die(`Invalid skill name: ${name}`);
  }
  if (existsInStore(name)) die(`skill already exists: ${name}`);

  const description = flagValue(args, "--description") ||
    (await prompt(`Description for ${name}: `));

  const data = { name, description };
  const body = `\n# ${name}\n\nDescribe what this skill does and when to use it.\n`;
  writeSkill(name, { data, body });
  console.log(`${c.green("✔")} created ${storePathFor(name)}`);

  if (!args.includes("--no-link")) {
    await linkToTools(name, undefined, false);
  }
}

// ---- import --------------------------------------------------------------

export async function cmdImport(args) {
  const cfg = loadConfig();
  const force = args.includes("--force");
  const all = args.includes("--all");
  const positional = args.filter((a) => !a.startsWith("--"));
  let toolKey = positional[0];
  let skillName = positional[1];

  if (!toolKey && !all) {
    die("usage: skill-sync import <tool> [<skill>] | --all [--force]");
  }
  const tools = all ? enabledTools(cfg) : [getTool(cfg, toolKey)];

  for (const tool of tools) {
    if (!fs.existsSync(tool.root)) {
      console.log(c.dim(`(skip ${tool.key}: ${tool.root} does not exist)`));
      continue;
    }
    const candidates = skillName
      ? [skillName]
      : fs.readdirSync(tool.root, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);

    for (const name of candidates) {
      const src = path.join(tool.root, name);
      const lst = fs.lstatSync(src);
      if (lst.isSymbolicLink()) {
        console.log(c.dim(`  · ${tool.key}/${name}: already a symlink, skipping`));
        continue;
      }
      if (!fs.existsSync(path.join(src, "SKILL.md"))) {
        console.log(c.dim(`  · ${tool.key}/${name}: no SKILL.md, skipping`));
        continue;
      }
      if (existsInStore(name) && !force) {
        console.log(
          c.yellow(`  ! ${tool.key}/${name}: already in store; use --force to replace`),
        );
        continue;
      }
      if (existsInStore(name) && force) removeFromStore(name);

      copyDirIntoStore(src, name);
      // Replace the original directory with a symlink to the canonical copy.
      fs.rmSync(src, { recursive: true, force: true });
      ensureLink(tool.root, name);
      console.log(`${c.green("✔")} imported ${c.bold(name)} from ${tool.key}`);
    }
  }
}

// ---- link / unlink -------------------------------------------------------

export async function cmdLink(args) {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) die("usage: skill-sync link <name> [--to claude,codex,...] [--force]");
  if (!existsInStore(name)) die(`skill not in store: ${name}`);
  const target = parseToolList(flagValue(args, "--to"));
  const force = args.includes("--force");
  await linkToTools(name, target, force);
}

export async function cmdUnlink(args) {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) die("usage: skill-sync unlink <name> [--from claude,codex,...]");
  const cfg = loadConfig();
  const target = parseToolList(flagValue(args, "--from"));
  const tools = enabledTools(cfg).filter((t) => !target || target.includes(t.key));
  for (const t of tools) {
    const r = removeLink(t.root, name);
    console.log(r.changed ? `${c.green("✔")} unlinked ${name} from ${t.key}` : c.dim(`  · ${t.key}: nothing to unlink`));
  }
}

async function linkToTools(name, only, force) {
  const cfg = loadConfig();
  const tools = enabledTools(cfg).filter((t) => !only || only.includes(t.key));
  for (const t of tools) {
    try {
      const r = ensureLink(t.root, name, { force });
      console.log(
        r.changed
          ? `${c.green("✔")} linked ${name} → ${t.key} (${t.root})`
          : c.dim(`  · ${t.key}: already linked`),
      );
    } catch (err) {
      console.log(c.red(`  ✕ ${t.key}: ${err.message}`));
    }
  }
}

// ---- repair --------------------------------------------------------------

export async function cmdRepair(args) {
  const cfg = loadConfig();
  const force = args.includes("--force");
  const skills = listStoreSkills();
  const tools = enabledTools(cfg);
  let fixed = 0;
  let skipped = 0;
  for (const name of skills) {
    for (const t of tools) {
      const before = inspect(t.root, name);
      if (before.state === LINK_STATES.LINKED) continue;
      if (before.state === LINK_STATES.CONFLICT && !force) {
        console.log(
          c.yellow(`  ! ${t.key}/${name}: real file present (use --force to overwrite)`),
        );
        skipped++;
        continue;
      }
      try {
        ensureLink(t.root, name, { force });
        console.log(`${c.green("✔")} linked ${name} → ${t.key}`);
        fixed++;
      } catch (err) {
        console.log(c.red(`  ✕ ${t.key}/${name}: ${err.message}`));
      }
    }
  }
  console.log("");
  console.log(`${c.bold("repair")}: ${fixed} fixed, ${skipped} skipped`);
}

// ---- remove --------------------------------------------------------------

export async function cmdRemove(args) {
  const name = args.find((a) => !a.startsWith("--"));
  const yes = args.includes("--yes") || args.includes("-y");
  if (!name) die("usage: skill-sync remove <name> [--yes]");
  if (!existsInStore(name)) die(`skill not in store: ${name}`);
  if (!yes) {
    const ans = await prompt(
      `Delete ${c.bold(name)} from store and all tool links? [y/N] `,
    );
    if (!/^y/i.test(ans)) {
      console.log("aborted.");
      return;
    }
  }
  const cfg = loadConfig();
  for (const t of enabledTools(cfg)) {
    const r = removeLink(t.root, name);
    if (r.changed) console.log(`  · unlinked from ${t.key}`);
  }
  removeFromStore(name);
  console.log(`${c.green("✔")} removed ${name}`);
}

// ---- edit ----------------------------------------------------------------

export async function cmdEdit(args) {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name) die("usage: skill-sync edit <name>");
  if (!existsInStore(name)) die(`skill not in store: ${name}`);
  const editor = process.env.VISUAL || process.env.EDITOR || "vi";
  const file = path.join(STORE, name, "SKILL.md");
  const child = spawn(editor, [file], { stdio: "inherit" });
  await new Promise((res) => child.on("exit", res));
}

// ---- status --------------------------------------------------------------

export async function cmdStatus() {
  const cfg = loadConfig();
  const skills = listStoreSkills();
  const tools = enabledTools(cfg);
  console.log(c.bold("skill-sync status"));
  console.log(`  store:   ${STORE}`);
  console.log(`  config:  ${CONFIG_FILE}`);
  console.log(`  skills:  ${skills.length}`);
  console.log("");
  for (const t of tools) {
    const exists = fs.existsSync(t.root);
    let linked = 0, broken = 0, conflict = 0, missing = 0, stranger = 0;
    for (const name of skills) {
      const s = inspect(t.root, name).state;
      if (s === LINK_STATES.LINKED) linked++;
      else if (s === LINK_STATES.BROKEN) broken++;
      else if (s === LINK_STATES.CONFLICT) conflict++;
      else missing++;
    }
    if (exists) {
      for (const entry of listLinks(t.root)) {
        if (!entry.isLink) continue;
        const expected = storePathFor(entry.name);
        if (entry.target !== expected) stranger++;
      }
    }
    console.log(c.bold(`${t.key}  (${t.root})`));
    console.log(
      `  ${exists ? c.green("exists") : c.dim("missing")}` +
        `   linked=${linked}` +
        (broken ? c.red(` broken=${broken}`) : "") +
        (conflict ? c.yellow(` conflict=${conflict}`) : "") +
        `   not-linked=${missing}` +
        (stranger ? c.dim(` foreign-symlinks=${stranger}`) : ""),
    );
  }
}

// ---- helpers -------------------------------------------------------------

function enabledTools(cfg) {
  return Object.entries(cfg.tools)
    .filter(([, t]) => t.enabled !== false)
    .map(([key, t]) => ({ key, ...t }));
}

function getTool(cfg, key) {
  if (!cfg.tools[key]) die(`unknown tool: ${key} (known: ${Object.keys(cfg.tools).join(", ")})`);
  return { key, ...cfg.tools[key] };
}

function flagValue(args, name) {
  const eq = args.find((a) => a.startsWith(name + "="));
  if (eq) return eq.slice(name.length + 1);
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  return null;
}

function parseToolList(value) {
  if (!value) return null;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function die(msg) {
  console.error(c.red(msg));
  process.exit(1);
}

function prompt(question) {
  if (!process.stdin.isTTY) return Promise.resolve("");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

function printTable(header, rows) {
  const widths = header.map((h, i) =>
    Math.max(strip(h).length, ...rows.map((r) => strip(String(r[i])).length)),
  );
  const fmt = (cells) =>
    cells.map((cell, i) => padEndAnsi(String(cell), widths[i])).join("  ");
  console.log(c.bold(fmt(header)));
  console.log(c.dim(widths.map((w) => "─".repeat(w)).join("  ")));
  for (const r of rows) console.log(fmt(r));
}

function strip(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
function padEndAnsi(s, w) {
  const visible = strip(s).length;
  return s + " ".repeat(Math.max(0, w - visible));
}
