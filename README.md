# AI Company HQ

Claude Code（PM・レビュアー）と Codex（エンジニア）だけで開発する会社の本社。
わが社の最初の仕事は、わが社の社内報を作ること。

```
社長: 織田家康（人間）
   │ 要件                              ▲ マージ判断
   ▼                                   │
PM: 竹中官兵衛（Claude Code）       レビュアー: 大岡三成（Claude Code）
   │ Issue                             ▲ PR        │ 差し戻し（最大3回）
   ▼                                   │           ▼
エンジニア: 藤堂秀吉（Codex）  ─────────┘     藤堂秀吉が普請し直す
```

| 役割 | 名前 | 中の人 | 名の由来 |
|------|------|--------|----------|
| 社長 | 織田家康 | 人間 | 信長が始め、家康が仕上げる |
| PM | 竹中官兵衛 | Claude Code | 竹中半兵衛 × 黒田官兵衛 |
| エンジニア | 藤堂秀吉 | Codex | 墨俣一夜城の秀吉 × 築城名人・藤堂高虎 |
| レビュアー | 大岡三成 | Claude Code | 大岡越前 × 石田三成 |

## 創業時のルール

このリポジトリの最初のコミットに含まれるのは、規約・社員名簿・要件書だけ。
**実装コードは1行も人間が書かない。** 以降のコードはすべて AI 社員の PR として入る。

## 前提

- Claude Code
- Codex CLI（`npm i -g @openai/codex` → `codex login`）
- GitHub CLI（`gh auth login`）
- Node.js 22 以上

## はじめ方

```bash
bash scripts/setup-labels.sh     # ラベル作成
claude                           # Claude Code 起動。/mcp で codex が connected か確認
```

Claude Code の中で：

```
/kickoff docs/requirements/newsletter.md
/run 3
```

社長の仕事は、`status:question` に答えることと、`status:approved` の PR をマージすることだけ。

## コマンド

| コマンド | 内容 |
|----------|------|
| `/kickoff <要件>` | 要件を Issue に分解 |
| `/dev <issue番号>` | Codex に実装させ PR 作成 |
| `/review <PR番号>` | レビュー・差し戻し・承認 |
| `/run [件数]` | todo を順に自動処理 |

## 構成

```
CLAUDE.md / AGENTS.md         PM・レビュアー / エンジニアの行動規約
docs/CONVENTIONS.md           共通の開発規約
docs/requirements/            社長が書く要件書
characters/                   社員名簿（社内報の語り口）
company.config.json           社内報の対象リポジトリ
.claude/                      subagent・コマンド・権限設定
.mcp.json                     Codex を MCP サーバーとして登録
scripts/setup-labels.sh       ラベル作成
issues/                       発行済みの日報・社内報（AI社員が作る）
```
