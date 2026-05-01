# Party Quiz (パーティ用クイズシステム)

リアルタイム参加型のチーム対抗クイズ大会システムです。
スマホ/タブレットから参加する**参加者画面**、会場全体に投影する**プロジェクター画面**、進行を司る**管理者画面**が完全同期して動作します。

## 🌐 本番公開URL (デプロイ済み)

実際に以下のURLにアクセスして、システムを利用・テストすることができます。

- 📱 **参加者・解答画面**: [https://party-quiz.vercel.app/](https://party-quiz.vercel.app/)
- 💻 **プロジェクター画面**: [https://party-quiz.vercel.app/projector](https://party-quiz.vercel.app/projector)
- ⚙️ **管理者・司会者画面**: [https://party-quiz.vercel.app/admin](https://party-quiz.vercel.app/admin)

## ✨ 主な機能とクイズルール

1. **リアルタイム同期 (WebSockets)**
   - 管理者が「出題」ボタンを押すと、プロジェクターと全参加者の画面が瞬時に切り替わります。
2. **ルーム・パスコードシステム**
   - 管理者が「部屋」を作成すると5桁の英数字パスコードが発行されます。参加者はそのコードを入力して入室します。
3. **ベッティング（倍率選択）システム**
   - 解答前に「x1 / x2 / x3」の倍率を選択します。
   - **回数制限あり**: x3は1回、x2は2回まで。x1は無制限に使用可能です。
4. **解答速度ボーナス**
   - 通常クイズでは、早く正解を選んだチームほど追加ボーナス（最大50pt）を獲得。
5. **マジョリティ・クイズ（価値観同調ゲーム）**
   - 正解のない問題に対し、会場の「多数派」を当てるゲーム。得票率（％）がそのままポイントになります。
6. **ライブ・リーダーボード**
   - プロジェクターには常に全チームの勢力図が表示され、結果発表時にはアニメーション付きで順位が更新されます。

## 🛠 技術スタック

- **フロントエンド**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **バックエンド**: FastAPI (Python), WebSockets
- **データベース**: PostgreSQL (Supabase)
- **ORM**: Prisma Client Python

---

## 📂 ディレクトリ構成

```text
party-quiz/
├── backend/          # FastAPI & PrismaによるバックエンドAPI・WebSocketサーバー
│   ├── app/          # APIルーター、状態管理(quiz_state.py)、WS管理(ws.py)、DB接続(db.py)
│   ├── prisma/       # データベーススキーマ (schema.prisma)
│   └── build.sh      # Renderデプロイ用ビルドスクリプト
├── frontend/         # Next.jsによるフロントエンドUI
│   └── src/app/
│       ├── (root)    # 参加者用 ログイン画面
│       ├── play/     # 参加者用 解答画面
│       ├── projector/# プロジェクター投影用画面
│       └── admin/    # 管理者用 進行パネル
└── docs/             # 各種ドキュメント・仕様書
```

---

## 🚀 環境構築と起動方法

### 前提条件
- Python 3.9 以上
- Node.js v18 以上
- PostgreSQL (ローカルまたはSupabase)

### Step 1: バックエンドのセットアップ
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# DBスキーマの反映とクライアント生成
prisma db push
prisma generate

# サーバーの起動
uvicorn app.main:app --reload
```

### Step 2: フロントエンドのセットアップ
```bash
cd frontend
npm install
npm run dev
```

---

## 🎮 クイズ進行の流れ

1. **[管理者] 部屋の作成**: 
   - 管理画面(`/admin`)で「新しい部屋を作成」を押し、パスコードを発行します。
2. **[参加者] 入室**: 
   - 参加者画面(`/`)でチーム名とパスコードを入力して入場します。
3. **[管理者] 問題作成・出題**:
   - 管理画面でリアルタイムに問題を入力し「リストに追加」→「出題」を押します。
4. **[参加者] 解答**:
   - スマホで倍率（x1~x3）を選び、解答を送信します。
5. **[管理者] 締め切り・発表**:
   - 管理画面で「締め切り」→「結果発表」を順に押すと、全員の画面に結果が表示されます。
