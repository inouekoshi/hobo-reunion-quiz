"use client";
import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

interface Team {
  id: number;
  name: string;
  score: number;
  bets3x: number;
  bets2x: number;
}

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

export default function AdminPage() {
  const { wsMessage } = useWebSocket(WS_URL);

  // 部屋・チーム
  const [room, setRoom] = useState<{ id: number; passcode: string } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [copied, setCopied] = useState(false);

  // ゲーム状態
  const [gameState, setGameState] = useState<{ state: string; question_id: number | null }>({
    state: "waiting",
    question_id: null,
  });

  // 問題作成フォーム
  const [newQ, setNewQ] = useState({
    text: "",
    type: "normal" as "normal" | "majority",
    timeLimit: 60,
    correctOption: 1,
    options: ["", "", "", ""],
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [roomRes, stateRes, qRes] = await Promise.all([
        fetch(`${API_URL}/admin/room`),
        fetch(`${API_URL}/state`),
        fetch(`${API_URL}/admin/questions`),
      ]);
      const roomData = await roomRes.json();
      const stateData = await stateRes.json();
      const qData = await qRes.json();

      if (roomData.room) setRoom(roomData.room);
      if (roomData.teams) setTeams(roomData.teams);
      setGameState({ state: stateData.status, question_id: stateData.current_question_id });
      setQuestions(Array.isArray(qData) ? qData : []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // WebSocketイベント処理
  useEffect(() => {
    if (!wsMessage) return;
    if (wsMessage.event === "leaderboard_updated") {
      setTeams(wsMessage.data.leaderboard);
    } else if (wsMessage.event === "question_started") {
      setGameState({ state: "answering", question_id: wsMessage.data.question_id });
    } else if (wsMessage.event === "question_closed") {
      setGameState({ state: "closed", question_id: wsMessage.data.question_id });
    } else if (wsMessage.event === "answer_revealed") {
      setGameState({ state: "revealed", question_id: wsMessage.data.question_id });
      setTeams(wsMessage.data.leaderboard);
    } else if (wsMessage.event === "quiz_finished") {
      setGameState({ state: "finished", question_id: null });
      setTeams(wsMessage.data.leaderboard);
    }
  }, [wsMessage]);

  const createRoom = async () => {
    // if (!confirm("新しい部屋を作成します。既存のデータはすべてリセットされます。よろしいですか？")) return;
    const res = await fetch(`${API_URL}/admin/room`, { method: "POST" });
    const data = await res.json();
    if (data.error) {
      alert("Backend Error: " + data.error + "\n" + (data.traceback || ""));
      return;
    }
    setRoom(data);
    setTeams([]);
    setQuestions([]);
    setGameState({ state: "waiting", question_id: null });
  };

  const copyPasscode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.passcode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createQuestion = async () => {
    setCreateError("");
    if (!newQ.text.trim()) { setCreateError("問題文を入力してください"); return; }
    if (newQ.options.some(o => !o.trim())) { setCreateError("選択肢を全て入力してください"); return; }
    if (newQ.type === "normal" && !newQ.correctOption) { setCreateError("正解を選択してください"); return; }

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/admin/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: newQ.text,
          type: newQ.type,
          time_limit: newQ.timeLimit,
          correct_option: newQ.type === "normal" ? newQ.correctOption : null,
          options: newQ.options.map((t, i) => ({ text: t, order: i + 1 })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "作成に失敗しました");
      }
      const created = await res.json();
      setQuestions(prev => [...prev, created]);
      setNewQ({ text: "", type: "normal", timeLimit: 60, correctOption: 1, options: ["", "", "", ""] });
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const startQuestion = async (qId: number) => {
    // if (!confirm(`第${questions.findIndex(q => q.id === qId) + 1}問を出題しますか？`)) return;
    await fetch(`${API_URL}/admin/start/${qId}`, { method: "POST" });
  };

  const closeQuestion = async (qId: number) => {
    // if (!confirm("解答を締め切りますか？")) return;
    await fetch(`${API_URL}/admin/close/${qId}`, { method: "POST" });
  };

  const revealAnswer = async (qId: number) => {
    // if (!confirm("正解・結果を発表しますか？")) return;
    await fetch(`${API_URL}/admin/reveal/${qId}`, { method: "POST" });
  };

  const finishQuiz = async () => {
    // if (!confirm("クイズ大会を終了して最終結果を発表しますか？")) return;
    await fetch(`${API_URL}/admin/finish`, { method: "POST" });
  };

  const currentQ = questions.find(q => q.id === gameState.question_id);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ヘッダー */}
        <header className="flex flex-wrap justify-between items-center gap-4 bg-gray-900 p-5 rounded-2xl border border-gray-700 shadow-xl">
          <div>
            <h1 className="text-3xl font-black text-blue-400">⚙️ 管理者パネル</h1>
            <p className="text-gray-400 text-sm mt-1">Hobo Reunion Quiz — 進行コントロール</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">ステータス:</span>
            <span className={`px-4 py-2 rounded-full font-bold text-sm ${
              gameState.state === "answering" ? "bg-red-500 animate-pulse" :
              gameState.state === "closed" ? "bg-yellow-500" :
              gameState.state === "revealed" ? "bg-green-500" :
              gameState.state === "finished" ? "bg-purple-600" : "bg-gray-600"
            }`}>
              {gameState.state === "answering" ? `📣 第${gameState.question_id}問 解答受付中` :
               gameState.state === "closed" ? `⏳ 第${gameState.question_id}問 締め切り済み` :
               gameState.state === "revealed" ? `✅ 第${gameState.question_id}問 結果発表済み` :
               gameState.state === "finished" ? "🎉 大会終了" : "⏸ 待機中"}
            </span>
            {gameState.state !== "finished" && room && (
              <button
                onClick={finishQuiz}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-5 rounded-lg shadow transition-colors"
              >
                🏁 大会終了
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左列: 部屋管理 + 参加チーム */}
          <div className="lg:col-span-1 space-y-6">
            {/* 部屋パネル */}
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 shadow-xl">
              <h2 className="text-lg font-black text-white mb-4">🚪 部屋管理</h2>
              <button
                onClick={createRoom}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg transition-colors text-lg"
              >
                ＋ 新しい部屋を作成
              </button>
              {room && (
                <div className="mt-4 bg-gray-800 rounded-xl p-4 border border-blue-500/30">
                  <p className="text-gray-400 text-xs font-bold mb-2">参加パスコード</p>
                  <div className="flex items-center gap-3">
                    <span className="text-5xl font-black text-blue-400 tracking-widest font-mono">
                      {room.passcode}
                    </span>
                    <button
                      onClick={copyPasscode}
                      className={`text-sm px-3 py-2 rounded-lg font-bold transition-colors ${
                        copied ? "bg-green-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                      }`}
                    >
                      {copied ? "✓ コピー済み" : "コピー"}
                    </button>
                  </div>
                  <p className="text-gray-500 text-xs mt-3">このコードを参加者に伝えてください</p>
                </div>
              )}
            </div>

            {/* 参加チーム */}
            <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 shadow-xl">
              <h2 className="text-lg font-black text-white mb-4">
                👥 参加チーム
                <span className="ml-2 text-sm font-normal text-gray-400">({teams.length} チーム)</span>
              </h2>
              {teams.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">まだ参加者がいません</p>
              ) : (
                <div className="space-y-2">
                  {teams.map((t, i) => (
                    <div key={t.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-black w-6 h-6 flex items-center justify-center rounded-full ${
                          i === 0 ? "bg-yellow-400 text-yellow-900" :
                          i === 1 ? "bg-gray-300 text-gray-900" :
                          i === 2 ? "bg-amber-600 text-white" : "bg-gray-700 text-gray-400"
                        }`}>{i + 1}</span>
                        <span className="font-bold text-white text-sm">{t.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-green-400 font-mono font-bold">{Math.round(t.score)}pt</span>
                        <div className="text-xs text-gray-500 mt-0.5">
                          3倍:残{t.bets3x} / 2倍:残{t.bets2x}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右列: 問題作成 + 問題リスト */}
          <div className="lg:col-span-2 space-y-6">
            {/* 問題作成フォーム */}
            {room && (
              <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 shadow-xl">
                <h2 className="text-lg font-black text-white mb-4">✏️ 問題を作成する</h2>

                {/* 問題タイプ選択 */}
                <div className="flex gap-3 mb-4">
                  {(["normal", "majority"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNewQ(prev => ({ ...prev, type: t }))}
                      className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${
                        newQ.type === t
                          ? t === "normal" ? "bg-blue-600 text-white" : "bg-purple-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {t === "normal" ? "🎯 通常クイズ" : "🤝 マジョリティ"}
                    </button>
                  ))}
                </div>

                {/* 問題文 */}
                <textarea
                  className="w-full bg-gray-800 border border-gray-600 rounded-xl p-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none mb-4"
                  rows={2}
                  placeholder="問題文を入力..."
                  value={newQ.text}
                  onChange={e => setNewQ(prev => ({ ...prev, text: e.target.value }))}
                />

                {/* 選択肢 */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {newQ.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`text-sm font-black w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${
                        ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-yellow-500"][i]
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        className="flex-1 bg-gray-800 border border-gray-600 rounded-lg p-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none text-sm"
                        placeholder={`選択肢 ${String.fromCharCode(65 + i)}`}
                        value={opt}
                        onChange={e => {
                          const opts = [...newQ.options];
                          opts[i] = e.target.value;
                          setNewQ(prev => ({ ...prev, options: opts }));
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* 正解選択 (通常のみ) */}
                {newQ.type === "normal" && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-400 font-bold mb-2">正解を選択:</p>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setNewQ(prev => ({ ...prev, correctOption: n }))}
                          className={`flex-1 py-2 rounded-lg font-black transition-colors ${
                            newQ.correctOption === n
                              ? "bg-green-500 text-white"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                          }`}
                        >
                          {String.fromCharCode(64 + n)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 制限時間 */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm text-gray-400 font-bold whitespace-nowrap">制限時間:</span>
                  {[30, 45, 60, 90].map(s => (
                    <button
                      key={s}
                      onClick={() => setNewQ(prev => ({ ...prev, timeLimit: s }))}
                      className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                        newQ.timeLimit === s ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {s}秒
                    </button>
                  ))}
                </div>

                {createError && (
                  <p className="text-red-400 text-sm bg-red-900/30 p-3 rounded-lg mb-4">{createError}</p>
                )}

                <button
                  onClick={createQuestion}
                  disabled={creating}
                  className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl shadow-lg transition-colors text-lg"
                >
                  {creating ? "作成中..." : "📋 問題リストに追加"}
                </button>
              </div>
            )}

            {/* 問題リスト */}
            {room && (
              <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 shadow-xl">
                <h2 className="text-lg font-black text-white mb-4">
                  📝 問題リスト
                  <span className="ml-2 text-sm font-normal text-gray-400">({questions.length} 問)</span>
                </h2>
                {questions.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-6">まだ問題がありません。上のフォームから追加してください。</p>
                ) : (
                  <div className="space-y-4">
                    {questions.map((q, idx) => {
                      const isActive = gameState.question_id === q.id;
                      return (
                        <div
                          key={q.id}
                          className={`rounded-xl border-2 p-4 transition-all ${
                            isActive ? "border-blue-500 bg-blue-900/20" : "border-gray-700 bg-gray-800"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-gray-400">第{idx + 1}問</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                  q.type === "majority" ? "bg-purple-500/30 text-purple-300" : "bg-blue-500/30 text-blue-300"
                                }`}>
                                  {q.type === "majority" ? "マジョリティ" : "通常"}
                                </span>
                                <span className="text-xs text-gray-500">{q.timeLimit}秒</span>
                                {q.type === "normal" && (
                                  <span className="text-xs text-green-400 font-bold">
                                    正解: {q.correctOption ? String.fromCharCode(64 + q.correctOption) : "?"}
                                  </span>
                                )}
                              </div>
                              <p className="text-white font-bold">{q.text}</p>
                              <div className="grid grid-cols-2 gap-1 mt-2">
                                {q.options.map(opt => (
                                  <span key={opt.id} className="text-xs text-gray-400">
                                    {String.fromCharCode(64 + opt.order)}. {opt.text}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => startQuestion(q.id)}
                              disabled={gameState.state === "answering"}
                              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                            >
                              ▶ 出題
                            </button>
                            <button
                              onClick={() => closeQuestion(q.id)}
                              disabled={gameState.state !== "answering" || !isActive}
                              className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                            >
                              ⏱ 解答締め切り
                            </button>
                            <button
                              onClick={() => revealAnswer(q.id)}
                              disabled={(gameState.state !== "answering" && gameState.state !== "closed") || !isActive}
                              className="bg-red-500 hover:bg-red-400 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                            >
                              🎯 結果発表
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!room && (
              <div className="bg-gray-900 rounded-2xl border border-dashed border-gray-600 p-12 text-center">
                <div className="text-5xl mb-4">🚪</div>
                <p className="text-gray-400 text-lg font-bold">まず「部屋を作成」してください</p>
                <p className="text-gray-600 text-sm mt-2">部屋を作成するとパスコードが発行されます</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
