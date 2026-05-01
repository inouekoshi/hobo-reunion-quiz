import requests
import time
import random

base_url = "http://127.0.0.1:8000/api"

def run_simulation():
    print("--- 1. API 稼働確認 ---")
    qs = requests.get(f"{base_url}/questions").json()
    print(f"  -> {len(qs)}問のデータを取得しました。")
    
    # チーム登録
    print("\n--- 2. テストチームの登録 ---")
    suffix = str(random.randint(1000, 9999))
    t1 = requests.post(f"{base_url}/teams", json={"name": f"TeamA_{suffix}", "passcode": "0000"}).json()
    t2 = requests.post(f"{base_url}/teams", json={"name": f"TeamB_{suffix}", "passcode": "0000"}).json()
    t1_id, t2_id = t1["id"], t2["id"]
    print(f"  -> {t1['name']} と {t2['name']} が参加しました。")

    # Q1 通常問題
    print("\n--- 3. 出題テスト（通常問題 - Q1） ---")
    requests.post(f"{base_url}/admin/start/1")
    q1 = next(q for q in qs if q["id"] == 1)
    correct_opt_id = q1["correctOption"]
    wrong_opt_id = next(o["id"] for o in q1["options"] if o["id"] != correct_opt_id)

    print("  -> TeamA: 5秒・正解・ベットx2（高得点獲得の予定）")
    requests.post(f"{base_url}/answers", json={
        "team_id": t1_id, "question_id": 1, "option_id": correct_opt_id, "bet": 2, "time_taken": 5.0
    })
    
    print("  -> TeamB: 10秒・不正解・ベットx3（大幅減点の予定）")
    requests.post(f"{base_url}/answers", json={
        "team_id": t2_id, "question_id": 1, "option_id": wrong_opt_id, "bet": 3, "time_taken": 10.0
    })

    requests.post(f"{base_url}/admin/reveal/1")
    
    print("\n🏆 Q1 終了時のスコア:")
    teams = requests.get(f"{base_url}/teams").json()
    for t in teams:
        if t["id"] in [t1_id, t2_id]:
            print(f"  - {t['name']}: {t['score']:.1f} pt")

    # Q2 マジョリティ問題
    print("\n--- 4. 出題テスト（マジョリティ問題 - Q2） ---")
    requests.post(f"{base_url}/admin/start/2")
    q2 = next(q for q in qs if q["id"] == 2)
    opt_id = q2["options"][0]["id"]

    print("  -> TeamA: ベットx1 / TeamB: ベットx3 （同じ回答で100%マイノリティなし）")
    requests.post(f"{base_url}/answers", json={
        "team_id": t1_id, "question_id": 2, "option_id": opt_id, "bet": 1, "time_taken": 2.0
    })
    requests.post(f"{base_url}/answers", json={
        "team_id": t2_id, "question_id": 2, "option_id": opt_id, "bet": 3, "time_taken": 2.0
    })

    requests.post(f"{base_url}/admin/reveal/2")
    
    print("\n🏆 Q2 終了時のスコア:")
    teams = requests.get(f"{base_url}/teams").json()
    for t in teams:
        if t["id"] in [t1_id, t2_id]:
            print(f"  - {t['name']}: {t['score']:.1f} pt")

if __name__ == "__main__":
    run_simulation()
