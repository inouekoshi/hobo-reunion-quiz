from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import random
import string

from .db import prisma
from .ws import manager
from .quiz_state import state

router = APIRouter()


# ─────────────────────────────────────────
# ユーティリティ
# ─────────────────────────────────────────

def generate_passcode(length: int = 5) -> str:
    """英大文字+数字のランダムコードを生成"""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


# ─────────────────────────────────────────
# ルーム管理
# ─────────────────────────────────────────

@router.post("/admin/room")
async def create_room():
    """管理者が部屋を作成し、パスコードを発行する"""
    # 既存の全部屋を非アクティブにする
    await prisma.room.update_many(where={}, data={"isActive": False})

    # 全データをリセット（チームは部屋ごとに管理するため）
    await prisma.answer.delete_many(where={})
    await prisma.option.delete_many(where={})
    await prisma.question.delete_many(where={})
    await prisma.team.delete_many(where={})

    # 状態リセット
    state.current_question_id = None
    state.status = "waiting"
    state.started_at = None
    state.room_id = None

    # 新しい部屋を作成
    passcode = generate_passcode()
    room = await prisma.room.create(data={"passcode": passcode})
    state.room_id = room.id

    # WebSocketで全員に通知
    await manager.broadcast({
        "event": "room_created",
        "data": {"room_id": room.id, "passcode": passcode}
    })

    return {"room_id": room.id, "passcode": passcode}


@router.get("/admin/room")
async def get_current_room():
    """現在アクティブな部屋を返す"""
    room = await prisma.room.find_first(where={"isActive": True}, order={"createdAt": "desc"})
    if not room:
        return {"room": None}
    teams = await prisma.team.find_many(where={"roomId": room.id}, order={"score": "desc"})
    return {"room": room.model_dump(), "teams": [t.model_dump() for t in teams]}


# ─────────────────────────────────────────
# チーム入室
# ─────────────────────────────────────────

class RoomJoin(BaseModel):
    team_name: str
    passcode: str


@router.post("/room/join")
async def join_room(data: RoomJoin):
    """パスコードでチームが部屋に入室する（新規チームは自動作成）"""
    room = await prisma.room.find_first(
        where={"passcode": data.passcode, "isActive": True}
    )
    if not room:
        raise HTTPException(status_code=404, detail="部屋が見つかりません。パスコードを確認してください。")

    # 既存チームを確認
    existing = await prisma.team.find_first(
        where={"name": data.team_name, "roomId": room.id}
    )
    if existing:
        # 再入室
        team = existing
    else:
        # 新規チームを作成
        team = await prisma.team.create(
            data={
                "name": data.team_name,
                "roomId": room.id,
                "score": 0,
                "bets3x": 1,
                "bets2x": 2,
            }
        )

    # リーダーボードを更新・配信
    teams = await prisma.team.find_many(where={"roomId": room.id}, order={"score": "desc"})
    await manager.broadcast({
        "event": "leaderboard_updated",
        "data": {"leaderboard": [t.model_dump() for t in teams]}
    })

    return {
        "team_id": team.id,
        "team_name": team.name,
        "room_id": room.id,
        "score": team.score,
        "bets3x": team.bets3x,
        "bets2x": team.bets2x,
    }


# ─────────────────────────────────────────
# チーム一覧・状態
# ─────────────────────────────────────────

@router.get("/teams")
async def get_teams():
    return await prisma.team.find_many(order={"score": "desc"})


@router.get("/state")
async def get_state():
    """現在のクイズ進行ステータスを返す（リロード・再接続時の復帰用）"""
    # 最新のリーダーボード
    leaderboard = []
    if state.room_id:
        teams = await prisma.team.find_many(where={"roomId": state.room_id}, order={"score": "desc"})
        leaderboard = [t.model_dump() for t in teams]

    return {
        "current_question_id": state.current_question_id,
        "status": state.status,
        "started_at": state.started_at.isoformat() if state.started_at else None,
        "room_id": state.room_id,
        "leaderboard": leaderboard,
    }


# ─────────────────────────────────────────
# 問題管理（リアルタイム入力）
# ─────────────────────────────────────────

class OptionCreate(BaseModel):
    text: str
    order: int


class QuestionCreate(BaseModel):
    text: str
    type: str  # "normal" or "majority"
    time_limit: int = 60
    correct_option: Optional[int] = None  # 通常問題のみ (1〜4)
    options: List[OptionCreate]


@router.post("/admin/questions")
async def create_question(data: QuestionCreate):
    """管理者がリアルタイムで問題を作成する"""
    if state.room_id is None:
        raise HTTPException(status_code=400, detail="先に部屋を作成してください。")
    if data.type == "normal" and data.correct_option is None:
        raise HTTPException(status_code=400, detail="通常問題には正解の選択肢が必要です。")

    question = await prisma.question.create(
        data={
            "text": data.text,
            "type": data.type,
            "timeLimit": data.time_limit,
            "correctOption": data.correct_option,
            "roomId": state.room_id,
            "options": {
                "create": [{"text": o.text, "order": o.order} for o in data.options]
            }
        }
    )

    # 作成した問題を選択肢付きで返す
    question_with_options = await prisma.question.find_unique(
        where={"id": question.id}, include={"options": True}
    )
    return question_with_options


