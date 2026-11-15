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

## 社内報システム

`company.config.json` で指定した GitHub リポジトリから Issue、PR、コメント、レビューなどの活動を収集し、日報と月刊社内報を Markdown で生成します。日付と月の集計は `Asia/Tokyo` 基準です。

集計値と出来事候補はコードで計算し、Claude Code には検証済みの facts だけを渡します。生成後も Issue / PR 番号を facts と照合し、存在しない番号を含む社内報の出力を防ぎます。

### 必要な環境

- Node.js 22 以上
- GitHub CLI（`gh`）と、対象リポジトリを読み取れるアカウントでの認証
- Claude Code（`claude`）と認証済みのアカウント

セットアップ前に各コマンドを確認してください。

```bash
node --version
gh auth status
claude --version
```

### インストール

リポジトリのルートで、lockfile に従って依存パッケージをインストールします。

```bash
npm ci
```

### 設定

リポジトリのルートにある `company.config.json` を編集します。

```json
{
  "name": "AI Company",
  "timezone": "Asia/Tokyo",
  "repos": ["masakiShito/ai-company-hq"]
}
```

| 項目 | 説明 |
|------|------|
| `name` | 会社名。空文字は指定できません |
| `timezone` | 集計に使うタイムゾーン。現在は `Asia/Tokyo` のみ対応します |
| `repos` | 収集対象のリポジトリ。`owner/name` 形式で 1 件以上指定します |

`repos` に複数のリポジトリを指定する場合は、例えば `"repos": ["owner/repo-a", "owner/repo-b"]` とします。

### 使い方

日報は `YYYY-MM-DD` 形式の日付を指定します。

```bash
npm run newsletter -- daily 2026-11-07
```

月刊社内報は `YYYY-MM` 形式の年月を指定します。

```bash
npm run newsletter -- monthly 2026-11
```

社内報を生成する前に収集・集計結果を確認したい場合は、末尾に `--dry-run` を付けます。facts が JSON で標準出力され、Claude Code の呼び出しと Markdown ファイルの書き込みは行われません。

```bash
npm run newsletter -- daily 2026-11-07 --dry-run
npm run newsletter -- monthly 2026-11 --dry-run
```

GitHub API から取得した生データは `data/raw/` にキャッシュされます。

### 出力先

| 種類 | 出力先 |
|------|--------|
| 日報 | `issues/daily/<YYYY-MM-DD>.md` |
| 月刊社内報 | `issues/monthly/<YYYY-MM>.md` |

例えば、2026 年 11 月 7 日の日報は `issues/daily/2026-11-07.md`、2026 年 11 月の月刊社内報は `issues/monthly/2026-11.md` に出力されます。

### トラブルシューティング

- `gh` の認証エラーやリポジトリのアクセスエラーになる場合は、`gh auth status` で認証状態を確認し、必要なら `gh auth login` を実行してください。`repos` の `owner/name` と、認証アカウントの読み取り権限も確認します。
- `claude` が見つからない、または認証エラーになる場合は、Claude Code のインストールとログイン状態を確認してください。収集結果だけを確認する場合は `--dry-run` で Claude Code を呼び出さずに実行できます。
- `company.config.json` の読み込みでエラーになる場合は、JSON の構文、必須項目、`Asia/Tokyo` の指定、`owner/name` 形式のリポジトリ名を確認してください。未知の項目も検証エラーになります。
- 生成された本文が facts にない `#番号` を含むと検証エラーになり、1 回だけ自動で再生成します。再生成した本文も検証に失敗した場合は、コマンドが終了コード `1` で停止し、不正確な社内報ファイルは出力しません。`--dry-run` で facts を確認したうえで再実行してください。
- 日付や年月の形式が正しくない場合を含め、コマンドが失敗すると `newsletter:` で始まるエラーを標準エラー出力に表示し、終了コード `1` を返します。

## 開発ワークフローのはじめ方

開発には、社内報システムの実行環境に加えて Codex CLI（`npm i -g @openai/codex` → `codex login`）が必要です。

```bash
bash scripts/setup-labels.sh     # ラベル作成
claude                           # Claude Code 起動
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
scripts/codex-run.sh          エンジニア（Codex）への依頼窓口。ログは logs/codex/
scripts/setup-labels.sh       ラベル作成
issues/                       発行済みの日報・社内報（AI社員が作る）
```
