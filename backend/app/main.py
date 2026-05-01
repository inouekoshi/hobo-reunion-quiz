from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import prisma

app = FastAPI(title="Party Quiz API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://party-quiz.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import asyncio

@app.on_event("startup")
async def startup():
    # Renderのポートスキャン誤検知を防ぐためバックグラウンドで接続を開始
    async def connect_with_retry():
        try:
            await prisma.connect()
            print("Prisma connected successfully")
        except Exception as e:
            print(f"Prisma connection failed: {e}")

    asyncio.create_task(connect_with_retry())

@app.on_event("shutdown")
async def shutdown():
    await prisma.disconnect()

from .api import router as api_router
app.include_router(api_router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Welcome to Party Quiz API"}

from fastapi import WebSocket, WebSocketDisconnect
from .ws import manager

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # 必要に応じてクライアントからの直接メッセージを処理
    except WebSocketDisconnect:
        manager.disconnect(websocket)
