---
description: Issueを Codex に実装させて PR を作る
argument-hint: <issue番号>
---

Issue #$ARGUMENTS を実装します。

1. `gh issue view $ARGUMENTS` で本文と依存を確認。`Depends on #N` の依存先 Issue が close（PRマージ済み）でなければ停止して報告
2. ラベルを `status:in-progress` に変更
3. worktree を作成：
   `git fetch origin && git worktree add ../wt/$ARGUMENTS -b feat/$ARGUMENTS-<短い説明> origin/main`
4. `pm` subagent に Codex への実装指示を依頼（テンプレートは pm.md）
5. PR が作成されたらラベルを `status:review` に変更し、PR 番号を報告
6. PR が作成されず質問で止まった場合は `status:question` を付けて停止
