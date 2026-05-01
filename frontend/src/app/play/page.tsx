"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

interface Option {
  id: number;
  text: string;
  order: number;
}

interface Question {
  id: number;
  text: string;
  type: string;
  timeLimit: number;
  correctOption: number | null;
  options: Option[];
}

export default function PlayPage() {
  const router = useRouter();
  const { wsMessage } = useWebSocket(WS_URL);

  const [teamInfo, setTeamInfo] = useState<{ id: number; name: string } | null>(null);
  const [bets3x, setBets3x] = useState(1); // 3倍残り回数
  const [bets2x, setBets2x] = useState(2); // 2倍残り回数

  const [gameState, setGameState] = useState<{ state: string; question_id: number | null }>({
    state: "waiting",
    question_id: null,
  });
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);

  const [selectedBet, setSelectedBet] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // マウント時にチーム情報取得
  useEffect(() => {
    const id = localStorage.getItem("teamId");
    const name = localStorage.getItem("teamName");
    const b3 = localStorage.getItem("bets3x");
    const b2 = localStorage.getItem("bets2x");
    if (!id || !name) {
      router.push("/");
      return;
    }
    setTeamInfo({ id: parseInt(id), name });
    if (b3) setBets3x(parseInt(b3));
    if (b2) setBets2x(parseInt(b2));

    // 現在の進行状態を復元
    fetchGameState(parseInt(id));
  }, [router]);

  const fetchGameState = async (teamId: number) => {
    try {
      const res = await fetch(`${API_URL}/state`, { cache: "no-store" });
      const data = await res.json();
      setGameState({ state: data.status, question_id: data.current_question_id });
      if (data.status === "answering" && data.started_at) {
        setStartTime(new Date(data.started_at).getTime());
      }
    } catch (e) {
      console.error(e);
    }
  };

  // WebSocketイベント処理
  useEffect(() => {
    if (!wsMessage) return;

    if (wsMessage.event === "question_started") {
      const q: Question = wsMessage.data.question;
      setGameState({ state: "answering", question_id: wsMessage.data.question_id });
      setCurrentQuestion(q);
      setStartTime(Date.now());
      setHasAnswered(false);
      setSelectedBet(null);
      setSubmitError("");
    } else if (wsMessage.event === "question_closed") {
      setGameState({ state: "closed", question_id: wsMessage.data.question_id });
    } else if (wsMessage.event === "answer_revealed") {
      setGameState({ state: "revealed", question_id: wsMessage.data.question_id });
    } else if (wsMessage.event === "quiz_finished") {
      setGameState({ state: "finished", question_id: null });
    }
  }, [wsMessage]);

  const submitAnswer = async (optionId: number) => {
    if (hasAnswered || !teamInfo || selectedBet === null) return;

    const timeTaken = (Date.now() - startTime) / 1000.0;

    try {
      const res = await fetch(`${API_URL}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamInfo.id,
          question_id: gameState.question_id,
          option_id: optionId,
          bet: selectedBet,
          time_taken: timeTaken,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "解答の送信に失敗しました");
      }

      const data = await res.json();
      // ベット残数をlocalStorageとstateに反映
      setBets3x(data.bets3x_remaining);
      setBets2x(data.bets2x_remaining);
      localStorage.setItem("bets3x", data.bets3x_remaining.toString());
      localStorage.setItem("bets2x", data.bets2x_remaining.toString());
      setHasAnswered(true);
    } catch (err: any) {
      setSubmitError(err.message);
    }
  };

  if (!teamInfo) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-white text-xl animate-pulse">Loading...</div>
    </div>
  );

  const betOptions = [
    { value: 3, label: "×3", remaining: bets3x, color: "from-red-500 to-red-700", textColor: "text-red-300" },
    { value: 2, label: "×2", remaining: bets2x, color: "from-orange-500 to-orange-700", textColor: "text-orange-300" },
    { value: 1, label: "×1", remaining: Infinity, color: "from-blue-500 to-blue-700", textColor: "text-blue-300" },
  ];

  const answerColors = [
    "from-red-600 to-red-800 border-red-500 hover:from-red-500 hover:to-red-700",
    "from-blue-600 to-blue-800 border-blue-500 hover:from-blue-500 hover:to-blue-700",
    "from-green-600 to-green-800 border-green-500 hover:from-green-500 hover:to-green-700",
    "from-yellow-600 to-yellow-800 border-yellow-500 hover:from-yellow-500 hover:to-yellow-700",
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col text-white">
      {/* ヘッダー */}
      <header className="bg-gray-900 border-b border-gray-700 p-4 flex justify-between items-center">
        <div>
          <div className="font-black text-blue-400 text-lg">{teamInfo.name}</div>
          <div className="text-xs text-gray-500">Party Quiz</div>
        </div>
        <div className={`text-xs font-bold px-3 py-1 rounded-full ${
          gameState.state === "answering" ? "bg-red-500/30 text-red-300 animate-pulse" :
          gameState.state === "finished" ? "bg-purple-500/30 text-purple-300" : "bg-gray-700 text-gray-400"
        }`}>
          {gameState.state === "answering" ? "⏳ 解答中" :
           gameState.state === "closed" ? "⏱ 締め切り" :
           gameState.state === "revealed" ? "✅ 結果発表" :
           gameState.state === "finished" ? "🎉 終了" : "待機中"}
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center p-4">
        {/* 待機中 */}
        {(gameState.state === "waiting" || gameState.state === "revealed") && (
          <div className="text-center p-8 max-w-sm w-full">
            <div className="text-7xl mb-6 animate-bounce">☕</div>
            <h2 className="text-2xl font-black text-gray-300">次の問題を待っています</h2>
            <p className="text-gray-500 mt-3 text-sm">プロジェクターの画面に注目してください</p>
            {/* ベット残数 */}
            <div className="mt-8 bg-gray-900 rounded-2xl border border-gray-700 p-4">
              <p className="text-xs text-gray-500 font-bold mb-3">あなたのベット残数</p>
              <div className="flex gap-3 justify-center">
                {betOptions.map(b => (
                  <div key={b.value} className={`text-center px-4 py-2 rounded-xl ${b.remaining <= 0 ? "opacity-40" : ""}`}>
                    <div className={`text-2xl font-black ${b.textColor}`}>{b.label}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {b.remaining === Infinity ? "∞" : `残${b.remaining}回`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 解答中 */}
        {gameState.state === "answering" && (
          <div className="w-full max-w-md space-y-4">
            {hasAnswered ? (
              <div className="text-center p-8 bg-green-900/30 border-2 border-green-500/50 rounded-2xl">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-black text-green-400">解答を送信しました！</h3>
                <p className="text-gray-400 mt-2 text-sm">結果発表をお待ちください</p>
              </div>
            ) : (
              <>
                {/* ステップ1: ベット選択 */}
                {selectedBet === null ? (
                  <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
                    <h3 className="font-black text-center text-lg mb-1 text-white">STEP 1: ベット倍率を選ぶ</h3>
                    <p className="text-center text-xs text-gray-500 mb-4">使い切ると選べなくなります</p>
                    {submitError && (
                      <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-lg mb-4">{submitError}</p>
                    )}
                    <div className="space-y-3">
                      {betOptions.map(b => {
                        const disabled = b.remaining <= 0;
                        return (
                          <button
                            key={b.value}
                            onClick={() => !disabled && setSelectedBet(b.value)}
                            disabled={disabled}
                            className={`w-full py-4 rounded-xl font-black text-xl border-2 transition-all transform active:scale-95 ${
                              disabled
                                ? "bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed"
                                : `bg-gradient-to-r ${b.color} border-transparent text-white shadow-lg hover:scale-105`
                            }`}
                          >
                            <span>{b.label}</span>
                            <span className="text-sm font-normal ml-3 opacity-80">
                              {disabled ? "使い切りました" : b.remaining === Infinity ? "何回でも使える" : `残り ${b.remaining} 回`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ステップ2: 選択肢を選ぶ */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-gray-900 rounded-xl border border-gray-700 px-4 py-3">
                      <span className="text-gray-400 text-sm">ベット倍率:</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-xl ${betOptions.find(b => b.value === selectedBet)?.textColor}`}>
                          ×{selectedBet}
                        </span>
                        <button
                          onClick={() => setSelectedBet(null)}
                          className="text-xs text-gray-500 hover:text-gray-300 underline"
                        >
                          変更
                        </button>
                      </div>
                    </div>

                    <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5">
                      <h3 className="font-black text-center text-lg mb-4 text-white">STEP 2: 答えを選ぶ</h3>
                      {submitError && (
                        <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-lg mb-4">{submitError}</p>
                      )}
                      {currentQuestion ? (
                        <div className="grid grid-cols-2 gap-3">
                          {currentQuestion.options.map((opt, i) => (
                            <button
                              key={opt.id}
                              onClick={() => submitAnswer(opt.id)}
                              className={`bg-gradient-to-br ${answerColors[i]} border-2 text-white font-black py-6 rounded-xl text-2xl shadow-lg transition-all transform active:scale-95 hover:scale-105`}
                            >
                              {String.fromCharCode(64 + opt.order)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {[1, 2, 3, 4].map((n, i) => (
                            <div key={n} className={`bg-gradient-to-br ${answerColors[i]} opacity-50 rounded-xl py-6 text-center text-2xl font-black text-white animate-pulse`}>
                              {String.fromCharCode(64 + n)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 締め切り後 */}
        {gameState.state === "closed" && (
          <div className="text-center p-8 max-w-sm w-full">
            <div className="text-7xl mb-6 animate-bounce">⏳</div>
            <h2 className="text-2xl font-black text-yellow-400">タイムアップ！</h2>
            <p className="text-gray-400 mt-3 text-sm">まもなく結果が発表されます</p>
          </div>
        )}

        {/* 終了 */}
        {gameState.state === "finished" && (
          <div className="text-center p-8 max-w-sm w-full bg-gray-900 rounded-2xl border border-yellow-500/30">
            <div className="text-7xl mb-6">🎉</div>
            <h2 className="text-3xl font-black text-yellow-400">大会終了！</h2>
            <p className="text-gray-300 mt-3 text-lg font-bold">お疲れさまでした！</p>
            <p className="text-gray-500 mt-2 text-sm">スクリーンで最終結果をご覧ください</p>
          </div>
        )}
      </main>
    </div>
  );
}
