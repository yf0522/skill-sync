// Minimal YAML frontmatter parser/serializer for SKILL.md files.
// Handles the subset used by Claude/Codex/Cursor skill formats:
//   - scalar key: value
//   - block scalar  key: |  / key: >-
//   - simple flow lists [a, b, c]
//   - block lists with "- item"
// Anything fancier (nested maps, anchors) gets preserved as raw lines so
// round-tripping stays lossless.

const FM_DELIM = /^---\s*$/;

export function parse(source) {
  const lines = source.split(/\r?\n/);
  if (lines.length === 0 || !FM_DELIM.test(lines[0])) {
    return { data: {}, body: source, hasFrontmatter: false };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FM_DELIM.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return { data: {}, body: source, hasFrontmatter: false };

  const fmLines = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n");
  const data = parseBlock(fmLines);
  return { data, body, hasFrontmatter: true };
}

function parseBlock(lines) {
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];

    // Block scalar: |, |-, >, >-
    const blockMatch = rest.match(/^([|>])([+-]?)\s*$/);
    if (blockMatch) {
      const folded = blockMatch[1] === ">";
      const collected = [];
      i++;
      while (i < lines.length) {
        const ln = lines[i];
        if (ln.length === 0) {
          collected.push("");
          i++;
          continue;
        }
        if (/^\s/.test(ln)) {
          collected.push(ln.replace(/^ {2}/, ""));
          i++;
        } else {
          break;
        }
      }
      const joined = folded
        ? collected.map((s) => s.trim()).filter(Boolean).join(" ")
        : collected.join("\n");
      data[key] = joined.replace(/\n+$/, "");
      continue;
    }

    // Empty value → could be a block list following on next lines
    if (rest === "") {
      const items = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        items.push(stripScalar(lines[i].replace(/^\s+-\s+/, "")));
        i++;
      }
      if (items.length > 0) {
        data[key] = items;
      } else {
        data[key] = "";
      }
      continue;
    }

    // Flow list [a, b]
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      data[key] = inner === "" ? [] : inner.split(",").map((s) => stripScalar(s.trim()));
      i++;
      continue;
    }

    data[key] = stripScalar(rest);
    i++;
  }
  return data;
}

function stripScalar(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function stringify(data, body) {
  const fm = renderFrontmatter(data);
  const trimmedBody = body.startsWith("\n") ? body.slice(1) : body;
  return `---\n${fm}---\n${trimmedBody}`;
}

function renderFrontmatter(data) {
  const out = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push(`${key}: []`);
      } else {
        out.push(`${key}:`);
        for (const item of value) out.push(`  - ${quoteIfNeeded(String(item))}`);
      }
    } else if (typeof value === "string" && value.includes("\n")) {
      out.push(`${key}: |`);
      for (const ln of value.split("\n")) out.push(`  ${ln}`);
    } else {
      out.push(`${key}: ${quoteIfNeeded(String(value))}`);
    }
  }
  return out.join("\n") + "\n";
}

function quoteIfNeeded(value) {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_\-./ ]+$/.test(value) && !/^[\d-]/.test(value)) return value;
  if (/[":#&*!|>%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
