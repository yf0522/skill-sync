# skill-sync configuration — copy this file to `config.sh` and edit the values.
#   cp config.example.sh config.sh

# Git URL of the repo that stores your skills (HTTPS recommended for non-interactive push).
# The skills are committed under "$SKILLS_SUBDIR/" inside this repo.
REPO_URL="https://github.com/YOUR_NAME/YOUR_SKILLS_REPO.git"

# Branch to push to.
BRANCH="main"

# Local directory that holds your skills (one sub-directory per skill, each with a SKILL.md).
SKILLS_DIR="$HOME/.claude/skills"

# Sub-directory inside the repo where skills live.
SKILLS_SUBDIR="skills"

# Hour (0-23) of the daily auto-sync.
SCHEDULE_HOUR="11"
