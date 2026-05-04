// Operations on the canonical store at ~/.skill-sync/skills/<name>/.
// Each canonical skill is a directory with at least SKILL.md inside. Tools
// see this skill via a symlink whose name equals <name> in their skill root.

import fs from "node:fs";
import path from "node:path";
import { STORE, ensureStore } from "./config.mjs";
import { parse, stringify } from "./frontmatter.mjs";

export function listStoreSkills() {
  ensureStore();
  return fs
    .readdirSync(STORE, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(STORE, name, "SKILL.md")))
    .sort();
}

export function storePathFor(name) {
  return path.join(STORE, name);
}

export function readSkill(name) {
  const skillFile = path.join(STORE, name, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    throw new Error(`Skill not in store: ${name}`);
  }
  const source = fs.readFileSync(skillFile, "utf8");
  const { data, body } = parse(source);
  return { name, data, body, file: skillFile };
}

export function readSkillFromPath(skillFile) {
  const source = fs.readFileSync(skillFile, "utf8");
  const { data, body } = parse(source);
  return { data, body };
}

export function writeSkill(name, { data, body }) {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), stringify(data, body));
}

export function existsInStore(name) {
  return fs.existsSync(path.join(STORE, name, "SKILL.md"));
}

export function copyDirIntoStore(srcDir, name) {
  const dst = path.join(STORE, name);
  if (fs.existsSync(dst)) {
    throw new Error(`Refusing to overwrite store skill: ${name}`);
  }
  copyDir(srcDir, dst);
}

export function removeFromStore(name) {
  fs.rmSync(path.join(STORE, name), { recursive: true, force: true });
}

export function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isSymbolicLink()) {
      // Materialize symlink contents; we don't want to chain links into the store.
      const stat = fs.statSync(s);
      if (stat.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
