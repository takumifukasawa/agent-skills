---
name: verify-in-unity
description: Unity MCP (Unity_RunCommand / Unity_GetConsoleLogs / Unity_Camera_Capture) を使い、実装した変更を AI 自身が Unity Editor 内で検証する自己検証フロー。コンパイル確認 → play mode 突入 → UI をボタン経由で無人操作 → ログ/実行時アサート/スクショで確認 → 原状復帰、まで一気通貫。発火例: "Unity で検証して", "実機/エディタで動作確認して", "無人でスモークテストして", "play mode で確かめて", "自己検証して", "verify in unity", Unity プロジェクトで実装を終えた直後に「動くか確認したい」と言われた時。Unity MCP が繋がっていないセッションでは使えない (その場合はユーザーに Editor 起動と MCP 接続を依頼する)。
compatibility: Unity MCP (Unity relay) ツール群が接続されたセッション + 起動中の Unity Editor
---

# verify-in-unity — AI が Unity 内で実装を自己検証するフロー

「AI が実装したものを AI 自身で確認・検証する」ための手順。定量確認 (コンパイル・値・ログ・状態遷移) は
AI が自律実行し、美的判断 (見た目が良いか・面白いか) だけを人間に残す。

## 前提と接続の罠 (ここで転ぶと全部無駄になる)

- **relay はフォーカス依存**: Unity Editor が edit mode でバックグラウンドに回るとアイドル化して
  relay への heartbeat が止まり、ツールが "Unity not detected" を返す。→ ユーザーに
  「Unity を一度前面にしてください」と頼むのが正しい復旧手段。play mode 中 +
  `runInBackground: 1` なら背面でも応答することが多い。
- **複数 Editor 起動時は別プロジェクトに繋がっていることがある**。relay はフォーカス追従では
  なくセッション固定。誤接続のまま `EnterPlaymode` などを実行すると**無関係なプロジェクトの
  状態を変えてしまう**(実際に起きた事故)。対処: 他の Editor を閉じてもらう。

## 手順

### Step 0 — identity assert (状態を変える操作の前に必ず)

```csharp
result.Log("productName=" + Application.productName);
result.Log("dataPath=" + Application.dataPath);
result.Log("activeScene=" + UnityEngine.SceneManagement.SceneManager.GetActiveScene().path);
```

`dataPath` が作業中プロジェクトのパスと一致しなければ**即中断**してユーザーに報告する。

### Step 1 — コンパイル確認は dll の mtime で (MCP 不要・ファイル直読み)

```bash
stat -f "%Sm %N" Library/ScriptAssemblies/Assembly-CSharp.dll Assets/**/編集したファイル.cs
```

dll がソースより新しければ成功。**`GetConsoleLogs` の「エラー 0 件」はコンパイル成功の証拠に
ならない** — Console はコンパイル開始時にクリアされることがある。dll はコンパイル失敗時には
更新されない、が信頼できる判定。編集後にコンパイルが走っていなければ `AssetDatabase.Refresh()`
を RunCommand で投げる (それでも Editor がバックグラウンドだと走らない → 前面化を依頼)。

### Step 2 — Console エラー確認

エラーだけ見る。大量の既存 warning (CS0618 等) と、リロード時に稀に出る Inspector 系の一時
エラー (`SerializedObjectNotCreatableException` など) はノイズなので既存分と区別して報告する。

### Step 3 — play mode 突入

`EditorApplication.EnterPlaymode()` を RunCommand で。**ドメインリロードを挟んでも MCP 接続は
生き残る** (経験則)。直後の呼び出しで `EditorApplication.isPlaying` を probe してから進む。

### Step 4 — UI 操作は「実プレイヤーと同じ入口」から

```csharp
var buttons = Object.FindObjectsByType<UnityEngine.UI.Button>(FindObjectsInactive.Include, FindObjectsSortMode.None);
// 名前で探して b.onClick.Invoke()
```

