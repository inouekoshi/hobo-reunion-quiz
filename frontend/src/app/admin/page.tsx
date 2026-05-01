"use client";

import { useState, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000/ws";

interface Team {
  id: number;
  name: string;
  score: number;
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

  const [room, setRoom] = useState<{ id: number; passcode: string } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [gameState, setGameState] = useState<{ state: string; question_id: number | null }>({
    state: "waiting",
    question_id: null,
  });

  // 問題作成フォーム
  const [newQ, setNewQ] = useState({
    text: "",
    type: "normal",
    timeLimit: 60,
    correctOption: 1,
    options: [
      { text: "", order: 1 },
      { text: "", order: 2 },
      { text: "", order: 3 },
      { text: "", order: 4 },
    ],
  });

  // 初期ロード
  useEffect(() => {
    fetchInitialState();
  }, []);

  const fetchInitialState = async () => {
    try {
      const res = await fetch(`${API_URL}/state`);
      const data = await res.json();
      setGameState({ state: data.status, question_id: data.current_question_id });
      if (data.leaderboard) setTeams(data.leaderboard);

      // アクティブな部屋を取得
      const roomRes = await fetch(`${API_URL}/admin/room`);
      const roomData = await roomRes.json();
      if (roomData && roomData.room) {
        setRoom(roomData.room);
        // 部屋の問題リストも取得
        fetchQuestions(roomData.room.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchQuestions = async (roomId: number) => {
    try {
      const res = await fetch(`${API_URL}/admin/questions?room_id=${roomId}`);
      const data = await res.json();
      setQuestions(data);
    } catch (e) {
      console.error(e);
    }
  };

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
    if (!confirm("新しい部屋を作成します。既存のデータはすべてリセットされます。よろしいですか？")) return;
    const res = await fetch(`${API_URL}/admin/room`, { method: "POST" });
    const data = await res.json();
    if (data.error) {
      alert("エラーが発生しました: " + data.error);
      return;
    }
    setRoom({ id: data.room_id, passcode: data.passcode });
    setTeams([]);
    setQuestions([]);
    setGameState({ state: "waiting", question_id: null });
  };

  const copyPasscode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.passcode);
    alert("パスコードをコピーしました: " + room.passcode);
  };

  const addQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    try {
      const res = await fetch(`${API_URL}/admin/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newQ, roomId: room.id }),
      });
      if (res.ok) {
        fetchQuestions(room.id);
        setNewQ({
          ...newQ,
          text: "",
          options: newQ.options.map(o => ({ ...o, text: "" })),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startQuestion = async (qId: number) => {
    if (!confirm(`第${questions.findIndex(q => q.id === qId) + 1}問を出題しますか？`)) return;
    await fetch(`${API_URL}/admin/start/${qId}`, { method: "POST" });
  };

  const closeQuestion = async (qId: number) => {
    if (!confirm("解答を締め切りますか？")) return;
    await fetch(`${API_URL}/admin/close/${qId}`, { method: "POST" });
  };

  const revealAnswer = async (qId: number) => {
    if (!confirm("正解・結果を発表しますか？")) return;
    await fetch(`${API_URL}/admin/reveal/${qId}`, { method: "POST" });
  };

  const finishQuiz = async () => {
    if (!confirm("クイズ大会を終了して最終結果を発表しますか？")) return;
    await fetch(`${API_URL}/admin/finish`, { method: "POST" });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* サイドバー: チーム一覧 */}
      <div className="w-80 bg-white border-r border-gray-200 p-6 flex flex-col">
        <h2 className="text-xl font-black text-gray-900 mb-6 flex items-center gap-2">
          👥 参加チーム
          <span className="bg-blue-100 text-blue-600 text-xs px-2 py-1 rounded-full">
            {teams.length}
          </span>
        </h2>
        <div className="flex-grow overflow-y-auto space-y-3">
          {teams.map((team, i) => (
            <div key={team.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex justify-between items-center">
              <div>
                <div className="text-xs text-gray-400 font-bold">RANK {i+1}</div>
                <div className="font-bold text-gray-800">{team.name}</div>
              </div>
              <div className="text-right">
                <div className="text-blue-600 font-black">{Math.round(team.score)}<span className="text-[10px] ml-0.5">pt</span></div>
              </div>
            </div>
          ))}
          {teams.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">まだ参加チームはいません</div>
          )}
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* 部屋管理セクション */}
          <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 mb-1">部屋の管理</h2>
                <p className="text-gray-500 text-sm">大会を開始するには部屋を作成してください</p>
              </div>
              <button
                onClick={createRoom}
                className="bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2"
              >
                ＋ 新しい部屋を作成
              </button>
            </div>

            {room ? (
              <div className="bg-blue-50 border-2 border-blue-100 rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <div className="text-blue-600 text-xs font-black uppercase tracking-wider mb-1">Current Room Passcode</div>
                  <div className="text-4xl font-black text-blue-900 tracking-widest">{room.passcode}</div>
                </div>
                <button
                  onClick={copyPasscode}
                  className="bg-white text-blue-600 border border-blue-200 hover:bg-blue-100 px-4 py-2 rounded-xl font-bold transition-all"
                >
                  📋 コピーする
                </button>
              </div>
            ) : (
              <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
                部屋が作成されていません
              </div>
            )}
          </section>

          {/* 問題作成フォーム */}
          {room && (
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-2xl font-black text-gray-900 mb-6">問題を作成する</h2>
              <form onSubmit={addQuestion} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-600 mb-2">問題文</label>
                  <textarea
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[100px] font-bold text-lg"
                    value={newQ.text}
                    onChange={e => setNewQ({ ...newQ, text: e.target.value })}
                    placeholder="例: 保々中学校が創立されたのはいつ？"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2">クイズ形式</label>
                    <select
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold"
                      value={newQ.type}
                      onChange={e => setNewQ({ ...newQ, type: e.target.value })}
                    >
                      <option value="normal">🎯 通常クイズ (正解あり)</option>
                      <option value="majority">🤝 マジョリティ (多数派が正解)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2">制限時間 (秒)</label>
                    <input
                      type="number"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 font-bold"
                      value={newQ.timeLimit}
                      onChange={e => setNewQ({ ...newQ, timeLimit: parseInt(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-600">選択肢と正解</label>
                  <div className="grid grid-cols-2 gap-4">
                    {newQ.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="correct"
                          className="w-5 h-5 text-blue-600"
                          checked={newQ.correctOption === i + 1}
                          onChange={() => setNewQ({ ...newQ, correctOption: i + 1 })}
                          disabled={newQ.type === "majority"}
                        />
                        <input
                          type="text"
                          required
                          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold"
                          placeholder={`選択肢 ${String.fromCharCode(65 + i)}`}
                          value={opt.text}
                          onChange={e => {
                            const opts = [...newQ.options];
                            opts[i].text = e.target.value;
                            setNewQ({ ...newQ, options: opts });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 transition-all"
                >
                  📋 問題リストに追加
                </button>
              </form>
            </section>
          )}

          {/* 問題リスト & 進行管理 */}
          {room && (
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black text-gray-900">問題リスト</h2>
                <button
                  onClick={finishQuiz}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all"
                >
                  🏁 大会を終了する
                </button>
              </div>

              <div className="space-y-4">
                {questions.map((q, idx) => {
                  const isCurrent = gameState.question_id === q.id;
                  return (
                    <div key={q.id} className={`border-2 rounded-2xl p-6 transition-all ${
                      isCurrent ? "border-blue-500 bg-blue-50/50" : "border-gray-100 hover:border-gray-200"
                    }`}>
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="bg-gray-900 text-white text-[10px] font-black px-2 py-0.5 rounded">Q{idx+1}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                              q.type === "majority" ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                            }`}>
                              {q.type === "majority" ? "MAJORITY" : "NORMAL"}
                            </span>
                          </div>
                          <p className="font-black text-gray-800 text-lg leading-tight mb-4">{q.text}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {q.options.map((o, i) => (
                              <div key={o.id} className={`text-xs px-3 py-1.5 rounded-lg border ${
                                q.type === "normal" && q.correctOption === i + 1 ? "bg-green-50 border-green-200 text-green-700 font-bold" : "bg-white border-gray-100 text-gray-500"
                              }`}>
                                {String.fromCharCode(65 + i)}. {o.text}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          {gameState.state === "waiting" || gameState.state === "revealed" ? (
                            <button
                              onClick={() => startQuestion(q.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all"
                            >
                              ▶ 出題
                            </button>
                          ) : isCurrent && gameState.state === "answering" ? (
                            <button
                              onClick={() => closeQuestion(q.id)}
                              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all"
                            >
                              ⏱ 締め切り
                            </button>
                          ) : isCurrent && gameState.state === "closed" ? (
                            <button
                              onClick={() => revealAnswer(q.id)}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all"
                            >
                              🎯 結果発表
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {questions.length === 0 && (
                  <div className="text-center py-10 text-gray-400">問題がありません。上のフォームから作成してください。</div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
