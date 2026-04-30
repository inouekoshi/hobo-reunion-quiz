"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { QRCodeSVG } from "qrcode.react";

export default function PlayPage() {
  const router = useRouter();
  const [teamInfo, setTeamInfo] = useState<{ id: number, name: string } | null>(null);
  
  const { wsMessage } = useWebSocket("ws://127.0.0.1:8000/ws");
  const [gameState, setGameState] = useState<{ state: string, question_id: number | null }>({ 
    state: "waiting", 
    question_id: null 
  });

  const [bet, setBet] = useState<number>(1);
  const [startTime, setStartTime] = useState<number>(0);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // マウント時にlocalStorageからチーム情報取得とステータス復元
  useEffect(() => {
    const id = localStorage.getItem("teamId");
    const name = localStorage.getItem("teamName");
    if (!id || !name) {
      router.push("/");
    } else {
      setTeamInfo({ id: parseInt(id), name });
      fetchGameState();
    }
  }, [router]);

  const fetchGameState = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/state");
      const data = await res.json();
      setGameState({ state: data.status, question_id: data.current_question_id });
      // 如果正在回答，还需要获取 started_at 计算进度？
      // To simplify, if answering, just assume time is somewhat advanced or restart it.
      if (data.status === "answering" && data.started_at) {
        setStartTime(new Date(data.started_at).getTime());
      }
    } catch (e) {
      console.error(e);
    }
  };

  // WebSocketのメッセージに応じて状態を更新
  useEffect(() => {
    if (wsMessage) {
      if (wsMessage.event === "question_started") {
        setGameState({ state: "answering", question_id: wsMessage.data.question_id });
        setStartTime(Date.now()); // 計測開始
        setHasAnswered(false);    // 解答リセット
        setBet(1);                // ベットリセット
        setSubmitError("");
      } else if (wsMessage.event === "answer_revealed") {
        setGameState({ state: "revealed", question_id: wsMessage.data.question_id });
      } else if (wsMessage.event === "question_closed") {
        setGameState({ state: "closed", question_id: wsMessage.data.question_id });
      } else if (wsMessage.event === "quiz_finished") {
        setGameState({ state: "finished", question_id: null });
      }
    }
  }, [wsMessage]);

  const submitAnswer = async (optionId: number) => {
    if (hasAnswered) return;
    
    const timeTaken = (Date.now() - startTime) / 1000.0;
    
    try {
      const res = await fetch("http://127.0.0.1:8000/api/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamInfo?.id,
          question_id: gameState.question_id,
          option_id: optionId,
          bet: bet,
          time_taken: timeTaken
        })
      });

      if (!res.ok) {
        throw new Error("解答の送信に失敗しました");
      }

      setHasAnswered(true);
    } catch (err: any) {
      setSubmitError(err.message);
    }
  };

  if (!teamInfo) return <div>Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-4 text-black">
      <header className="bg-white shadow p-4 rounded-lg flex justify-between items-center mb-6">
        <div className="font-bold text-xl text-blue-600">{teamInfo.name} チーム</div>
        <div className="text-sm font-semibold px-3 py-1 bg-gray-200 rounded">
          {gameState.state === "answering" ? "⏳ 解答中" : 
           gameState.state === "closed" ? "⏳ タイムアップ" : 
           gameState.state === "finished" ? "🎉 終了" : "待機中"}
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center">
        {gameState.state === "waiting" && (
          <div className="text-center p-8 bg-white rounded-xl shadow-md">
            <div className="text-6xl mb-4 animate-bounce">☕</div>
            <h2 className="text-2xl font-bold text-gray-700">次の問題を待っています...</h2>
            <p className="text-gray-500 mt-2">プロジェクターの画面に注目してください</p>
          </div>
        )}

        {gameState.state === "answering" && (
          <div className="w-full max-w-md w-full animate-fade-in-up">
            <h2 className="text-3xl font-extrabold text-center mb-6">第 {gameState.question_id} 問 解答</h2>
            
            {submitError && <div className="bg-red-100 text-red-600 p-3 rounded mb-4">{submitError}</div>}

            {hasAnswered ? (
              <div className="text-center p-8 bg-green-50 border-2 border-green-500 rounded-xl shadow-md">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-2xl font-bold text-green-700">解答を受け付けました！</h3>
                <p className="text-green-600 mt-2">全員の解答が終わるまでお待ちください</p>
              </div>
            ) : (
              <>
                <div className="bg-white p-6 rounded-xl shadow-md mb-6">
                  <h3 className="font-bold text-gray-700 mb-3 text-center">倍率（ベッティング）を選択</h3>
                  <div className="flex gap-2">
                    {[1, 2, 3].map(b => (
                      <button
                        key={b}
                        onClick={() => setBet(b)}
                        className={`flex-1 py-3 font-bold text-lg rounded border-2 transition-all ${
                          bet === b 
                          ? 'bg-yellow-400 border-yellow-500 text-yellow-900 shadow-inner' 
                          : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200 hover:border-gray-300'
                        }`}
                      >
                        x {b}
                      </button>
                    ))}
                  </div>
                  {bet > 1 && (
                    <p className="text-xs text-red-500 font-bold mt-2 text-center">
                      ⚠️ 不正解の場合、マイナスも {bet} 倍になります！
                    </p>
                  )}
                </div>

                <div className="bg-white p-6 rounded-xl shadow-md">
                  <h3 className="font-bold text-gray-700 mb-3 text-center">答えを選択して送信</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {/* ここでは仮のモック選択肢として Option ID 1〜4 を置いています */}
                    {[1, 2, 3, 4].map(optId => (
                      <button
                        key={optId}
                        onClick={() => submitAnswer(optId)}
                        className="bg-blue-500 hover:bg-blue-600 shadow-md text-white font-extrabold text-2xl py-8 rounded-lg transition-transform transform hover:scale-105 active:scale-95"
                      >
                        {String.fromCharCode(64 + optId)} {/* A, B, C, D */}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {gameState.state === "closed" && (
          <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-sm w-full">
            <h2 className="text-3xl font-extrabold text-yellow-600 mb-4">タイムアップ！</h2>
            <p className="text-gray-600">
              まもなく結果が発表されます...<br/>スクリーンにご注目ください！
            </p>
          </div>
        )}

        {gameState.state === "revealed" && (
          <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-sm w-full">
            <h2 className="text-3xl font-extrabold text-gray-800 mb-4">結果発表！</h2>
            <p className="text-gray-600">
              {hasAnswered 
                ? "スクリーンで答え合わせをしましょう！"
                : "解答時間切れとなりました..."}
            </p>
          </div>
        )}

        {gameState.state === "finished" && (
          <div className="text-center p-8 bg-white rounded-xl shadow-md max-w-sm w-full animate-fade-in-up border-4 border-yellow-400">
            <h2 className="text-4xl font-extrabold text-yellow-500 mb-4">🎉 大会終了 🎉</h2>
            <p className="text-xl font-bold text-gray-700 mt-4">
              すべての問題が終了しました！<br />
              スクリーンで最終結果をご覧ください。
            </p>
            <div className="mt-8 flex flex-col items-center bg-gray-50 p-6 rounded-xl border border-gray-200">
              <p className="text-gray-800 font-bold mb-4">👇 あなたのチームの詳細戦績を見る</p>
              <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-100">
                <QRCodeSVG value={`${window.location.origin}/result/${teamInfo.id}`} size={160} />
              </div>
              <button 
                onClick={() => router.push(`/result/${teamInfo.id}`)}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors"
              >
                戦績ページを開く
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
