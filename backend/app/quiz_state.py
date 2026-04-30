from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class GameState(BaseModel):
    current_question_id: Optional[int] = None
    status: str = "waiting" # waiting, answering, closed, revealed, finished
    started_at: Optional[datetime] = None
    room_id: Optional[int] = None

# インメモリで全体の進行状態を管理する
state = GameState()
