# agent-skills

[English](./README.md)

Claude Code のスキル（Agent Skills）を集めたリポジトリです。カテゴリごとに 1 つのプラグインとして、プラグインマーケットプレイスの形で配っています。

> このファイルは人間向けの説明です。Claude の動作に効くのは各スキルの `SKILL.md` で、`README.ja.md` は動作に影響しません（[言語の使い分け](#言語の使い分け)）。

## 導入方法

### Claude Code（おすすめ）: プラグインとして入れる

Claude Code のプロンプトで次を実行します。

```
/plugin marketplace add takumifukasawa/agent-skills
/plugin install meta@takumifukasawa-agent-skills
/plugin install gamedev@takumifukasawa-agent-skills
/plugin install blog@takumifukasawa-agent-skills
/plugin install security@takumifukasawa-agent-skills
```

- 使いたいカテゴリだけ入れれば足ります。入れたら `/reload-plugins` を実行する（または新しいセッションを開く）と使えるようになります。
- プラグインのスキルは `/gamedev:mobile-audio-render` のように名前空間つきになりますが、ふだんどおり話しかけるだけでも `description` に応じて発火します。

**更新するとき**: `/plugin marketplace update takumifukasawa-agent-skills` のあと `/plugin update <プラグイン名>@takumifukasawa-agent-skills`。`/plugin` の画面でマーケットプレイスの自動更新を有効にしておけば手作業は要りません。`version` を付けていないので、コミットのたびに新しい版として扱われます。

**旧名 `takumi-agent-skills` で登録していた場合**は、いったん外して入れ直します。

```
/plugin marketplace remove takumi-agent-skills
/plugin marketplace add takumifukasawa/agent-skills
```

### Codex や、プラグインを使わないマシン: リンク / コピーで入れる

**同じ Claude のプロファイルでプラグインと併用しないでください。** 両方が読み込まれて、スキルが 2 つずつ並びます。

```bash
git clone https://github.com/takumifukasawa/agent-skills ~/dev/agent-skills
cd ~/dev/agent-skills && ./install.sh            # 全スキルを ~/.claude/skills/ にフラットにリンク
DEST="/path/one /path/two" ./install.sh          # 複数の場所にリンク（2 つ目のプロファイルなど）
```

スキルを追加したら `./install.sh` をもう一度実行します。毎回 `DEST=...` を打たないように、`install.sh` の隣に `.install.local.sh`（git 管理外）を置いて `DEST="..."` と書いておけば自動で読み込まれます。

clone せずにスキル 1 つだけコピーすることもできます（更新するときは同じコマンドをもう一度。パスにカテゴリが入る点に注意）。

```bash
npx degit takumifukasawa/agent-skills/meta/skill-creator ~/.claude/skills/skill-creator
```

**Windows（WSL を使わず PowerShell で Claude Code を動かす場合）**: `install.ps1` を使います。

```powershell
./install.ps1                           # 全スキルを %USERPROFILE%\.claude\skills\ にコピー
./install.ps1 -Link                     # コピーではなくリンク（編集がそのまま反映される）
./install.ps1 -Dest 'C:\one','C:\two'   # 複数の場所に入れる
```

- `-Dest` を渡さないときは、隣の `.install.local.ps1`（git 管理外。`$Dest = @('...', '...')` と書く）が読み込まれます。
- 既定は**コピー**なので、`git pull` やスキルを編集したあとにも実行し直します。`-Link` はディレクトリジャンクションを使い、管理者権限も開発者モードも要らず、ドライブをまたいでも動きます（作れなければシンボリックリンク、それも駄目ならコピーに切り替わります）。
- `スクリプトの実行が無効になっているため`（`UnauthorizedAccess`）と言われたら、`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` を一度実行するか、`powershell -ExecutionPolicy Bypass -File .\install.ps1` で実行します。
- WSL の中で動かしているなら Linux と同じく `./install.sh` を使います。

スキルはセッション開始時に読み込まれます。認識されないときは新しいセッションを開くか `/clear` してください。

## スキル一覧

スキル名のリンクは日本語の説明（`README.ja.md`）に飛びます。

### meta

| スキル | 内容 |
|---|---|
| [skill-creator](./meta/skill-creator/README.ja.md) | 規約に沿ったスキルを対話的に作る／既存のスキルを規約に合わせる |
| [retrospective-codify](./meta/retrospective-codify/README.ja.md) | セッション内の試行錯誤から、再利用できるスキルを取り出す |
| [double-check](./meta/double-check/README.ja.md) | 計画や実装を独立に導き直して、本当に正しいか検算する |
| [context-catchup](./meta/context-catchup/README.ja.md) | セッション冒頭に docs・メモリ・VCS から「現在地」を読み込んで要約する（agent-harness を入れていないリポジトリ向け） |
| [context-handoff](./meta/context-handoff/README.ja.md) | セッションを終える前に docs・メモリを最新にして、再開地点を残す（agent-harness を入れていないリポジトリ向け） |
| [task-eta](./meta/task-eta/README.ja.md) | 裏で動いているバックグラウンドタスクの進捗と残り時間を確かめる |
| [orchestrator-model-split](./meta/orchestrator-model-split/README.ja.md) | 統括とサブエージェントでモデルを分ける設定と、既定が効かない場所 |

### blog

| スキル | 内容 |
|---|---|
| [blog-review](./blog/blog-review/README.ja.md) | Markdown のブログ記事を、内容・日本語の校正・媒体の書式の観点でレビューする |

### cosense

| スキル | 内容 |
|---|---|
| [vocab-add](./cosense/vocab-add/README.ja.md) | Cosense の語彙ストックに 1 語追加する。書式は Cosense 側のページを読んで従う |

### gamedev

| スキル | 内容 |
|---|---|
| [game-icon-from-screenshot](./gamedev/game-icon-from-screenshot/README.ja.md) | 実際に動いているゲーム画面をスクショして、正方形のアプリアイコンを作る |
| [game-store-assets](./gamedev/game-store-assets/README.ja.md) | 実際のゲーム画面から、ストア用のスクショ・フィーチャーグラフィック・説明文を作る。アプリアイコンも含めて選べる選定ページ（Artifact）付き |
| [game-gameplay-video](./gamedev/game-gameplay-video/README.ja.md) | Web / canvas ゲームの実プレイ映像を録り、広告動画に仕上げる |
| [version-history-update](./gamedev/version-history-update/README.ja.md) | AB の variant・分析結果・配信表などから、版ごとの変更履歴を更新する |
| [mobile-audio-render](./gamedev/mobile-audio-render/README.ja.md) | 実機（特に Android Chrome）での音のぶつぶつと、three.js の描画の重さを切り分けて直す |
| [verify-in-unity](./gamedev/verify-in-unity/README.ja.md) | Unity MCP で、実装した変更を AI 自身が Unity Editor 内で検証する |

### security

| スキル | 内容 |
|---|---|
| [leak-audit](./security/leak-audit/README.ja.md) | 公開前に、作業ツリーと git の全履歴からシークレットや社名などの非公開情報を探し、見つかったら掃除の段取り（履歴の書き換え、鍵のローテーション、コピーの回収）をする |

## リポジトリの構成

スキルはカテゴリのフォルダに分けて `<カテゴリ>/<スキル名>/` に置いています。カテゴリ 1 つが `.claude-plugin/marketplace.json` のプラグイン 1 つに当たります。

```
agent-skills/
├── .claude-plugin/marketplace.json   # カテゴリごとのプラグインと、そのスキル一覧
├── meta/
│   └── skill-creator/
│       ├── SKILL.md                  # Claude が読むもの（動作を決める）
│       └── README.ja.md              # 人間向けの日本語の説明
├── blog/
├── gamedev/
└── security/
```

カテゴリはこのリポジトリの整理用です。`install.sh` はスキルをフォルダ名のまま `~/.claude/skills/` にフラットにリンクするので、frontmatter の `name` はスキル自身のフォルダ名と同じにします（カテゴリの接頭辞は付けません）。

### 言語の使い分け

- **`SKILL.md` の本文と `references/` は英語でも日本語でもよい**。書きやすく直しやすい方で書きます。Claude はどちらでも同じように従えます。
- **`description` には、実際に話しかける言葉を入れる**。日本語の発火語（「〜して」など）も入れます。発火するかどうかは `description` だけで決まるので、本文の言語よりこちらが大事です。
- **`README.ja.md` は人間向けの日本語の入口**。全スキルのフォルダ（とこのリポジトリの直下）に置きます。Claude は読み込まないので、動作には影響しません。本文が日本語のスキルなら、要約と使いどころだけの短いもので足ります。スキルを変えたら一緒に直します。

## スキルの作り方

- **作る**: `skill-creator` スキルを呼びます（「スキルを作りたい」「この手順をスキルにして」など）。規約に沿った雛形を作ってくれます。
- **登録する**: `.claude-plugin/marketplace.json` の、そのカテゴリのプラグインの `skills` に追加し、`claude plugin validate .` で確かめます。
- **同梱ファイル**は `SKILL.md` から `${CLAUDE_SKILL_DIR}/scripts/...` の形で参照します。プラグインはこの checkout ではなく、キャッシュにコピーされたものから動くためです。
- **公開しても安全に保つ**: このリポジトリは公開です。エージェントは [AGENTS.md](./AGENTS.md) に従います。固有の名前は書かない、編集を終える前に `scripts/check-public.sh --all` を回す、コミットは pre-commit フック経由（`git config core.hooksPath .githooks`。`install.sh` が設定）。会社・製品・ゲーム・ホストなどの固有名は、git 管理外の `.public-check.local` に 1 行 1 正規表現で書いておきます。
- **このリポジトリで試す**: `.claude/skills/` にシンボリックリンクを張ります（git 管理外）。例: `ln -snf ../../meta/skill-creator .claude/skills/skill-creator`

### スキルとは

自己完結したディレクトリと、1 枚の `SKILL.md` です。`SKILL.md` は「いつ」「どう動くか」を Claude に伝える指示書で、常に読まれているのは frontmatter の `description` だけ。本文は、そのスキルが関係ありそうなときに初めて読み込まれます。

```markdown
---
name: my-skill          # kebab-case。ディレクトリ名と一致させる
description: いつ使うスキルか（発火する言葉を具体的に）
---

# 本文（手順・ルール・知識。発火したときだけ読まれるので長くてもよい）
```

### 設計の方針

- **段階的に開示する** — (1) メタデータ（約 100 語）→ (2) 本文（500 行未満）→ (3) 同梱リソース（無制限）。重い内容ほど外側に置きます。
- **リソースの置き場所は標準に合わせる** — `scripts/`（実行するコード）/ `references/`（資料）/ `assets/`（テンプレート・画像）。
- **description は押しを強く** — 「いつ使うか」を具体的に書きます。発火するかどうかはこれだけで決まります。
- 本文では、`ALWAYS` / `NEVER` で縛るより、その手順が**なぜ**大事かを説明します。

## 参考

- [anthropics/skills](https://github.com/anthropics/skills) — 公式のスキル集と仕様（`spec/`）、テンプレート（`template/`）。このリポジトリの規約はこれに従っています。
- [mizchi/skills](https://github.com/mizchi/skills) — APM で配られているコミュニティのスキル集。
