# leak-audit

公開してはいけない情報（シークレット、鍵ファイル、ホームディレクトリの絶対パス、メールアドレス、Slack や Google Docs のリンク、社内ホスト、社名・製品名・人名などの非公開語）が git リポジトリに入っていないかを調べるスキルです。見つかったときは、履歴の掃除と、ほかにあるコピーの回収まで段取りします。

> このファイルは人間向けの説明です。Claude が実際に読むのは [SKILL.md](./SKILL.md)（英語）で、動作はそちらで決まります。

## こんなときに使う
- 「機密情報検査して」「入っちゃいけない情報を検査して」「公開前チェック」
- 「public にして大丈夫?」「push して大丈夫?」「履歴に残ってない?」
- 公開済みのリポジトリに、まずいものが入っていたと分かったとき

## やること
1. **範囲を決める**: commit 前なら staged の変更、push 前なら未 push のコミット、公開前なら作業ツリーと全履歴を調べます。
2. **非公開語を集める**: 社名・製品名・ゲーム名・人名・社内ホスト名は汎用パターンでは見つけられません。`.public-check.local` があればそれを使い、なければユーザーに聞いて、git 管理外のファイルに書きます（このリスト自体が機密です）。
3. **リストにないものを探す**: `scripts/find_candidates.py` で候補を洗い出します。日本語は形態素解析（janome）で固有名詞・未知語・`株式会社〇〇` を拾い、英字は一般的な英単語ではない語（wordfreq で判定）、キャメルケース、slug、素材のファイル名を拾います。名前以外に、bundle ID（`com.<会社>.<製品>`）、チケット番号（`PROJ-123`）、KPI の語（CPI・継続率・売上・予算など）の近くにある数値、リリースや締め切りの語の近くにある日付も拾います。初回は数百件出ますが、Claude が明らかに公開してよいもの（技術用語、OSS 名、リポジトリ自身の名前）を外し、残りをユーザーに確認します。非公開と判断した語は terms ファイルへ、公開してよい語は `.public-check.known`（gitignore）へ入れるので、次回からは新しく出てきた候補だけになります。
4. **スキャンする**: `scripts/scan.py` で、決まった形のものを検出します。秘密情報やパスに加えて、広告・計測の ID（AdMob・GA・GTM・Meta pixel）、Firebase や GCP のプロジェクト、S3 / GCS のバケット、Slack の ID も見ます。作業ツリーでは画像・PDF に埋め込まれたメタデータ（作者・GPS・ソフト名・パス）を、履歴ではコミットのタイムゾーンを INFO として出します。モードは `--tree` / `--staged` / `--range A..B` / `--history` から選びます。history モードでは、消したはずの昔のファイル、コミットメッセージ、ブランチ名・タグ名、作者のメールアドレス、`(cherry picked from commit …)` の行、lockfile の非公開レジストリまで見ます。GitHub の Web 操作で作られたコミットも一覧にします。history モードの前には `git fetch --all --prune` を実行します（リモートにしかないブランチやコミットがあるため）。あわせて `scripts/external.py` で gitleaks・trufflehog・exiftool をまとめて実行します。入っていないツールはインストール方法を示し、「検査していない」として扱います（問題なし、とはみなしません）。trufflehog の `--verify` を付けると、見つかった認証情報が今も有効かを発行元に問い合わせられます。ただし候補の秘密情報を外部に送ることになるので、ユーザーに確認してから使います。GitHub のリポジトリでは、secret scanning と push protection が有効かも確認します。
5. **スクリプトの外も見る**: PR のタイトル・本文・ブランチ名、issue、release、スクリーンショットに写り込んだもの（デスクトップ、通知、タブ、ユーザー名）を確認します。権利の問題（業務で書いたコードの転用、再配布できない有料のアセット・フォント・音源、他人の発言の引用）も確認します。非公開リポジトリから公開リポジトリへコミットを送る同期スクリプトがあれば、それが漏れの原因なので、スクリプトも直します。
6. **仕分ける**: 誤検知か、言い換えれば済むものか、履歴の掃除が要るものかを分けて、表で報告します。
7. **履歴にあるものを掃除する**（`references/remediation.md`）:
   - シークレットなら、まず失効させるかローテーションします
   - そのうえで、どこまで広がったかで直し方を選びます。未 push ならコミットを作り直すだけです。push 済みで PR がなければ `git filter-repo` と force push。PR に含まれていれば、GitHub の `refs/pull/*` は持ち主にも消せないので、リポジトリを削除して作り直します
   - ほかの PC の clone、fork、CI のキャッシュ、Claude Code のプラグインマーケットプレイスの clone やキャッシュなど、コピーを全部回収します
   - 新しく clone したもので再スキャンし、古いコミットがもう読み出せないことを確かめます
   - 再発防止を提案します。public リポジトリには、毎回自動で走る軽い検査をフックとして入れます（`assets/leak-audit-hook.sh` を `.githooks/` に置き、pre-push・commit-msg・pre-commit から呼びます）。中心は pre-push です。cherry-pick と rebase では pre-commit も commit-msg も走らないので、前回のような漏れは push の時点でしか止められません。agent-harness があるリポジトリでは、pre-commit の分を `.harness/checks.sh` に1行で足します。leak-audit や gitleaks が見つからない PC では「検査していない」と警告して通します（`LEAK_AUDIT_STRICT=1` なら止めます）。誤検知は `.leak-audit-allow` に書いて許可できますが、非公開語は許可できません。ほかに、GitHub のメール非公開設定、エージェントのセッションリンク（`Claude-Session:`）の付与をやめること、同期スクリプトの修正も提案します

## 注意点
- スクリプトはすべて Python なので、Windows でもそのまま動きます。`uv` がなければ、インストールを提案します（どの OS でも単体のバイナリです）。
- GitHub の Web でマージしたコミットには、アカウントの primary メールが作者として入ります。手元のコミットを個人アドレスにしていても、会社のアドレスが混ざることがあります。
- force push、GitHub リポジトリの削除や作り直し、ローカルの削除は取り消せません。毎回ユーザーに確認します。
- 履歴を書き換えても、すでに漏れた認証情報は無効になりません。ローテーションが先です。
- 作り直したあとで古い clone から `git pull` すると、古い履歴がマージされて戻ります。clone し直してください。
- プラグインマーケットプレイスを settings（`extraKnownMarketplaces`）で宣言していると、`/plugin marketplace remove` は失敗します。その場合は clone とキャッシュのディレクトリを消してから `claude plugin marketplace update` を実行します。設定フォルダが複数ある場合は、それぞれで行います。

## 同梱ファイル
- `scripts/scan.py` — スキャナー（Python と git だけで動きます。macOS / Linux / Windows 共通）
- `scripts/hook.py` — git フックの入口（pre-push / commit-msg / pre-commit）。`scan.py` と gitleaks を束ねる
- `assets/leak-audit-hook.sh` — リポジトリに置く呼び出し口。PC ごとに違うスキルの置き場所と Python を探す
- `scripts/external.py` — gitleaks・trufflehog・exiftool のうち入っているものを実行して、結果をまとめる
- `scripts/find_candidates.py` — 固有名詞・ID・数値・予定の候補を洗い出す（`uv run --with janome --with wordfreq python ...` で実行。どちらも Python だけで動くパッケージで、uv が使い捨ての環境に入れます）
- `references/remediation.md` — 見つかったあとの対処手順（filter-repo のレシピ、作り直しの手順、コピーの回収、実例）
