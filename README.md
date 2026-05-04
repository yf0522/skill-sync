# skill-sync

一个统一存放并分发 AI 编程工具 Skill 的小工具。

支持 Claude Code、Codex CLI、Cursor，也能扩展到其他遵循 `<root>/<name>/SKILL.md` 目录约定的工具。

## 它解决什么问题

每个 AI 工具都把 Skill 放在自己家：

| 工具 | 默认目录 |
|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | `~/.codex/skills/<group>/<name>/SKILL.md` |
| Cursor | `~/.cursor/skills-cursor/<name>/SKILL.md` |

问题：
1. 删除/重装某个工具，里面的 Skill 一起没了。
2. 同一个 Skill 想给多个工具用，得手动拷三份，每改一次同步一次。
3. 备份、版本管理、跨机同步都很麻烦。

`skill-sync` 把所有 Skill 集中放在一个 **canonical store**（默认 `~/.skill-sync/skills/`），每个工具的 Skill 目录里只保留**软链接**指过来。

```
~/.skill-sync/skills/
└── checkpoint/
    └── SKILL.md            ← 真身

~/.claude/skills/checkpoint           → ~/.skill-sync/skills/checkpoint
~/.codex/skills/skill-sync/checkpoint → ~/.skill-sync/skills/checkpoint
~/.cursor/skills-cursor/checkpoint    → ~/.skill-sync/skills/checkpoint
```

效果：
- 编辑一处，三个工具同时看到。
- 删工具不删 Skill；重装工具后 `skill-sync repair` 一秒还原。
- canonical store 是个普通文件夹，丢进 git / iCloud / Dropbox 就有了备份与跨机同步。

## 安装

需要 Node.js ≥ 18。直接克隆并 link 一下：

```bash
cd /path/to/skill-sync
npm link        # 提供全局 skill-sync 命令
# 或者直接：
node bin/skill-sync.mjs --help
```

## 使用

第一次：

```bash
skill-sync init                # 在 ~/.skill-sync 建立 store + 配置
skill-sync import --all        # 把现有三个工具里的 skill 全部搬进 store，原位置改成符号链接
skill-sync list                # 查看每个 skill 在哪几个工具里激活了
```

日常：

```bash
skill-sync add my-skill --description "What it does and when to use it."
# → 在 store 创建 SKILL.md，并自动链接到所有已配置工具

skill-sync link  my-skill --to claude,cursor      # 只链到指定工具
skill-sync unlink my-skill --from cursor          # 撤销某个工具的链接（store 不动）
skill-sync edit  my-skill                          # 用 $EDITOR 打开 SKILL.md
skill-sync remove my-skill --yes                   # 从 store 和所有工具删除
```

工具坏了 / 重装了：

```bash
skill-sync repair              # 重建所有缺失或断掉的符号链接
```

健康检查：

```bash
skill-sync status              # 每个工具下 linked / broken / conflict 数量
```

## 配置

`~/.skill-sync/config.json`（也可以用环境变量 `SKILL_SYNC_HOME` 指到别处）：

```json
{
  "tools": {
    "claude": { "root": "/Users/me/.claude/skills",            "enabled": true },
    "codex":  { "root": "/Users/me/.codex/skills/skill-sync",  "enabled": true },
    "cursor": { "root": "/Users/me/.cursor/skills-cursor",     "enabled": true }
  }
}
```

要新增一个工具，只需在 `tools` 里加一项 `{root, enabled}`，工具的 Skill 也用 `<root>/<name>/SKILL.md` 这种结构就能直接接入。

## 命令一览

```
skill-sync init                              首次初始化
skill-sync list                              所有 skill × 工具状态表
skill-sync status                            按工具统计 linked/broken/conflict

skill-sync add <name> [--description "..."]  新建 skill 并默认链到所有工具
skill-sync import <tool> [<skill>]           把工具里现存 skill 搬进 store，原位改软链
skill-sync import --all [--force]            一次性导入所有已配置工具

skill-sync link   <name> [--to a,b,c] [--force]
skill-sync unlink <name> [--from a,b,c]
skill-sync repair [--force]                  重建缺失/损坏的软链接
skill-sync remove <name> [--yes]             从 store 和所有工具删除
skill-sync edit   <name>                     用 $EDITOR 打开 SKILL.md
```

## 设计取舍

- **软链接而非拷贝**：保证「一处修改、所有工具同步」，否则就退化成 rsync。
- **目录级软链接**：Skill 经常是多文件的（SKILL.md + 辅助脚本 / 模板）；链整个目录最干净。
- **零依赖**：纯 Node.js + 内置模块，避免 npm 安装出错。
- **Frontmatter 不翻译**：三家工具对未知字段都是宽容地忽略，所以共用一份 SKILL.md 即可；如果以后某家做不向后兼容的改动，再加 per-tool 视图。

## License

MIT
