# orchestrator-model-split

Claude Code で、オーケストレーター（メインループ：計画・統合・判断）と実行側のサブエージェント（探索・実装・検証）を別々のモデルで動かすための設定と運用ルールをまとめたスキルです。

> このファイルは人間向けの説明です。Claude が実際に読むのは [SKILL.md](./SKILL.md)（英語）で、動作はそちらで決まります。

## こんなときに使う
- 「オーケストレーターを○○に」「モデル分担したい」
- 「サブエージェントのモデルを変えたい / opus にしたい」
- 「実行側だけ強いモデルにして」
- `CLAUDE_CODE_SUBAGENT_MODEL` を設定したいとき

## 基本方針
2026-10 時点の基準は**オーケストレーターを Opus 5.5** にすることです。実行側も基本は Opus のままにし、安く広く fan-out したい spawn だけ下位モデルに落とします。

## やること
1. **オーケストレーターのモデル**: ユーザーが `/model` で選びます。新しいセッションの既定として保存されるので、ファイル編集は不要です。
2. **サブエージェントの既定モデル**: ユーザースコープの `~/.claude/settings.json` に書きます。
   ```json
   { "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "opus" } }
   ```
   先にファイルを読んでマージし、他のキーを上書きしないようにします。値はエイリアス（`opus` / `sonnet` / `haiku`、その系統の最新を追従）でもフルのモデル ID でも構いません。
3. **検証**: `jq -e '.env.CLAUDE_CODE_SUBAGENT_MODEL' ~/.claude/settings.json` で値が出ることを確認します。JSON が壊れていると settings 全体が黙って無効になります。必要なら、軽いエージェントを起動して system prompt にあるモデル名を答えさせると確実です。

## 注意点
- settings.json の `env` はセッション開始時に読まれるため、確実に効くのは**次のセッションから**です。今のセッションでは spawn ごとに `model` を明示します。
- 既定が効かない経路があります。
  - `Agent` に `model` を渡すと、それが最優先です
  - カスタムエージェント定義の frontmatter が `model: inherit` だと、env の既定より**親（オーケストレーター）のモデル**が優先されます。env の既定を使うなら `model` 行を書きません
  - `subagent_type: "fork"` は常に親のモデルで、上書きできません
  - `Workflow` スクリプトの `agent()` は env の既定ではなくメインループのモデルを継承するので、呼び出しごとに `opts.model` を渡します
  - 優先順位は「spawn 時の `model` > 定義の frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > メインループのモデル」です
- agent-harness 導入済みのリポジトリでは、`task-orchestrate` がタスクごとにモデルを決め（`stages.json` の `model`）、ここでの既定より優先されます。このスキルはユーザーごとの既定値の設定に使います。
