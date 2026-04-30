"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export default function Home() {
  const [teamName, setTeamName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/room/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_name: teamName, passcode }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.detail || "入室できませんでした。");
        return;
      }

      const data = await res.json();
      localStorage.setItem("teamId", data.team_id.toString());
      localStorage.setItem("teamName", data.team_name);
      localStorage.setItem("bets3x", data.bets3x.toString());
      localStorage.setItem("bets2x", data.bets2x.toString());
      router.push("/play");
    } catch (err) {
      setError("サーバーに接続できません。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* ロゴ */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🎯</div>
          <h1 className="text-3xl font-black text-white leading-tight">
            Hobo Reunion
            <span className="block text-blue-400">Quiz</span>
          </h1>
          <p className="text-gray-400 text-sm mt-2">第71回 保々中学校同窓会</p>
        </div>

        {/* ログインカード */}
        <div className="bg-gray-900/80 backdrop-blur border border-gray-700 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-black text-white mb-5 text-center">チームで参加する</h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 p-3 rounded-xl text-sm mb-4 font-bold">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">チーム名</label>
              <input
                type="text"
                required
                autoComplete="off"
                className="w-full bg-gray-800 border-2 border-gray-600 rounded-xl p-3 text-white text-lg font-bold placeholder-gray-600 focus:border-blue-500 focus:outline-none transition-colors"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="例: 1組テーブルA"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">
                部屋パスコード
                <span className="text-gray-600 font-normal ml-2">（司会者に確認）</span>
              </label>
              <input
                type="text"
                required
                autoComplete="off"
                maxLength={6}
                className="w-full bg-gray-800 border-2 border-gray-600 rounded-xl p-3 text-white text-2xl font-black text-center tracking-widest placeholder-gray-600 focus:border-blue-500 focus:outline-none transition-colors uppercase"
                value={passcode}
                onChange={e => setPasscode(e.target.value.toUpperCase())}
                placeholder="XXXXX"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl text-xl shadow-lg transition-colors mt-2"
            >
              {loading ? "入室中..." : "入場する 🚀"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
