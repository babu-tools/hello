# カット計算アプリの版管理

- Claude版（元の本体）: `baccarat-cut-work.html`。テストは `tests/` 直下と `テスト実行.command`。
- GPT版: `baccarat-cut-gpt.html`。テストと基準データは `tests/gpt/`、実行は `GPT版テスト実行.command`。仕様・履歴は `GPT_VERSION.md`。
- この会話から継続するGPT版の変更はGPT側だけを編集する。Claude版の変更や両版の同期はユーザーが明示した場合に行う。対象が分からない新規依頼では版を確認する。
- 各版の公開URLはREADMEに記載。ファイルの上書きやURLの付け替えで版を混ぜない。
- 計算を変更したら対象版のテストを実行する。意図した計算変更だけに基準データを更新する。GPT版の更新時は画面の版番号とGPT_VERSION.mdを更新する。
