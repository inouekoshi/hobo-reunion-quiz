# API・WebSocket仕様書

## 1. 共通ベースURL
- バックエンドAPI: `/api`
- WebSocket: `/ws`

---

## 2. REST API 仕様

### 2.1. ルーム・チーム管理

#### `POST /api/admin/room` (管理者)
新しい部屋を作成し、5桁の英数字パスコードを発行します。
既存の部屋、チーム、解答データはすべて削除・非アクティブ化されます。
- **レスポンス**: `{"room_id": 1, "passcode": "ABC12"}`

#### `POST /api/room/join` (参加者)
パスコードを入力してチームとして入室します。
- **リクエスト**: `{"team_name": "チームA", "passcode": "ABC12"}`
- **レスポンス**: `Team` モデル情報（初期ベット残数 3x: 1, 2x: 2 を含む）

### 2.2. 問題管理

#### `POST /api/admin/questions` (管理者)
リアルタイムで新しい問題を追加します。
- **リクエスト**: `QuestionCreate` (text, type, time_limit, correct_option, options)

#### `GET /api/admin/questions` (管理者)
現在の部屋に紐づく全問題リストを取得します。

### 2.3. クイズ進行 (管理者)

#### `POST /api/admin/start/{question_id}`
出題を開始します。状態を `answering` に変更。

#### `POST /api/admin/close/{question_id}`
解答を締め切ります。状態を `closed` に変更。

#### `POST /api/admin/reveal/{question_id}`
正解・結果を発表します。採点を実行し、状態を `revealed` に変更。

#### `POST /api/admin/finish`
大会を終了し、最終結果（リーダーボード）を通知します。

### 2.4. 解答提出 (参加者)

#### `POST /api/answers`
- **リクエスト**:
  ```json
  {
    "team_id": 1,
    "question_id": 10,
    "option_id": 101,
    "bet": 3,
    "time_taken": 4.5
  }
  ```
- **バリデーション**:
  - 倍率（bet）の残り回数がチェックされます。足りない場合は 400 エラー。
  - すでに解答済みの場合も 400 エラー。

---

## 3. WebSocket 仕様

### 3.1. イベント一覧

| イベント名 | タイミング | 内容 |
|---|---|---|
| `room_created` | 部屋作成時 | 新しい部屋IDとパスコード |
| `question_started` | 出題開始時 | 問題文、選択肢、制限時間 |
| `question_closed` | 締め切り時 | 締め切られた旨の通知 |
| `answer_revealed` | 結果発表時 | 正解、得票数、最新リーダーボード |
| `leaderboard_updated` | チーム入室時 | 最新リーダーボード（入室状況確認用） |
| `quiz_finished` | 大会終了時 | 最終リーダーボード |

### 3.2. データ構造例 (answer_revealed)
```json
{
  "event": "answer_revealed",
  "data": {
    "question_id": 10,
    "question_type": "normal",
    "correct_option": 1,
    "option_vote_counts": { "101": 5, "102": 2 },
    "leaderboard": [
      { "id": 1, "name": "チームA", "score": 350 },
      ...
    ]
  }
}
```