from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from .main import prisma

router = APIRouter()

class TeamCreate(BaseModel):
    name: str
    passcode: str

@router.post("/teams")
async def create_team(team: TeamCreate):
    existing = await prisma.team.find_unique(where={"name": team.name})
    if existing:
        raise HTTPException(status_code=400, detail="Team name already exists")
    
    new_team = await prisma.team.create(
        data={
            "name": team.name,
            "passcode": team.passcode
        }
    )
    return new_team

@router.get("/teams")
async def get_teams():
    return await prisma.team.find_many(order={"score": "desc"})


from datetime import datetime
from .ws import manager
from .quiz_state import state

@router.get("/state")
async def get_state():
    """現在のクイズの進行ステータスを返す（リロード・再接続時の復帰用）"""
    return {
        "current_question_id": state.current_question_id,
        "status": state.status,
        "started_at": state.started_at.isoformat() if state.started_at else None
    }

@router.get("/questions")
async def get_questions():
    return await prisma.question.find_many(include={"options": True})

class AnswerSubmit(BaseModel):
    team_id: int
    question_id: int
    option_id: int
    bet: int
    time_taken: float

@router.post("/answers")
async def submit_answer(ans: AnswerSubmit):
    if state.current_question_id != ans.question_id or state.status != "answering":
        raise HTTPException(status_code=400, detail="Not currently accepting answers for this question")
    
    existing = await prisma.answer.find_first(
        where={
            "teamId": ans.team_id,
            "questionId": ans.question_id
        }
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already answered")

    answer = await prisma.answer.create(
        data={
            "teamId": ans.team_id,
            "questionId": ans.question_id,
            "optionId": ans.option_id,
            "bet": ans.bet,
            "timeTaken": ans.time_taken,
            "isCorrect": False
        }
    )
    return answer

@router.post("/admin/start/{question_id}")
async def start_question(question_id: int):
    state.current_question_id = question_id
    state.status = "answering"
    state.started_at = datetime.now()
    
    await manager.broadcast({
        "event": "question_started",
        "data": {"question_id": question_id}
    })
    return {"status": "started", "question_id": question_id}

@router.post("/admin/close/{question_id}")
async def close_question(question_id: int):
    """解答の受付を強制終了する（結果発表はまだしない）"""
    if state.current_question_id != question_id or state.status != "answering":
        raise HTTPException(status_code=400, detail="Cannot close at this state")
        
    state.status = "closed"
    await manager.broadcast({
        "event": "question_closed",
        "data": {"question_id": question_id}
    })
    return {"status": "closed", "question_id": question_id}

@router.post("/admin/reveal/{question_id}")
async def reveal_answer(question_id: int):
    if state.status == "revealed":
        return {"status": "already_revealed"}
        
    state.status = "revealed"
    
    # 1. 該当の問題と、提出された全解答を取得
    question = await prisma.question.find_unique(where={"id": question_id}, include={"options": True})
    answers = await prisma.answer.find_many(where={"questionId": question_id})
    
    BASE_SCORE = 100
    
    if question and question.type == "normal":
        # 通常問題の採点処理
        for ans in answers:
            is_correct = (ans.optionId == question.correctOption)
            if is_correct:
                # 速度ボーナス: (残り時間 / 制限時間) * 50pt
                speed_ratio = max(0, question.timeLimit - ans.timeTaken) / question.timeLimit
                speed_bonus = speed_ratio * 50
                points = (BASE_SCORE + speed_bonus) * ans.bet
            else:
                # 不正解ペナルティ（ベット数分マイナス）
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
        # マジョリティ問題の採点処理
        total_votes = len(answers)
        if total_votes > 0:
            option_counts = {}
            for ans in answers:
                option_counts[ans.optionId] = option_counts.get(ans.optionId, 0) + 1
            
            for ans in answers:
                count = option_counts.get(ans.optionId, 0)
                # 得票率をそのまま倍率にする (例: 60%なら 0.6)
                percentage = count / total_votes
                points = BASE_SCORE * ans.bet * percentage
                
                await prisma.answer.update(
                    where={"id": ans.id},
                    data={"isCorrect": True, "points": points} # マジョリティは全員正解扱いだが点数が傾斜する
                )
                await prisma.team.update(
                    where={"id": ans.teamId},
                    data={"score": {"increment": points}}
                )

    # 最新のランキングを取得
    teams = await prisma.team.find_many(order={"score": "desc"})

    # WebSocketで全員（とくにプロジェクター）に結果とランキングを配信
    await manager.broadcast({
        "event": "answer_revealed",
        "data": {
            "question_id": question_id,
            "question_type": question.type if question else "unknown",
            "correct_option": question.correctOption if question else None,
            "leaderboard": [t.model_dump() for t in teams]
        }
    })
    
    return {"status": "revealed", "question_id": question_id}

class ScoreUpdate(BaseModel):
    team_id: int
    score_delta: float

@router.post("/admin/score")
async def update_score(data: ScoreUpdate):
    """管理者が特定のチームのスコアを手動で増減させる（誤操作の修正用）"""
    team = await prisma.team.update(
        where={"id": data.team_id},
        data={"score": {"increment": data.score_delta}}
    )
    
    # スコア修正後、最新ランキングを再配信する
    teams = await prisma.team.find_many(order={"score": "desc"})
    await manager.broadcast({
        "event": "leaderboard_updated",
        "data": {
            "leaderboard": [t.model_dump() for t in teams]
        }
    })
    return team

@router.post("/admin/finish")
async def finish_quiz():
    """クイズ大会を終了し、最終表彰画面へ遷移させる"""
    state.status = "finished"
    teams = await prisma.team.find_many(order={"score": "desc"})
    await manager.broadcast({
        "event": "quiz_finished",
        "data": {
            "leaderboard": [t.model_dump() for t in teams]
        }
    })
    return {"status": "finished"}

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
    
    # 全チームを取得して順位を計算
    all_teams = await prisma.team.find_many(order={"score": "desc"})
    rank = 1
    for t in all_teams:
        if t.id == team_id:
            break
        rank += 1
        
    correct_count = sum(1 for a in answers if a.isCorrect)
    total_answers = len(answers)
    accuracy = (correct_count / total_answers * 100) if total_answers > 0 else 0
    
    normal_answers = [a for a in answers if a.question.type == "normal"]
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
            "question_text": a.question.text,
            "question_type": a.question.type,
            "option_text": option_text,
            "bet": a.bet,
            "time_taken": a.timeTaken,
            "is_correct": a.isCorrect,
            "points": a.points
        })

    return {
        "team_name": team.name,
        "score": team.score,
        "rank": rank,
        "total_teams": len(all_teams),
        "accuracy": round(accuracy, 1),
        "avg_time": round(avg_time, 2),
        "history": history
    }
