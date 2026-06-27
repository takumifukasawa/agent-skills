# agent-skills

Claude Code のスキル（Agent Skills）を集約するコレクションリポジトリ。

## スキルとは

1ディレクトリ + `SKILL.md` 1枚で完結する、Claude への「いつ・どう動くか」の指示書。
frontmatter の `description` だけが常時スキャンされ、関連しそうなときに本文が読み込まれて実行される。

```markdown
---
name: my-skill          # kebab-case。ディレクトリ名と一致させる
description: いつこのスキルを使うか（トリガー語を具体的に）
---

# 本文（手順・ルール・知識。呼ばれて初めて読まれるので長くてよい）
```

## リポジトリ構成

このリポジトリは **配布元（ソース）**。スキルはルート直下に `<skill-name>/SKILL.md` として並ぶ、ただのフォルダの集まり。

```
agent-skills/
├── hello/SKILL.md            # 最小サンプル（仕組み確認用）
└── skill-creator/SKILL.md    # スキルを作るメタスキル
```

`.claude/skills/` の symlink はローカルで自作スキルを試すための都合であり、`.gitignore` 済み（配布物ではない）。

## スキルの使い方（別PC・別repoへ配布）

Claude Code は次の場所のスキルをセッション開始時に自動で読み込む:

| 場所 | スコープ |
|---|---|
| `~/.claude/skills/` | 自分の全プロジェクト・全セッション |
| `<repo>/.claude/skills/` | そのプロジェクトのみ |

別PCや別プロジェクトで使うには、**GitHub から該当フォルダをコピー**する（実体が各PCに置かれる。symlink は不要）。

```bash
# 単一スキルをコピー（degit。再実行で更新）
npx degit takumifukasawa/agent-skills/skill-creator ~/.claude/skills/skill-creator

# まとめて管理したいなら clone（git pull で更新）
git clone https://github.com/takumifukasawa/agent-skills ~/dev/agent-skills
cp -R ~/dev/agent-skills/skill-creator ~/.claude/skills/skill-creator
```

新しいスキルはセッション開始時に読み込まれる。認識されない場合は新セッション／`/clear` で再読込。

### このリポジトリ内で自作スキルを試す（ローカル開発）

開発中のスキルをこの repo を開いたセッションで試したいときだけ、`.claude/skills/` に symlink を貼る（コミットしない）:

```bash
ln -snf ../../skill-creator .claude/skills/skill-creator
```

## 新しいスキルを作る

`skill-creator` スキルを呼べば、対話的に規約に沿った雛形を生成・symlink・検証してくれる。
（「スキルを作りたい」「この作業を skill 化したい」などと言えば発火する）

## 既存スキル

| スキル | 説明 |
|---|---|
| [hello](./hello/SKILL.md) | skill の仕組みを確認する最小サンプル |
| [skill-creator](./skill-creator/SKILL.md) | スキルを作る／規約に沿わせるメタスキル（公式準拠） |

## 参考

- [anthropics/skills](https://github.com/anthropics/skills) — 公式コレクション + 仕様(`spec/`) + 雛形(`template/`)。`skills/skill-creator`・`skills/mcp-builder` がメタスキル。本リポジトリの規約はこれに準拠。
- [mizchi/skills](https://github.com/mizchi/skills) — APM 経由で配布されるコミュニティコレクション。

### 設計原則メモ

- **Progressive disclosure** … ①metadata(~100語) → ②本文(<500行) → ③同梱リソース(無制限)。重い物ほど外側へ。
- **同梱リソースの標準ディレクトリ** … `scripts/`（実行コード）/ `references/`（資料）/ `assets/`（テンプレ・画像）。
- **description は "pushy" に** … 「いつ使うか」の文脈を具体的に。発火はこれだけで決まる。
- 本文は `ALWAYS`/`NEVER` の硬い命令より「なぜ重要か」を書く方が効く。