@router.get("/admin/questions")
async def get_admin_questions():
    """管理者用: 現在の部屋の全問題リストを返す"""
    if state.room_id is None:
        return []
    return await prisma.question.find_many(
        where={"roomId": state.room_id},
        include={"options": True},
        order={"createdAt": "asc"}
    )


@router.get("/questions")
async def get_questions():
    """参加者・プロジェクター用: 現在の部屋の全問題を返す"""
    if state.room_id is None:
        return []
    return await prisma.question.find_many(
        where={"roomId": state.room_id},
        include={"options": True},
        order={"createdAt": "asc"}
    )


# ─────────────────────────────────────────
# クイズ進行
# ─────────────────────────────────────────

@router.post("/admin/start/{question_id}")
async def start_question(question_id: int):
    state.current_question_id = question_id
    state.status = "answering"
    state.started_at = datetime.now()

    question = await prisma.question.find_unique(
        where={"id": question_id}, include={"options": True}
    )

    await manager.broadcast({
        "event": "question_started",
        "data": {
            "question_id": question_id,
            "question": question.model_dump() if question else None,
        }
    })
    return {"status": "started", "question_id": question_id}


@router.post("/admin/close/{question_id}")
async def close_question(question_id: int):
    """解答の受付を終了する"""
    if state.current_question_id != question_id or state.status != "answering":
        raise HTTPException(status_code=400, detail="Cannot close at this state")

    state.status = "closed"

    # 現時点での回答数を取得して一緒に通知
    answer_count = await prisma.answer.count(where={"questionId": question_id})
    team_count = await prisma.team.count(where={"roomId": state.room_id}) if state.room_id else 0

    await manager.broadcast({
        "event": "question_closed",
        "data": {
            "question_id": question_id,
            "answer_count": answer_count,
            "team_count": team_count,
        }
    })
    return {"status": "closed", "question_id": question_id}


@router.post("/admin/reveal/{question_id}")
async def reveal_answer(question_id: int):
    if state.status == "revealed":
        return {"status": "already_revealed"}

    state.status = "revealed"

    question = await prisma.question.find_unique(where={"id": question_id}, include={"options": True})
    answers = await prisma.answer.find_many(where={"questionId": question_id})

    BASE_SCORE = 100

    if question and question.type == "normal":
        # オプションIDからorderへのマッピングを作成
        option_orders = {opt.id: opt.order for opt in question.options}
        
        for ans in answers:
            ans_order = option_orders.get(ans.optionId)
            is_correct = (ans_order == question.correctOption)
            
            if is_correct:
                speed_ratio = max(0, question.timeLimit - ans.timeTaken) / question.timeLimit
                speed_bonus = speed_ratio * 50
                points = (BASE_SCORE + speed_bonus) * ans.bet
            else:
                points = -(BASE_SCORE * ans.bet)

            await prisma.answer.update(
                where={"id": ans.id},
                data={"isCorrect": is_correct, "points": points}
            )
            await prisma.team.update(
                where={"id": ans.teamId},
                data={"score": {"increment": points}}
            )

    elif question and question.type == "majority":
        total_votes = len(answers)
        if total_votes > 0:
            option_counts: dict = {}
            for ans in answers:
                option_counts[ans.optionId] = option_counts.get(ans.optionId, 0) + 1

            for ans in answers:
                count = option_counts.get(ans.optionId, 0)
                percentage = count / total_votes
                points = BASE_SCORE * ans.bet * percentage

                await prisma.answer.update(
                    where={"id": ans.id},
                    data={"isCorrect": True, "points": points}
                )
                await prisma.team.update(
                    where={"id": ans.teamId},
                    data={"score": {"increment": points}}
                )

    # 最新リーダーボード取得
    teams = await prisma.team.find_many(
        where={"roomId": state.room_id} if state.room_id else {},
        order={"score": "desc"}
    )

    # 各オプションの得票数も計算
    option_vote_counts = {}
    for ans in answers:
        option_vote_counts[ans.optionId] = option_vote_counts.get(ans.optionId, 0) + 1

    await manager.broadcast({
        "event": "answer_revealed",
        "data": {
            "question_id": question_id,
            "question_type": question.type if question else "unknown",
            "correct_option": question.correctOption if question else None,
            "option_vote_counts": option_vote_counts,
            "leaderboard": [t.model_dump() for t in teams],
        }
    })

    return {"status": "revealed", "question_id": question_id}


