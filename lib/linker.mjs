// Symlink management. For each tool, the path is <tool.root>/<skillName>.
// We always link directories (not individual files) so multi-file skills
// (SKILL.md + helpers + scripts) come along for the ride.

import fs from "node:fs";
import path from "node:path";
import { storePathFor } from "./store.mjs";

export const LINK_STATES = {
  LINKED: "linked",       // symlink → store target, target exists
  BROKEN: "broken",       // symlink, but target missing or wrong
  CONFLICT: "conflict",   // path exists but is a real file/dir, not a symlink to us
  MISSING: "missing",     // nothing at the path
};

export function linkPath(toolRoot, name) {
  return path.join(toolRoot, name);
}

export function inspect(toolRoot, name) {
  const link = linkPath(toolRoot, name);
  let lst;
  try {
    lst = fs.lstatSync(link);
  } catch {
    return { state: LINK_STATES.MISSING, link, target: null };
  }
  if (!lst.isSymbolicLink()) {
    return { state: LINK_STATES.CONFLICT, link, target: null };
  }
  const target = fs.readlinkSync(link);
  const expected = storePathFor(name);
  // Compare resolved absolute paths so relative/absolute symlinks both match.
  const resolvedTarget = path.resolve(path.dirname(link), target);
  if (resolvedTarget !== expected) {
    return { state: LINK_STATES.BROKEN, link, target: resolvedTarget };
  }
  if (!fs.existsSync(expected)) {
    return { state: LINK_STATES.BROKEN, link, target: resolvedTarget };
  }
  return { state: LINK_STATES.LINKED, link, target: resolvedTarget };
}

export function ensureLink(toolRoot, name, { force = false } = {}) {
  fs.mkdirSync(toolRoot, { recursive: true });
  const link = linkPath(toolRoot, name);
  const status = inspect(toolRoot, name);
  if (status.state === LINK_STATES.LINKED) return { changed: false, status };
  if (status.state === LINK_STATES.CONFLICT && !force) {
    throw new Error(
      `Cannot create link at ${link}: real file/dir already exists. ` +
        `Use --force to overwrite, or run \`skill-sync import\` to canonicalize it first.`,
    );
  }
  if (status.state === LINK_STATES.CONFLICT && force) {
    fs.rmSync(link, { recursive: true, force: true });
  } else if (status.state === LINK_STATES.BROKEN) {
    fs.rmSync(link, { force: true });
  }
  fs.symlinkSync(storePathFor(name), link, "dir");
  return { changed: true, status: inspect(toolRoot, name) };
}

export function removeLink(toolRoot, name) {
  const status = inspect(toolRoot, name);
  if (status.state === LINK_STATES.LINKED || status.state === LINK_STATES.BROKEN) {
    fs.rmSync(status.link, { force: true });
    return { changed: true };
  }
  return { changed: false };
}

export function listLinks(toolRoot) {
  if (!fs.existsSync(toolRoot)) return [];
  const out = [];
  for (const entry of fs.readdirSync(toolRoot, { withFileTypes: true })) {
    const p = path.join(toolRoot, entry.name);
    let lst;
    try {
      lst = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (lst.isSymbolicLink()) {
      const target = fs.readlinkSync(p);
      const resolved = path.resolve(toolRoot, target);
      out.push({ name: entry.name, isLink: true, target: resolved });
    } else if (lst.isDirectory()) {
      out.push({ name: entry.name, isLink: false, target: p });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
