"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export default function ResultPage() {
  const { team_id } = useParams();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/teams/${team_id}/stats`);
        if (!res.ok) throw new Error("Stats not found");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (team_id) fetchStats();
  }, [team_id]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-xl">Loading...</p></div>;
  }

  if (!stats) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-xl">データが見つかりませんでした。</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-6 pb-20">
      <header className="mb-8 text-center pt-8">
        <h1 className="text-3xl font-extrabold text-blue-800 mb-2">{stats.team_name} チーム 戦績レポート</h1>
        <p className="text-gray-600">Welcome to Party Quiz クイズ大会</p>
      </header>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* サマリーカード */}
        <div className="bg-white rounded-2xl shadow-sm p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500 font-bold mb-1">最終順位</p>
            <p className="text-3xl font-black text-yellow-600">{stats.rank} <span className="text-lg">/ {stats.total_teams}位</span></p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500 font-bold mb-1">最終スコア</p>
            <p className="text-3xl font-black text-blue-600">{Math.round(stats.score)} <span className="text-lg">pt</span></p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500 font-bold mb-1">正答率</p>
            <p className="text-3xl font-black text-green-600">{stats.accuracy} <span className="text-lg">%</span></p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500 font-bold mb-1">平均解答速度</p>
            <p className="text-3xl font-black text-purple-600">{stats.avg_time} <span className="text-lg">秒</span></p>
          </div>
        </div>

        {/* 解答履歴リスト */}
        <h2 className="text-2xl font-bold mt-8 mb-4 border-b-2 border-gray-200 pb-2">解答履歴</h2>
        <div className="space-y-4">
          {stats.history.map((h: any, i: number) => (
            <div key={i} className={`p-5 rounded-xl border-l-4 shadow-sm bg-white ${
              h.is_correct ? 'border-green-500' : 'border-red-500'
            }`}>
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-500">Q{h.question_id}. {h.question_text}</span>
                <span className={`px-3 py-1 rounded text-xs font-bold ${
                  h.is_correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {h.is_correct ? '正解' : '不正解'}
                </span>
              </div>
              <div className="grid grid-cols-2 text-sm gap-2 text-gray-700 mt-4">
                <div><span className="text-gray-400">あなたの解答:</span> <span className="font-bold">{h.option_text}</span></div>
                <div><span className="text-gray-400">ベット倍率:</span> <span className="font-bold">x {h.bet}</span></div>
                {h.question_type === 'normal' && (
                  <div><span className="text-gray-400">解答速度:</span> <span className="font-bold">{h.time_taken.toFixed(2)} 秒</span></div>
                )}
                <div>
                  <span className="text-gray-400">獲得ポイント:</span> 
                  <span className={`font-bold ${h.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {h.points > 0 ? '+' : ''}{Math.round(h.points)} pt
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-8 text-center">
          <button 
            onClick={() => router.push("/")}
            className="text-blue-500 underline font-bold"
          >
            トップページへ戻る
          </button>
        </div>
      </div>
    </div>
  );
}
