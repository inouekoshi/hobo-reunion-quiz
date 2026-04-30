"use client";
import { useState, useEffect, useRef } from "react";
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

// スコアをアニメーションしながら表示するコンポーネント
function AnimatedScore({ target }: { target: number }) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    prev.current = to;
    const duration = 1200;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      setVal(Math.round(from + (to - from) * ease));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);

  return <>{val.toLocaleString()}</>;
}

// 全チーム勢力図コンポーネント
function Leaderboard({ teams, highlight = false }: { teams: Team[]; highlight?: boolean }) {
  if (teams.length === 0) {
    return (
      <div className="text-center text-gray-500 py-16">
        <div className="text-6xl mb-4 animate-pulse">⏳</div>
        <p className="text-3xl font-bold text-gray-400">参加者の入室を待っています...</p>
      </div>
    );
  }

  const maxScore = Math.max(...teams.map(t => t.score), 1);
  const rankColors = [
    "from-yellow-400 to-yellow-600",
    "from-gray-300 to-gray-500",
    "from-amber-500 to-amber-700",
  ];
  const barColors = [
    "from-yellow-400 to-yellow-500",
    "from-gray-300 to-gray-400",
    "from-amber-500 to-amber-600",
    "from-blue-400 to-blue-500",
    "from-green-400 to-green-500",
    "from-purple-400 to-purple-500",
    "from-pink-400 to-pink-500",
    "from-cyan-400 to-cyan-500",
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4">
      {highlight && (
        <h2 className="text-4xl font-black text-center text-yellow-400 mb-6 drop-shadow-[0_0_20px_rgba(250,204,21,0.6)]">
          🏆 LEADERBOARD
        </h2>
      )}
      {teams.map((team, i) => {
        const barWidth = maxScore > 0 ? Math.max((team.score / maxScore) * 100, 2) : 2;
        return (
          <div
            key={team.id}
            className={`flex items-center gap-4 ${highlight ? "animate-fade-in-up" : ""}`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            {/* 順位バッジ */}
            <div className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full font-black text-lg shadow-lg bg-gradient-to-br ${
              i < 3 ? rankColors[i] : "from-gray-700 to-gray-800"
            } ${i < 3 ? "text-gray-900" : "text-gray-400"}`}>
              {i + 1}
            </div>

            {/* 名前 + バー */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-black text-white text-xl truncate">{team.name}</span>
                <span className="font-mono font-black text-green-400 text-xl ml-4 flex-shrink-0">
                  <AnimatedScore target={Math.round(team.score)} />
                  <span className="text-sm text-gray-500 ml-1">pt</span>
                </span>
              </div>
              <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${barColors[i % barColors.length]} transition-all duration-1000 ease-out`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ProjectorPage() {
  const { wsMessage } = useWebSocket(WS_URL);

  const [gameState, setGameState] = useState<{ state: string; question_id: number | null }>({
    state: "waiting",
    question_id: null,
  });
  const [leaderboard, setLeaderboard] = useState<Team[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [revealData, setRevealData] = useState<{
    correct_option: number | null;
    option_vote_counts: Record<string, number>;
    question_type: string;
  } | null>(null);

  useEffect(() => {
    fetchInitialState();
  }, []);

  const fetchInitialState = async () => {
    try {
      const res = await fetch(`${API_URL}/state`);
      const data = await res.json();
      setGameState({ state: data.status, question_id: data.current_question_id });
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!wsMessage) return;

    if (wsMessage.event === "room_created" || wsMessage.event === "leaderboard_updated") {
      setLeaderboard(wsMessage.data.leaderboard || []);
    } else if (wsMessage.event === "question_started") {
      setGameState({ state: "answering", question_id: wsMessage.data.question_id });
      setCurrentQuestion(wsMessage.data.question);
      setRevealData(null);
    } else if (wsMessage.event === "question_closed") {
      setGameState({ state: "closed", question_id: wsMessage.data.question_id });
    } else if (wsMessage.event === "answer_revealed") {
      setGameState({ state: "revealed", question_id: wsMessage.data.question_id });
      setLeaderboard(wsMessage.data.leaderboard);
      setRevealData({
        correct_option: wsMessage.data.correct_option,
        option_vote_counts: wsMessage.data.option_vote_counts,
        question_type: wsMessage.data.question_type,
      });
    } else if (wsMessage.event === "quiz_finished") {
      setGameState({ state: "finished", question_id: null });
      setLeaderboard(wsMessage.data.leaderboard);
    }
  }, [wsMessage]);

  const optionBorderColors = ["border-red-500", "border-blue-500", "border-green-500", "border-yellow-500"];
  const optionTextColors = ["text-red-400", "text-blue-400", "text-green-400", "text-yellow-400"];
  const optionBgColors = ["bg-red-500/20", "bg-blue-500/20", "bg-green-500/20", "bg-yellow-500/20"];

  // 総得票数を計算
  const totalVotes = revealData
    ? Object.values(revealData.option_vote_counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden flex flex-col">
      {/* タイトルバー */}
      <div className="bg-gray-900 border-b border-gray-800 px-8 py-3 flex justify-between items-center">
        <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
          Hobo Reunion Quiz
        </h1>
        <span className={`text-sm font-bold px-4 py-1 rounded-full ${
          gameState.state === "answering" ? "bg-red-500/30 text-red-300 animate-pulse" :
          gameState.state === "revealed" ? "bg-green-500/30 text-green-300" :
          gameState.state === "finished" ? "bg-purple-500/30 text-purple-300" : "bg-gray-700 text-gray-400"
        }`}>
          {gameState.state === "answering" ? "📣 解答受付中" :
           gameState.state === "closed" ? "⏳ 集計中" :
           gameState.state === "revealed" ? "✅ 結果発表" :
           gameState.state === "finished" ? "🎉 大会終了" : "⏸ 待機中"}
        </span>
      </div>

      <div className="flex-grow flex">
        {/* ===== 出題中: 問題を大きく表示 + 右サイドに小さく順位 ===== */}
        {gameState.state === "answering" && currentQuestion && (
          <>
            {/* メイン: 問題 */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
              <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8 w-full max-w-4xl shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    currentQuestion.type === "majority" ? "bg-purple-500/30 text-purple-300" : "bg-blue-500/30 text-blue-300"
                  }`}>
                    {currentQuestion.type === "majority" ? "🤝 マジョリティ" : "🎯 通常クイズ"}
                  </span>
                  <span className="text-gray-500 text-sm">制限時間 {currentQuestion.timeLimit}秒</span>
                </div>
                <p className="text-5xl font-black text-white leading-tight">{currentQuestion.text}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full max-w-4xl">
                {currentQuestion.options.map((opt, i) => (
                  <div
                    key={opt.id}
                    className={`bg-gray-900 border-l-8 ${optionBorderColors[i]} p-6 rounded-xl shadow-xl`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`text-4xl font-black ${optionTextColors[i]}`}>
                        {String.fromCharCode(64 + opt.order)}.
                      </span>
                      <span className="text-2xl font-bold text-gray-100">{opt.text}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-2xl text-yellow-400 font-black animate-pulse">
                📱 お手元のスマホで解答してください！
              </p>
            </div>

            {/* サイドバー: 小さい順位表 */}
            <div className="w-72 bg-gray-900 border-l border-gray-800 p-4 overflow-y-auto">
              <p className="text-xs font-bold text-gray-500 mb-3">現在の順位</p>
              <div className="space-y-2">
                {leaderboard.map((team, i) => (
                  <div key={team.id} className="flex items-center gap-2">
                    <span className="text-xs font-black text-gray-500 w-4">{i + 1}</span>
                    <span className="flex-1 text-sm text-white font-bold truncate">{team.name}</span>
                    <span className="text-xs font-mono text-green-400">{Math.round(team.score)}pt</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ===== 集計中 ===== */}
        {gameState.state === "closed" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-8xl mb-6 animate-spin" style={{ animationDuration: "3s" }}>⏳</div>
            <p className="text-5xl font-black text-yellow-400 animate-pulse">集計中...</p>
          </div>
        )}

        {/* ===== 結果発表 ===== */}
        {gameState.state === "revealed" && currentQuestion && revealData && (
          <div className="flex-1 flex flex-col p-8">
            <h2 className="text-4xl font-black text-center mb-6 text-white">
              {revealData.question_type === "majority" ? "🤝 マジョリティ結果" : "🎯 正解発表！"}
            </h2>

            {/* 得票バー */}
            <div className="grid grid-cols-2 gap-4 mb-8 w-full max-w-5xl mx-auto">
              {currentQuestion.options.map((opt, i) => {
                const votes = revealData.option_vote_counts[opt.id.toString()] || 0;
                const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                const isCorrect = revealData.question_type === "normal" && revealData.correct_option === opt.order;
                return (
                  <div
                    key={opt.id}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      isCorrect ? "border-green-400 bg-green-900/30 shadow-[0_0_30px_rgba(74,222,128,0.3)]" :
                      `${optionBorderColors[i]} ${optionBgColors[i]}`
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-2xl font-black ${isCorrect ? "text-green-400" : optionTextColors[i]}`}>
                        {String.fromCharCode(64 + opt.order)}.
                      </span>
                      <span className="text-lg font-bold text-white flex-1">{opt.text}</span>
                      {isCorrect && <span className="text-2xl">✅</span>}
                    </div>
                    <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          isCorrect ? "bg-green-400" : `bg-gradient-to-r ${["from-red-400 to-red-500", "from-blue-400 to-blue-500", "from-green-400 to-green-500", "from-yellow-400 to-yellow-500"][i]}`
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">{votes}票</span>
                      <span className="text-sm font-black text-white">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* リーダーボード */}
            <div className="flex-1">
              <Leaderboard teams={leaderboard} highlight />
            </div>
          </div>
        )}

        {/* ===== 待機中 / 通常表示: 常時勢力図 ===== */}
        {(gameState.state === "waiting") && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-4xl">
              {leaderboard.length === 0 ? (
                <div className="text-center">
                  <div className="text-8xl mb-6 animate-bounce">🎯</div>
                  <p className="text-4xl font-black text-gray-400 animate-pulse">参加者を待っています...</p>
                  <p className="text-gray-600 text-lg mt-4">スマホからパスコードを入力して参加してください</p>
                </div>
              ) : (
                <Leaderboard teams={leaderboard} />
              )}
            </div>
          </div>
        )}

        {/* ===== 大会終了 ===== */}
        {gameState.state === "finished" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="text-center mb-10">
              <h2 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-600 mb-2 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)] animate-pulse">
                🎉 FINAL RESULTS 🎉
              </h2>
              <p className="text-xl text-gray-400">第71回 保々中学校同窓会 クイズ大会 — 最終結果</p>
            </div>
            <div className="w-full max-w-4xl">
              <Leaderboard teams={leaderboard} highlight />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
