---
description: PRをレビューし、承認または差し戻しする
argument-hint: <PR番号>
---

PR #$ARGUMENTS をレビューします。

1. `reviewer` subagent にレビューを依頼
2. 判定に応じて Issue のラベルを更新：
   - APPROVE → `status:approved`。社長にマージ待ちとして報告
   - REQUEST_CHANGES → 差し戻し回数を数える（PR上の、1行目が `判定: REQUEST_CHANGES` のコメント数）
     - 3回未満：`status:changes-requested` にし、`mcp__codex__codex` を同じ worktree で呼んで
       「必須の指摘」を全文渡して修正させる（同じブランチに追加コミット、force push 禁止）。
       修正後、再度この手順でレビュー
     - 3回目：`status:escalated` を付けて停止し、経緯を要約して報告
