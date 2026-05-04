import {
  cmdInit, cmdList, cmdAdd, cmdImport, cmdLink, cmdUnlink,
  cmdRepair, cmdRemove, cmdEdit, cmdStatus,
} from "./commands.mjs";

const HELP = `skill-sync — one canonical home for AI agent skills

Usage:
  skill-sync init [--force]           Set up ~/.skill-sync (config + store)
  skill-sync list                     Show every skill and which tools see it
  skill-sync status                   Health overview per tool

  skill-sync add <name> [--description "..."] [--no-link]
                                      Create a new skill in the store and link it
  skill-sync import <tool> [<skill>]  Move existing skill(s) into the store, replace
  skill-sync import --all [--force]   with symlinks. --all does every configured tool.

  skill-sync link   <name> [--to claude,codex,cursor] [--force]
  skill-sync unlink <name> [--from claude,codex,cursor]
  skill-sync repair [--force]         Recreate any missing/broken symlinks (run this
                                      after re-installing a tool)
  skill-sync remove <name> [--yes]    Delete from store and remove all symlinks
  skill-sync edit   <name>            Open SKILL.md in $EDITOR

The canonical store lives at \$SKILL_SYNC_HOME (default ~/.skill-sync/skills/).
Each tool's skill directory contains symlinks back into the store, so deleting
or reinstalling a tool never loses your skills — just \`skill-sync repair\`.
`;

const COMMANDS = {
  init: cmdInit,
  list: cmdList,
  ls: cmdList,
  status: cmdStatus,
  add: cmdAdd,
  new: cmdAdd,
  import: cmdImport,
  link: cmdLink,
  unlink: cmdUnlink,
  repair: cmdRepair,
  remove: cmdRemove,
  rm: cmdRemove,
  edit: cmdEdit,
};

export async function main(argv) {
  const args = argv.slice(2);
  const cmd = args.shift();

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }

  const fn = COMMANDS[cmd];
  if (!fn) {
    console.error(`unknown command: ${cmd}\n`);
    process.stdout.write(HELP);
    process.exit(1);
  }

  try {
    await fn(args);
  } catch (err) {
    console.error(`\x1b[31m${err.message}\x1b[39m`);
    if (process.env.SKILL_SYNC_DEBUG) console.error(err.stack);
    process.exit(1);
  }
}
