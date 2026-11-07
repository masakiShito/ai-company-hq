#!/usr/bin/env bash
# 組織運用に必要なラベルを作成する（既存なら更新）
set -euo pipefail

create() {
  gh label create "$1" --color "$2" --description "$3" --force
}

create "status:todo"              "ededed" "未着手"
create "status:in-progress"       "1d76db" "Codexが実装中"
create "status:review"            "fbca04" "レビュー待ち"
create "status:changes-requested" "d93f0b" "差し戻し中"
create "status:approved"          "0e8a16" "承認済み・社長のマージ待ち"
create "status:question"          "cc317c" "社長の回答待ち"
create "status:escalated"         "b60205" "自動解決不可・社長の判断が必要"

echo "labels ready"