- **まず「そのボタンは本当に必要か」を確認する**。ゲームによってはシナリオが起動時や
  前シナリオ終了時に**自動で始まる**ことがある。名前が目的に合って見えるボタンを押すと、
  実際には別モード (例: オンライン対戦) を起動して余計な失敗ログを撒き、それを
  「既存ノイズ」と誤読する事故になる。押す前に **onClick の先をコードで辿る**か、
  検証対象のログのスタックトレースで「誰が呼んだか」を確認すること
  (自動開始なら起動コルーチン等が呼び元に出る)。
- **検証対象そのもの**を内部状態の直接書き換えでショートカットしない (それは検証ではなく
  別のコードパスになる)。
- ただし**シナリオの前提づくり**のための状態注入は有効なテク。例: イベント駆動ロジック
  (死亡時の切替等) を決定論的に発火させるために、対象キャラへ public API でダメージを与えて
  即死させる。setup (注入 OK) と subject (実経路で通す) を区別する。
- ゲーム側にデバッグ用の bot/autoplay 機構があるなら ON にして併用すると完全無人になる
  (この機構自体はプロジェクト側の資産。ゲーム内 bot = ゲームのコード、UI 操作 = このスキル、
  という棲み分けを保つ)。

### Step 5 — 観測は 3 系統

1. **ログ**: `GetConsoleLogs` は巨大化してファイル保存になる → grep で抽出。ログ窓は有限で
   高速に流れるので**過去のログが残っている前提を置かない**。検証したい値は実装時に
   `Debug.Log` を仕込んでおくのが最強 (例: 主要なパラメータ・ダメージ値・状態遷移を毎回ログに出す)。
2. **実行時アサート** (RunCommand):
   - オブジェクトは `FindObjectsByType<T>` + 名前 / `GetType().Name` 照合で探す
   - private serialized フィールドは **`new SerializedObject(obj).FindProperty("fieldName")`**
     で読む (reflection は MCP 側で禁止されている)
   - scale・位置・参照先アセット名など「意図した設定が実行時に効いているか」を数値で確認
3. **スクショ**: RunCommand で `Camera.main.gameObject.GetInstanceID()` を取り、
   `Unity_Camera_Capture` に渡す。返った画像は AI が直接見てレイアウト破綻・視覚的異常を判定。

### Step 6 — 判定はデータで下す

勝敗・状態遷移・カウンタはログとセーブデータ/実行時値で判定する。**スクショの見た目で結論
しない** — 決着後の物理演出の余波などで、勝ちが負けに見える(逆も)ことが実際にある。

### Step 7 — 原状復帰と報告

- `EditorApplication.ExitPlaymode()`
- 検証のために変えたフラグ/アセットは `SerializedObject` → `ApplyModifiedProperties()` →
  `AssetDatabase.SaveAssets()` で戻し、「何を変えて何を戻したか」を必ず報告に含める
- 報告は ✅/⚠️/❌ の表 + 各項目の根拠 (ログ行・数値・スクショ)。人間に残した判断
  (見た目・手触り) を明示する

## RunCommand の作法 (Unity AI Assistant 系 relay の制約)

- クラス名は `CommandScript` 固定・`internal`・`IRunCommand` 実装。トップレベル文は不可
- `System.Reflection` は禁止 (unauthorized namespaces) — private は SerializedObject で
- コードは `Unity.AI.Assistant...` namespace に包まれるため、`Unity.*` で始まる型は
  完全修飾しないと誤解決することがある
- プロジェクト再コンパイル後に自プロジェクトの namespace が `CS0246` で見えなくなったら、
  `EditorUtility.RequestScriptReload()` を**単独で 1 回**実行し、**次の**呼び出しで本命を投げる

## 使わない場面

- Unity MCP が繋がっていない / Editor が起動していない → まず接続をユーザーに依頼
- 純ロジックの検証 → Unity を回すまでもなく EditMode テストやコード読解で足りるなら
  そちらが速い。このスキルは「実行時にしか分からないこと」(物理・UI・アセット配線・
  実データ) の検証に使う
