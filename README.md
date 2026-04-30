# Hobo Reunion Quiz (保々中学校同窓会 特別クイズシステム)

第71回保々中学校同窓会のために開発された、リアルタイム参加型のチーム対抗クイズ大会システムです。
スマホ/タブレットから参加する**参加者画面**、会場全体に投影する**プロジェクター画面**、進行を司る**管理者画面**が完全同期して動作します。

## 🌐 本番公開URL (デプロイ済み)

実際に以下のURLにアクセスして、システムを利用・テストすることができます。

- 📱 **参加者・解答画面**: [https://hobo-reunion-quiz.vercel.app/](https://hobo-reunion-quiz.vercel.app/)
- 💻 **プロジェクター画面**: [https://hobo-reunion-quiz.vercel.app/projector](https://hobo-reunion-quiz.vercel.app/projector)
- ⚙️ **管理者・司会者画面**: [https://hobo-reunion-quiz.vercel.app/admin](https://hobo-reunion-quiz.vercel.app/admin)

## ✨ 主な機能とクイズルール

1. **リアルタイム同期 (WebSockets)**
   - 管理者が「出題」ボタンを押すと、プロジェクターと全参加者の画面が瞬時に切り替わります。
2. **ベッティング（倍率選択）システム**
   - 解答前に「x1 / x2 / x3」の倍率を選択します。正解すれば高得点ですが、不正解の場合はマイナスも倍増します。
3. **解答速度ボーナス**
   - 早く正解を選んだチームほど、追加のボーナスポイント（最大50pt）を獲得できます。
4. **マジョリティ・ボーナス（価値観同調ゲーム）**
   - 正解のない問題に対し、会場全体の「多数派」を当てるゲームです。得票率がそのままポイントの倍率になります。
5. **ライブ・リーダーボード**
   - 問題が終わるたびに、プロジェクターに各チームの順位とスコアがアニメーション付きで表示されます。

## 🛠 技術スタック

- **フロントエンド (Frontend)**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **バックエンド (Backend)**: FastAPI (Python), WebSockets
- **データベース (Database)**: PostgreSQL (Docker)
- **ORM**: Prisma Client Python

---

## 📂 ディレクトリ構成

```text
hobo-reunion-quiz/
├── backend/          # FastAPI & PrismaによるバックエンドAPI・WebSocketサーバー
│   ├── app/          # APIルーター、クイズ進行状態管理(quiz_state.py)、WS管理(ws.py)
│   ├── prisma/       # データベーススキーマ (schema.prisma)
│   └── seed.py       # テスト問題投入用スクリプト
├── frontend/         # Next.jsによるフロントエンドUI
│   └── src/app/
│       ├── (root)    # 参加者用 スマホ向けログイン画面
│       ├── play/     # 参加者用 クイズ解答画面
│       ├── projector/# プロジェクター投影用 アニメーション画面
│       └── admin/    # 管理者用 進行コントロールパネル
└── docs/             # 企画書などのドキュメント
```

---

## 🚀 環境構築と起動方法

### 前提条件 (Prerequisites)
- Docker & Docker Compose
- Python 3.9 以上
- Node.js (v18以上推奨) & npm

### Step 1: データベースの起動
PostgreSQLをDockerで立ち上げます。
```bash
cd backend
docker-compose up -d
```

### Step 2: バックエンドの準備と起動
Python仮想環境を作成し、依存関係をインストール後、DBのマイグレーションを行います。
```bash
cd backend
python3 -m venv venv
source venv/bin/activate

# 依存パッケージのインストール
pip install fastapi uvicorn prisma pydantic requests

# PrismaによるDBテーブルの作成とクライアント生成
prisma db push
prisma generate

# テスト用シードデータ（サンプル問題）の投入
python seed.py

# サーバーの起動 (ポート8000)
uvicorn app.main:app --reload
```

### Step 3: フロントエンドの準備と起動
別のターミナルを開き、Next.jsを起動します。
```bash
cd frontend
npm install

# 開発サーバーの起動 (ポート3000)
npm run dev
```

---

## 🎮 アプリケーションの操作手順（テストプレイ）

ブラウザで以下の3つの画面を同時に開いて動作を確認できます（本番URL、またはローカル環境 `http://localhost:3000` どちらでも同様に操作できます）。

1. **[プロジェクター画面]** `https://hobo-reunion-quiz.vercel.app/projector`
   - 会場のスクリーンに映す想定の画面です。フルスクリーンにしておきます。
2. **[管理者画面]** `https://hobo-reunion-quiz.vercel.app/admin`
   - 司会者（管理者）が操作する画面。「出題」や「結果発表」をコントロールします。
3. **[参加者画面]** `https://hobo-reunion-quiz.vercel.app/`
   - チーム名（例: `Aチーム`）とパスコード（現在 `0000` など）を入力してログインします。

**【進行の流れ】**
1. 管理者画面から「出題」ボタンを押す。
2. プロジェクターと参加者画面が「解答受付中」に切り替わる。
3. 参加者画面で「倍率ベット」と「選択肢(A~D)」を選んで送信する。
4. 管理者画面から「解答終了＆発表」ボタンを押す。
5. プロジェクターにランキングが表示される。

## 🧪 テスト・シミュレーション
手動でポチポチ操作しなくても、API経由で一連の流れを通しテストするスクリプトを用意しています。
バックエンドが起動した状態で以下を実行してください。
```bash
cd backend
source venv/bin/activate
python test_sim.py
```
ターミナル上で、2つのテストチームによる通常問題とマジョリティ問題の採点ロジックが正しく機能しているか確認できます。
