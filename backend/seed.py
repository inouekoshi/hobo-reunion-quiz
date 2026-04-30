"""
テスト用シードデータ投入スクリプト
(問題データのみ。チームは参加者が自分で入室する形式に変更したため、ここでは問題のみ投入。)
このスクリプトは reset_all エンドポイントからも呼び出されます。
"""
import asyncio
from prisma import Prisma
from app.quiz_state import state


async def seed_questions(prisma: Prisma, room_id: int):
    """指定した部屋にサンプル問題を投入する"""
    await prisma.option.delete_many()
    await prisma.question.delete_many()

    # 問題1 (通常問題)
    await prisma.question.create(
        data={
            "text": "保々中学校の思い出の場所といえば？",
            "type": "normal",
            "timeLimit": 45,
            "correctOption": 1,
            "roomId": room_id,
            "options": {
                "create": [
                    {"text": "体育館裏", "order": 1},
                    {"text": "図書室", "order": 2},
                    {"text": "中庭", "order": 3},
                    {"text": "屋上", "order": 4},
                ]
            }
        }
    )

    # 問題2 (マジョリティ問題)
    await prisma.question.create(
        data={
            "text": "中学時代、いちばん楽しかった行事は？（みんなと合わせろ！）",
            "type": "majority",
            "timeLimit": 60,
            "roomId": room_id,
            "options": {
                "create": [
                    {"text": "体育祭", "order": 1},
                    {"text": "文化祭・合唱コン", "order": 2},
                    {"text": "修学旅行", "order": 3},
                    {"text": "部活動の大会", "order": 4},
                ]
            }
        }
    )

    print("Seed questions created successfully!")


async def main():
    """スタンドアロン実行用: 既存の最新部屋にシードデータを投入"""
    prisma = Prisma()
    await prisma.connect()

    room = await prisma.room.find_first(where={"isActive": True}, order={"createdAt": "desc"})
    if not room:
        print("ERROR: No active room found. Create a room first via /api/admin/room")
    else:
        await seed_questions(prisma, room.id)

    await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
