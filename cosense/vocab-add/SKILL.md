---
name: vocab-add
description: Cosense (Scrapbox) の語彙ストックに、手法・現象・用語の「名前」を 1 ページとして追加する。発火例 - 「語彙に入れて」「語彙に追加して」「これ Cosense に入れて」「この手法の名前を Cosense に」「vocab に足して」「add this to my Cosense vocabulary」。何かの名前が分かった直後、調べ終わった直後に使う。書式の正本は Cosense 側の「語彙の書き方」ページで、このスキルはそれを読ませてから previewEdit -> submitEdit まで通し、よくある書式事故を止める。
---

# vocab-add — Cosense の語彙ストックに 1 語足す

語彙の置き場は人ごとに 1 つの Cosense プロジェクト。その URL は環境変数 **`COSENSE_PROJECT`**（例: `https://scrapbox.io/<your-project>`）から取る。
以下の `$COSENSE_PROJECT` はその値。未設定なら、ユーザーにプロジェクトの URL を 1 回聞き、
`~/.claude/settings.json` の `env` に入れておくよう勧める（プロジェクト名はこのリポジトリに書かない）。

## このスキルが持つもの / 持たないもの

| | 置き場 | なぜ |
|---|---|---|
| 書式・方針（文体、隣接語、出典、画像） | **Cosense の `語彙の書き方` ページ** | 規約は対象と同じ場所に置く。Cosense 側で直せば次から効く。スキルに写すと二重管理になって必ず片方が腐る |
| 手順・CLI の罠 | このスキル | 読みに行かせる仕掛けと、実行時にしか出ない事故はここにしか置けない |

## 前提

`cosense` CLI が入っていて login 済みであること。

```
cosense whoami https://scrapbox.io
```

落ちる・コマンドが無い場合は `references/setup.md` の手順でセットアップする（新しい PC では必ずここから）。

## 手順

### 1. 規約を読む

```
cosense browsePage "$COSENSE_PROJECT/語彙の書き方"
```

**飛ばさない。** 読まずに書くと説明文が長くなって書き直しになる（実際に一度やった）。
書式について迷ったらこのページが正で、このスキルの記憶ではない。

### 2. 本文をファイルに書き出す

`previewEdit` には `--input-file` で渡す。

**Windows では shell 経由で日本語を渡すと化ける。** python で UTF-8 / LF で書き出すと確実。

```python
import io
body = """<語>
<1 行の意味>

#タグ

<出典 URL>
"""
io.open(path, "w", encoding="utf-8", newline="\n").write(body)
```

行頭のインデントは**タブ**（Cosense の箇条書き）。

### 3. dry-run して `internal links` を見る

```
cosense previewEdit --new "$COSENSE_PROJECT" --input-file body.txt
```

出力末尾の **`internal links in changed lines`** を必ず確認する。ここに意図しない語が並んでいたら書式事故。

よくあるのは、**書式そのものを説明しようとして `[...]` や `#...` をそのまま書き、本物のリンク・タグになってしまう**事故。
説明として書くときはバッククオートのコード記法で囲むと、リンクにならずに記法を見せられる。

タイトルが既存と衝突するとサーバーが suffix を付ける。`submitEdit` の戻り値の `title` で分かる。

### 4. 確定

```
cosense submitEdit "$COSENSE_PROJECT" <previewId>
```

previewId には期限がある（数分）。切れたら 3 からやり直す。

### 5. 既存ページを直すとき

`--new` は使わず ops を渡す。lineId は `cosense readPage <ページの URL>` の `lines[].id`。
`readPage` だけはプロジェクト URL ではなく**ページの URL**を取る（`https://<host>/<project>/<title>`）。

```json
{"ops": [
  {"replace": "<lineId>", "text": "..."},
  {"delete":  "<lineId>"},
  {"insertBefore": "_end", "text": "..."}
]}
```

```
cosense previewEdit "$COSENSE_PROJECT" <pageId> --input-file ops.json
```

`replace` の text に改行は入れられない。複数行にしたいときは `insertBefore` を使う。

## やらないこと

- 書式のルールをこのスキルに書き足さない。`語彙の書き方` に足す
- 解説を書かない。語彙は検索語と隣接語のストックで、解説は検索すれば出てくる側
