# 共通開発規約（PM・エンジニア・レビュアー共通）

## 技術スタック

- ランタイム：Node.js 22 以上
- 言語：TypeScript（strict, ESM）
- 実行：`tsx`
- テスト：Vitest
- lint / format：ESLint + Prettier
- GitHub へのアクセス：`gh` CLI（`gh api`）。トークンをコードに埋め込まない
- LLM 呼び出し：`claude -p`（Claude Code のヘッドレスモード）

## コマンド

| 用途 | コマンド |
|------|----------|
| 依存インストール | `npm ci` |
| テスト | `npm test` |
| lint | `npm run lint` |
| 型チェック | `npm run typecheck` |

初回の Issue でこれらのスクリプトが `package.json` に用意されること。

## ブランチ・コミット

- ブランチ：`feat/<issue番号>-<短い説明>` / `fix/<issue番号>-<短い説明>`
- コミット：Conventional Commits（`feat:` `fix:` `test:` `refactor:` `docs:` `chore:`）
- worktree：`../wt/<issue番号>`

## コード規約

- `any` 禁止。外部入力（GitHub API のレスポンス、LLM の出力）は zod で検証する
- 関数は単一責任。1ファイル300行を目安に分割
- 公開関数にはテストを書く。GitHub API や `claude -p` はモックしてテストする
- エラーは握りつぶさない。ログか呼び出し元へ伝播

## 完了の定義（Definition of Done）

- [ ] 受け入れ条件をすべて満たす
- [ ] テスト・lint・型チェックが通る
- [ ] 新しいロジックにテストがある
- [ ] PR 本文に変更内容と確認方法が書かれている
