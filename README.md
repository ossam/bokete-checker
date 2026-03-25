# ボケて セレクト専用チェックツール

Googleスプレッドシートと連携し、ボケて(bokete)の画像を確認しながら★評価を行うWebアプリです。

## オンラインで使う（GitHub Pages）

### Step 1: GitHubにリポジトリを作成

1. [GitHub](https://github.com/) にログイン
2. 「New repository」→ リポジトリ名を入力（例: `bokete-checker`）
3. 「Public」を選択 → 「Create repository」

### Step 2: コードをpush

```bash
cd ~/Desktop/boketeAIアプリ
git init
git add .
git commit -m "初回コミット"
git remote add origin https://github.com/ユーザ名/bokete-checker.git
git branch -M main
git push -u origin main
```

### Step 3: GitHub Pagesを有効化

1. リポジトリの「**Settings**」→「**Pages**」
2. Source: 「**Deploy from a branch**」
3. Branch: 「**main**」/ root → 「**Save**」
4. 数分後に `https://ユーザ名.github.io/bokete-checker/` でアクセス可能に

---

## ローカルで使う

### Step 1: Google Apps Script をデプロイ

1. 対象のスプレッドシートを開く → メニュー「**拡張機能**」→「**Apps Script**」
2. エディタが開いたら **Cmd+A で全選択 → Delete** で既存コードを削除
3. `gas/Code.gs` の内容を**そのまま貼り付け**（`function myFunction()` で囲まないこと！）
4. **シート名の確認**: `Code.gs` 2行目の `SHEET_NAME` が対象シートのタブ名と一致しているか確認
5. **Cmd+S** で保存
6. **デプロイ**：
   - 右上「**デプロイ**」→「**新しいデプロイ**」
   - 歯車アイコン → 種類：「**ウェブアプリ**」
   - 実行するユーザー：**自分**
   - アクセスできるユーザー：**全員**
   - 「**デプロイ**」をクリック
7. 表示されたURLをコピー

> ⚠️ コードを変更した場合は、「デプロイを管理」ではなく必ず「**新しいデプロイ**」を選んでください。URLが変わります。

### Step 2: 画像URLの一括取得

1. GASエディタ上部の関数ドロップダウンで `setupImageCacheColumn` を選択 → **▶️ 実行**（AK列にヘッダー追加）
2. 次に `batchFetchImageUrls` を選択 → **▶️ 実行**（50件ずつ画像URLを取得・キャッシュ）
3. 実行ログに "Run again" と出たら、**もう一度▶️実行**（全件完了まで繰り返す）

> 💡 初回は権限の許可ダイアログが出ます。「権限を確認」→ 自分のアカウント → 「許可」

### Step 3: フロントエンドを開く

1. `index.html` をブラウザで開く（またはローカルサーバー: `python3 -m http.server 8080`）
2. 初回アクセス時に設定画面（初期設定モーダル）が表示される
3. Step 1 でコピーしたGAS URLを貼り付けて「**保存してデータを読み込む**」

## 使い方

- **★をクリック**して評価（1〜3つ星） → スプレッドシートに即時反映
- 同じ★をもう一度クリックで取り消し
- 上部フィルタで評価別に絞り込み
- ソートボタンで新しい順 ↔ 古い順を切り替え
- 50件ずつ表示、「もっと見る」ボタンで追加読み込み
- ⚙️ボタンからGAS URLをいつでも変更可能
- ❓ボタンでアプリ内ヘルプを表示

## 新しいボケを追加した時

1. スプレッドシートに新しいボケの行を追加
2. GASエディタで `batchFetchImageUrls` を▶️実行（新規分のみ処理される）
3. index.html の「**↻ 再読込**」ボタンを押す

## ファイル構成

```
boketeAIアプリ/
├── index.html          # フロントエンド（ブラウザで直接開く）
├── gas/
│   └── Code.gs         # Google Apps Script（GASエディタに貼り付け）
├── .gitignore
└── README.md
```

## スプレッドシートの列構成

| 列 | 内容 |
|---|---|
| B | 追加日 |
| C | オススメ（★評価） |
| D | bokete URL |
| E | テキスト |
| F | ID |
| AK | 画像URLキャッシュ（自動生成） |

## 注意事項

- **GAS再デプロイ**: コード変更後は「**新しいデプロイ**」が必須（URLが毎回変わる）
- **画像取得**: bokete.jpの画像はGAS経由でスクレイピング → AK列にキャッシュ
- **レート制限**: 一括画像取得は50件/回。全件取得するには複数回実行
- **画像表示制限**: bokete.jpのCDNがホットリンクを制限しているため、一部の画像は表示されません
