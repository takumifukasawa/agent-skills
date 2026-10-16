# game-gameplay-video

ローカルで動いている Web / canvas ゲームの実際のプレイを音付きで mp4 に録画し、カットリスト（JSON）から完成した広告動画（Meta / TikTok 向け、800x1000 や 1080x1920、15〜30 秒）に編集するスキルです。

> このファイルは人間向けの説明です。Claude が実際に読むのは [SKILL.md](./SKILL.md)（英語）で、動作はそちらで決まります。

## こんなときに使う
- 「広告動画を作りたい」「広告用の動画」「プレイ動画を撮る」「ゲームプレイをキャプチャ」「mp4 で録画」
- 「カットをつないで」「音楽に合わせて」「倍速にして」
- 「人間っぽい自動操作」「録画用のステージ」
- After Effects などで後から編集するための素材が欲しいとき
- ストア用スクショは `game-store-assets`、アイコンは `game-icon-from-screenshot` の担当

## やること
1. **録画** — `scripts/capture-video.cjs` で Chromium 上の canvas を `captureStream` + MediaRecorder で記録し、ffmpeg で mp4 にする
   - canvas のバッファを撮るので、カーソルや DOM の HUD は写らない
   - キャプチャ解像度はウィンドウと切り離し、エンジン側の描画サイズを上げる（Phaser / Three.js / PixiJS ごとの方法あり）
   - `audio: true` でゲームの WebAudio の音も録る
   - `timeline` で毎フレームの状態（スコア、ビートなど）を `<name>.timeline.json` に書き出し、カットの根拠にする
   - モードは手で遊ぶ `manual` と、設定の `autopilot` が操作する `auto`
2. **再現性を作る** — キャプチャ専用のクエリで seed（ゲームプレイの乱数）と fixed step（1/60 秒固定の物理）をゲームに足す。同じ URL なら同じプレイになり、良いプレイを seed で選べる
3. **自動操作の調整** — `scripts/probe-trajectory.cjs` で headless で軌跡を記録し、`scripts/plot-trajectory.py` で図にして、人間らしく見えて必ずクリアするかを確かめる
4. **編集** — `scripts/ad-edit.cjs` でカットリストから広告サイズの mp4 を作る。速度変更、フェード、BGM 1 本を通しで敷く、カットやゲート通過をビートに合わせる、ラウドネス正規化（既定 −14 LUFS）
5. **録画専用ステージ（任意）** — ステージが単調なら、ビート単位で障害物やギミックを置き、自動操作だけが通る見えない waypoint を足したキャプチャ専用レイアウトを作る。約 5 秒ごとに新しいギミックが来るペースにする
6. 書き出した動画はすぐユーザー向けに開く（macOS なら `open`）

## 前提・必要なもの
- Node + Playwright（Chromium）、PATH 上の ffmpeg
- 軌跡の図には python3 + matplotlib
- ゲームがローカルの dev サーバーで動き、dev 用ハンドル（例: `window.__game`）を公開していること

## 注意点
- 映像と音を 1 つの MediaRecorder で録ると止まる。2 つを同じタイミングで開始して ffmpeg で合わせる
- Ctrl-C で mp4 が残らない問題があるため、Playwright のシグナル処理を切り、永続的な `SIGINT` ハンドラを使う。中断しても webm マスターから手動で変換できる
- bloom の重いゲームでは headless で被写体が止まることがある。短いテイクのフレーム数を `ffprobe -count_frames` で数え、約 60/秒なら正常
- ウィンドウを大きくしない。内部の描画サイズを上げる。リサイズ後はシーンを再起動しないとゲームのスケールがずれる
- H.264 は奇数サイズを受け付けない
- Node から 100ms ごとにポーリングするとタイミングが ±0.1 秒ずれてビート合わせに使えない。ページ内で毎フレーム記録する
- 自動操作の開始タイミングが違うと、同じ seed でも別のプレイになる。probe とキャプチャで開始方法をそろえ、変更のたびに probe し直す
- キャプチャ解像度でだけ黒い四角が画面を覆う現象は、ポイントスプライトのサイズが NaN / 無限大になり bloom の履歴に残ったのが原因だった。シェーダでクランプし、bloom で非有限値を 0 に置き換える

## 同梱ファイル
- `scripts/capture-video.cjs` — 録画ハーネス（音の分岐、タイムライン、解像度の切り離し、停止処理、変換）
- `scripts/ad-edit.cjs` — カットリストから広告動画を作る編集スクリプト
- `scripts/probe-trajectory.cjs` — 自動操作の軌跡を headless で高速に記録
- `scripts/plot-trajectory.py` — 記録した軌跡を図にする
- `references/ad-editing.md` — カットリストの書き方、カットの下に BGM を敷く方法、ビートに「合って感じる / ずれて感じる」要因
- `references/autopilot.md` — 自動操作の書き方と、人間らしく見えて必ずクリアする自動操作の作り方
- `references/recording-scripts.md` — seed + fixed step による再現性と、録画専用ステージの作り方
