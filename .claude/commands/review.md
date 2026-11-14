---
description: PRをレビューし、承認または差し戻しする
argument-hint: <PR番号>
---

PR #$ARGUMENTS をレビューします。

1. `reviewer` subagent にレビューを依頼
2. 判定に応じて Issue のラベルを更新：
   - APPROVE → `status:approved` を付け、続けて PM がマージする（社長への確認は不要）：
     1. `gh pr checks $ARGUMENTS --watch` で CI を待つ（チェックが無ければスキップ）。失敗したら REQUEST_CHANGES と同じ扱いで差し戻す
     2. `gh pr merge $ARGUMENTS --squash --delete-branch`
     3. 紐づく Issue が close されたことを確認し、`git worktree remove ../wt/<issue番号>` と `git fetch origin` を行う
     4. Issue に「マージ完了（判断理由の要約）」をコメントする
   - REQUEST_CHANGES → 差し戻し回数を数える（PR上の、1行目が `判定: REQUEST_CHANGES` のコメント数）
     - 3回未満：`status:changes-requested` にし、指示ファイル `logs/codex/prompt-<issue番号>-fix<回数>.md` に
       元の Issue 本文と「必須の指摘」の全文を書き、`scripts/codex-run.sh` で同じ worktree に修正させる
       （同じブランチに追加コミット・push、force push 禁止）。
       修正後、再度この手順でレビュー
     - 3回目：`status:escalated` を付けて停止し、経緯を要約して報告
