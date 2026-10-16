# verify-in-unity

Unity MCP（`Unity_RunCommand` / `Unity_GetConsoleLogs` / `Unity_Camera_Capture`）を使って、実装した変更を AI 自身が Unity Editor の中で検証するスキルです。コンパイル確認から play mode、UI の無人操作、ログ・実行時アサート・スクショでの確認、原状復帰までを通しで行い、見た目や手触りの判断だけを人間に残します。

> このファイルは人間向けの説明です。Claude が実際に読むのは [SKILL.md](./SKILL.md) で、動作はそちらで決まります。

## こんなときに使う
- 「Unity で検証して」「エディタで動作確認して」「play mode で確かめて」
- 「無人でスモークテストして」「自己検証して」
- Unity プロジェクトで実装を終えた直後に「動くか確認したい」と言われたとき

## やること
0. **接続先の確認** — 状態を変える操作の前に `Application.dataPath` などを出し、作業中のプロジェクトでなければ即中断して報告する
1. **コンパイル確認** — `Library/ScriptAssemblies/Assembly-CSharp.dll` の更新時刻が編集したソースより新しいかで判定する。走っていなければ `AssetDatabase.Refresh()` を投げる
2. **Console のエラー確認** — エラーだけを見て、既存の warning やリロード時の一時エラーはノイズとして区別して報告する
3. **play mode に入る** — `EditorApplication.EnterPlaymode()` の後、`isPlaying` を確認してから進む
4. **UI 操作** — 実際のプレイヤーと同じ入口（ボタンの `onClick.Invoke()`）から操作する。押す前にそのボタンが本当に必要か、onClick の先をコードで辿って確認する
5. **観測** — ログ（grep で抽出）、実行時アサート（`SerializedObject` で private フィールドも読む）、スクショ（`Unity_Camera_Capture`）の 3 系統
6. **判定** — 勝敗・状態遷移・カウンタはログや実行時の値で決める。スクショの見た目で結論しない
7. **原状復帰と報告** — play mode を抜け、検証のために変えたフラグやアセットを戻し、何を変えて何を戻したかを含めて ✅/⚠️/❌ の表と根拠で報告する

## 前提・必要なもの
- Unity MCP（Unity relay）のツール群が接続されたセッション
- 起動中の Unity Editor
- 繋がっていなければ、ユーザーに Editor の起動と MCP 接続を依頼する

## 注意点
- relay はフォーカスに依存する。edit mode で Editor が背面に回ると「Unity not detected」になるので、Unity を前面にしてもらう
- Editor を複数起動していると、別のプロジェクトに繋がっていることがある（無関係なプロジェクトの状態を変えてしまった事故が実際にあった）。他の Editor を閉じてもらう
- `GetConsoleLogs` のエラー 0 件はコンパイル成功の証拠にならない（Console はコンパイル開始時にクリアされることがある）
- 検証対象そのものを内部状態の書き換えでショートカットしない。シナリオの前提づくり（例: 対象キャラにダメージを与えて即死させる）のための注入はよい
- ログは流れて消えるので、過去のログが残っている前提を置かない。確認したい値は実装時に `Debug.Log` を仕込んでおく
- RunCommand は `CommandScript` という名前の `internal` クラスで `IRunCommand` を実装する。`System.Reflection` は使えない。`Unity.*` の型は完全修飾が必要なことがある
- 再コンパイル後に自プロジェクトの namespace が `CS0246` で見えなくなったら、`EditorUtility.RequestScriptReload()` を単独で 1 回実行し、次の呼び出しで本命を投げる
- 純粋なロジックの検証なら EditMode テストやコード読解のほうが速い。このスキルは物理・UI・アセット配線・実データなど、実行しないと分からないことの検証に使う
