# vocab-add

> このファイルは人間向けの説明です。Claude が読むのは `SKILL.md` で、ここに何を書いても挙動は変わりません。

Cosense（Scrapbox）の語彙ストックに、手法や現象の「名前」を 1 ページとして足すスキル。
「語彙に入れて」「これ Cosense に追加して」で発火する。

## 何をするか

1. Cosense の `語彙の書き方` ページを読んで書式を思い出す
2. 本文をファイルに書き出す（Windows の文字化け対策込み）
3. `cosense previewEdit` で dry-run し、`internal links` に事故が無いか見る
4. `cosense submitEdit` で確定する

## 設計

**書式のルールはこのスキルに入っていない。** Cosense の `語彙の書き方` ページが正本で、スキルはそれを読ませる役。
ルールを直したいときは Cosense 側を直せば次から効く。スキルに写すと二重管理になって片方が腐る。

スキルが持つのは手順と、実行時にしか出ない事故の止め方だけ。

## 前提

`cosense` CLI（`@helpfeel/cosense-cli`）が入っていて login 済みであること。
新しい PC でのセットアップは `references/setup.md`。

## 使うプロジェクト

語彙を置く Cosense プロジェクトの URL は、環境変数 `COSENSE_PROJECT` で指定する（例: `~/.claude/settings.json` の `env` に `"COSENSE_PROJECT": "https://scrapbox.io/<your-project>"`）。
未設定のときは、スキルが最初に URL を聞く。