@router.post("/admin/finish")
async def finish_quiz():
    """クイズ大会を終了し、最終表彰画面へ"""
    state.status = "finished"
    teams = await prisma.team.find_many(
        where={"roomId": state.room_id} if state.room_id else {},
        order={"score": "desc"}
    )
    await manager.broadcast({
        "event": "quiz_finished",
        "data": {"leaderboard": [t.model_dump() for t in teams]}
    })
    return {"status": "finished"}


# ─────────────────────────────────────────
# 解答送信
# ─────────────────────────────────────────

class AnswerSubmit(BaseModel):
    team_id: int
    question_id: int
    option_id: int
    bet: int
    time_taken: float


@router.post("/answers")
async def submit_answer(ans: AnswerSubmit):
    if state.current_question_id != ans.question_id or state.status != "answering":
        raise HTTPException(status_code=400, detail="現在この問題の解答を受け付けていません")

    existing = await prisma.answer.find_first(
        where={"teamId": ans.team_id, "questionId": ans.question_id}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already answered")

    # ベット残数チェック
    team = await prisma.team.find_unique(where={"id": ans.team_id})
    if not team:
        raise HTTPException(status_code=404, detail="チームが見つかりません")

    if ans.bet == 3:
        if team.bets3x <= 0:
            raise HTTPException(status_code=400, detail="3倍ベットの残り回数がありません")
        await prisma.team.update(where={"id": ans.team_id}, data={"bets3x": team.bets3x - 1})
    elif ans.bet == 2:
        if team.bets2x <= 0:
            raise HTTPException(status_code=400, detail="2倍ベットの残り回数がありません")
        await prisma.team.update(where={"id": ans.team_id}, data={"bets2x": team.bets2x - 1})
    elif ans.bet != 1:
        raise HTTPException(status_code=400, detail="無効なベット倍率です")

    answer = await prisma.answer.create(
        data={
            "teamId": ans.team_id,
            "questionId": ans.question_id,
            "optionId": ans.option_id,
            "bet": ans.bet,
            "timeTaken": ans.time_taken,
            "isCorrect": False,
        }
    )

    # ベット後の残数を返す
    updated_team = await prisma.team.find_unique(where={"id": ans.team_id})
    return {
        "answer_id": answer.id,
        "bets3x_remaining": updated_team.bets3x if updated_team else 0,
        "bets2x_remaining": updated_team.bets2x if updated_team else 0,
    }


# ─────────────────────────────────────────
# スコア手動調整
# ─────────────────────────────────────────

class ScoreUpdate(BaseModel):
    team_id: int
    score_delta: float


@router.post("/admin/score")
async def update_score(data: ScoreUpdate):
    team = await prisma.team.update(
        where={"id": data.team_id},
        data={"score": {"increment": data.score_delta}}
    )
    teams = await prisma.team.find_many(
        where={"roomId": state.room_id} if state.room_id else {},
        order={"score": "desc"}
    )
    await manager.broadcast({
        "event": "leaderboard_updated",
        "data": {"leaderboard": [t.model_dump() for t in teams]}
    })
    return team


# ─────────────────────────────────────────
# チーム戦績
# ─────────────────────────────────────────

@router.get("/teams/{team_id}/stats")
async def get_team_stats(team_id: int):
    team = await prisma.team.find_unique(where={"id": team_id})
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    answers = await prisma.answer.find_many(
        where={"teamId": team_id},
        include={"question": {"include": {"options": True}}},
        order={"createdAt": "asc"}
    )

    all_teams = await prisma.team.find_many(
        where={"roomId": team.roomId} if team.roomId else {},
        order={"score": "desc"}
    )
    rank = next((i + 1 for i, t in enumerate(all_teams) if t.id == team_id), len(all_teams))

    correct_count = sum(1 for a in answers if a.isCorrect)
    total_answers = len(answers)
    accuracy = (correct_count / total_answers * 100) if total_answers > 0 else 0

    normal_answers = [a for a in answers if a.question and a.question.type == "normal"]
    avg_time = sum(a.timeTaken for a in normal_answers) / len(normal_answers) if normal_answers else 0

    history = []
    for a in answers:
        option_text = "-"
        if a.question and a.question.options:
            for opt in a.question.options:
                if opt.id == a.optionId:
                    option_text = f"{chr(64 + opt.order)}. {opt.text}"
                    break
        history.append({
            "question_id": a.questionId,
            "question_text": a.question.text if a.question else "?",
            "question_type": a.question.type if a.question else "?",
            "option_text": option_text,
            "bet": a.bet,
            "time_taken": a.timeTaken,
            "is_correct": a.isCorrect,
            "points": a.points,
        })

    return {
        "team_name": team.name,
        "score": team.score,
        "rank": rank,
        "total_teams": len(all_teams),
        "accuracy": round(accuracy, 1),
        "avg_time": round(avg_time, 2),
        "history": history,
    }
