---
description: todo の Issue がなくなるまで dev → review を自動で回す
argument-hint: "[最大処理件数（省略時20）]"
---

自律モードで開発を回します。最大処理件数は「$ARGUMENTS」件（空なら20件）。

ループ：
1. `gh issue list --label status:todo --json number,body` を取得
2. 依存先がすべて close（マージ済み）の Issue を番号の小さい順に1件選ぶ。なければ終了
3. `/dev` の手順で実装 → `/review` の手順でレビュー → APPROVE ならマージ
   （マージで依存が解けた Issue が次の候補になる。1件ごとに社長へ確認せず 1 に戻る）
4. 件数上限に達したら終了

終了時、以下を表で報告：
- マージした PR（Issue 番号・タイトル）
- question / escalated で止まった Issue とその理由
- 未着手の todo

途中でエラー（CLI失敗・認証切れ等）が起きたら、その Issue に状況をコメントして次へ進む。
同じエラーが2回続いたら全体を停止する。
