#!/bin/bash
# カット計算アプリの自動テスト（ダブルクリックで実行）
# 「✅ 全テスト通過」が出ればOK。「❌ 失敗」が出たら計算が壊れている合図です。

cd "$(dirname "$0")" || exit 1

JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"
APP="baccarat-cut-gpt.html"
TEST="tests/gpt/cut-core.test.js"
SNAP="tests/gpt/snapshot.json"

echo "================================"
echo " カット計算アプリ GPT版 テスト"
echo "================================"

if [ ! -x "$JSC" ]; then
  echo "⚠ テスト実行エンジン(jsc)が見つかりません:"
  echo "  $JSC"
  echo "（macOSのJavaScriptCoreが必要です）"
  echo ""
  read -n1 -r -p "何かキーを押すと閉じます..."
  exit 1
fi

"$JSC" "$TEST" -- "$APP" "$SNAP"
RESULT=$?
"$JSC" tests/gpt/fair-core.test.js -- "$APP"
if [ $? -ne 0 ]; then RESULT=1; fi
"$JSC" tests/gpt/manual-cut.test.js -- "$APP"
if [ $? -ne 0 ]; then RESULT=1; fi

echo ""
if [ $RESULT -eq 0 ]; then
  echo "（テスト成功。アプリの計算は今まで通り正しく動いています）"
else
  echo "（テスト失敗。最近の変更で計算が変わった/壊れた可能性があります。上の❌を確認してください）"
fi
echo ""
read -n1 -r -p "何かキーを押すと閉じます..."
echo ""

exit "$RESULT"
