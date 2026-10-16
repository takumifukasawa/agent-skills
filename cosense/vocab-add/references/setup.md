# 新しい PC で Cosense を AI から触るまで

人間が 1 台につき 1 回やる。`cosense login` は TTY と PAT が要るので AI は代行できない。

```
/plugin marketplace add helpfeel/cosense-cli
/plugin install cosense-cli@cosense-cli
npm install -g @helpfeel/cosense-cli
cosense login https://scrapbox.io/<your-project>
cosense whoami https://scrapbox.io
```

- 語彙を置くプロジェクトの URL を `~/.claude/settings.json` の `env` に入れる: `"COSENSE_PROJECT": "https://scrapbox.io/<your-project>"`（スキルはここから読む）
- PAT は Cosense の右上メニュー → **User Settings → Personal Access Token** で発行する
- `cosense login` は **interactive terminal でのみ動く**。エージェント経由では失敗するので普通の端末で実行する
- 保存先は `~/.cosense/settings.json`（dir 0700 / file 0600）。repo の外なので gitignore は要らない
- `COSENSE_PAT` 環境変数があればファイルより優先される。TTY が使えない環境ではこちら

## 踏みやすいもの

`/plugin install` が `npm error 404 ... @jsr/<scope>__<name>` で落ちることがある。
JSR のパッケージは npmjs.org に無いので、`@jsr` スコープの向き先が要る。

```
npm config set @jsr:registry https://npm.jsr.io
```

入れる前に `npm view @jsr/<scope>__<name> version --registry https://npm.jsr.io` で実在を確かめると、
設定を変える前に原因が確定する。
