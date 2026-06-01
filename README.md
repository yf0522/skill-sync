# skill-sync

Keep your AI agent **skills in the cloud** and sync them automatically.

`skill-sync` watches a local skills directory (e.g. `~/.claude/skills/`) and pushes
every skill to a Git repo on a daily schedule — so your skills are backed up, versioned,
and ready to pull onto any machine. It resolves symlinks, strips runtime/secret files,
and only commits when something actually changed.

Pairs well with an MCP skill server that serves those skills back to your agents, but
works standalone as a plain backup tool too.

## Why

Agent skills tend to pile up as loose folders on one laptop. Move to a new machine and
they're gone. `skill-sync` makes a Git repo the single source of truth: write skills
locally, they land in the cloud automatically, pull them anywhere.

## Requirements

- macOS (scheduling uses `launchd`)
- `git`, [`gh`](https://cli.github.com/) (logged in via `gh auth login`), `rsync`, `perl`
- A Git repo you can push to (works with private repos via the `gh` credential helper)

## Install

```bash
git clone https://github.com/YOUR_NAME/skill-sync.git
cd skill-sync
cp config.example.sh config.sh      # then edit REPO_URL (and any other settings)
./install.sh
```

`install.sh` checks dependencies, registers a daily `launchd` job, and runs an initial
sync. It's idempotent — re-run it any time.

## Configuration (`config.sh`)

| Variable        | Meaning                                              | Default               |
|-----------------|------------------------------------------------------|-----------------------|
| `REPO_URL`      | Git URL of the repo that stores your skills          | *(required)*          |
| `BRANCH`        | Branch to push to                                    | `main`                |
| `SKILLS_DIR`    | Local directory holding your skills                  | `$HOME/.claude/skills`|
| `SKILLS_SUBDIR` | Sub-directory inside the repo where skills live      | `skills`              |
| `SCHEDULE_HOUR` | Hour (0–23) of the daily sync                        | `11`                  |

Each skill is a sub-directory containing a `SKILL.md`. Skills without a resolvable
`SKILL.md` (e.g. broken symlinks) are skipped, never deleted from the cloud.

## Usage

```bash
bash sync-skills.sh        # sync right now
tail -f sync-skills.log    # watch the log
./uninstall.sh             # stop the scheduled job (skills & repo untouched)
```

## How it works

1. Clone/refresh a clean working copy of your repo under `~/.cache/skill-sync/repo`.
2. `rsync -aL` each local skill into `<repo>/<SKILLS_SUBDIR>/`, dereferencing symlinks
   and excluding `node_modules`, `.venv`, logs, `config.json`, and `state-*.json`.
3. If a `SKILL.md` frontmatter has no `name:`, inject one from the directory name.
4. Commit and push **only if** there's a diff.

## Notes & limitations

- macOS only for scheduling (Linux `cron`/`systemd` support welcome via PR).
- Sync is additive per skill: deleting a skill locally does **not** remove it from the
  cloud (remove it from the repo manually if needed).
- Push uses your `gh` credential helper, so private repos work without storing tokens.

## License

MIT — see [LICENSE](LICENSE).
