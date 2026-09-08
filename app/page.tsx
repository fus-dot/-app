"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

type ShiftType = "全休" | "A×" | "B×" | "特別休" | null;

interface ShiftRecord {
  user_name: string;
  year: number;
  month: number;
  date: number;
  request_type: string;
}

interface ConfirmedShift {
  id?: string;
  year: number;
  month: number;
  date: number;
  shift_type: "A" | "B";
  assigned_user: string;
}

interface StaffSetting {
  user_name: string;
  target_shifts: number;
  password?: string;
}

interface ShiftLog {
  id: string;
  year: number;
  month: number;
  action_type: string;
  description: string;
  created_at: string;
}

export default function ShiftApp() {
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth() + 1);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // ログイン画面用
  const [loginRole, setLoginRole] = useState<"staff" | "admin">("staff");
  const [selectedStaffForAuth, setSelectedStaffForAuth] = useState<string | null>(null);
  const [staffPasswordInput, setStaffPasswordInput] = useState<string>("");
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>("");

  // 新規スタッフ登録用
  const [newStaffRegisterInput, setNewStaffRegisterInput] = useState<string>("");
  const [newStaffPasswordInput, setNewStaffPasswordInput] = useState<string>("");

  // パスワード変更モーダル用
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState<boolean>(false);
  const [newPasswordUpdate, setNewPasswordUpdate] = useState<string>("");

  const [targetShifts, setTargetShifts] = useState<number>(6);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [requests, setRequests] = useState<Record<number, ShiftType>>({});
  const [allRequests, setAllRequests] = useState<ShiftRecord[]>([]);

  // 確定シフト ＆ 下書きシフト
  const [confirmedShifts, setConfirmedShifts] = useState<ConfirmedShift[]>([]);
  const [draftShifts, setDraftShifts] = useState<ConfirmedShift[]>([]);
  const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);

  // 変更履歴ログ
  const [logs, setLogs] = useState<ShiftLog[]>([]);

  const [staffSettings, setStaffSettings] = useState<StaffSetting[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [swapTargetUser, setSwapTargetUser] = useState<string>("");

  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();

  const knownStaff = Array.from(
    new Set([
      ...staffSettings.map((s) => s.user_name),
      ...allRequests.map((r) => r.user_name),
    ])
  ).filter((name) => name && name !== "管理者" && name !== "未定");

  useEffect(() => {
    const savedUser = localStorage.getItem("shift_app_current_user");
    const savedAdmin = localStorage.getItem("shift_app_is_admin") === "true";
    if (savedAdmin) {
      setIsAdmin(true);
      setCurrentUser("管理者");
    } else if (savedUser) {
      setCurrentUser(savedUser);
    }
    fetchStaffSettings();
  }, []);

  const fetchStaffSettings = async () => {
    const { data } = await supabase
      .from("staff_settings")
      .select("user_name, target_shifts, password")
      .order("created_at", { ascending: true });

    if (data) {
      setStaffSettings(data);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);

    // 1. 指定年月の希望を取得
    const { data: allData } = await supabase
      .from("shift_requests")
      .select("user_name, year, month, date, request_type")
      .eq("year", currentYear)
      .eq("month", currentMonth)
      .order("date", { ascending: true });

    if (allData) {
      setAllRequests(allData);
      if (currentUser && currentUser !== "管理者") {
        const userReqs: Record<number, ShiftType> = {};
        allData
          .filter((item) => item.user_name === currentUser)
          .forEach((item) => {
            userReqs[item.date] = item.request_type as ShiftType;
          });
        setRequests(userReqs);
      }
    } else {
      setRequests({});
    }

    // 2. 指定年月の確定シフトを取得
    const { data: confData } = await supabase
      .from("confirmed_shifts")
      .select("id, year, month, date, shift_type, assigned_user")
      .eq("year", currentYear)
      .eq("month", currentMonth)
      .order("date", { ascending: true });

    if (confData) {
      setConfirmedShifts(confData as ConfirmedShift[]);
      setDraftShifts(confData as ConfirmedShift[]);
    } else {
      setConfirmedShifts([]);
      setDraftShifts([]);
    }
    setIsEditingDraft(false);

    // 3. 指定年月の変更履歴ログを取得
    const { data: logData } = await supabase
      .from("shift_logs")
      .select("id, year, month, action_type, description, created_at")
      .eq("year", currentYear)
      .eq("month", currentMonth)
      .order("created_at", { ascending: false })
      .limit(20);

    if (logData) {
      setLogs(logData as ShiftLog[]);
    } else {
      setLogs([]);
    }

    await fetchStaffSettings();
    setLoading(false);
  };

  useEffect(() => {
    if (currentUser) {
      fetchAllData();
    }
  }, [currentUser, currentYear, currentMonth]);

  useEffect(() => {
    if (currentUser && currentUser !== "管理者") {
      const currentSetting = staffSettings.find((s) => s.user_name === currentUser);
      setTargetShifts(currentSetting ? currentSetting.target_shifts : 6);
    }
  }, [currentUser, staffSettings]);

  const fullLeaveCount = Object.values(requests).filter((t) => t === "全休").length;
  const remainingFullLeaves = 10 - fullLeaveCount;

  const insertLog = async (actionType: string, description: string) => {
    await supabase.from("shift_logs").insert({
      year: currentYear,
      month: currentMonth,
      action_type: actionType,
      description,
    });
  };

  const handleStaffLogin = () => {
    if (!selectedStaffForAuth) return;

    const staffData = staffSettings.find((s) => s.user_name === selectedStaffForAuth);
    const correctPassword = staffData?.password || "0000";

    if (staffPasswordInput === correctPassword) {
      setIsAdmin(false);
      setCurrentUser(selectedStaffForAuth);
      localStorage.setItem("shift_app_is_admin", "false");
      localStorage.setItem("shift_app_current_user", selectedStaffForAuth);
      setSelectedStaffForAuth(null);
      setStaffPasswordInput("");
    } else {
      alert("パスワードが正しくありません。（初期パスワード: 0000）");
    }
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === "admin123") {
      setIsAdmin(true);
      setCurrentUser("管理者");
      localStorage.setItem("shift_app_is_admin", "true");
      localStorage.setItem("shift_app_current_user", "管理者");
      setAdminPasswordInput("");
    } else {
      alert("管理者パスワードが正しくありません。");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    setCurrentUser(null);
    setSelectedStaffForAuth(null);
    setStaffPasswordInput("");
    localStorage.removeItem("shift_app_is_admin");
    localStorage.removeItem("shift_app_current_user");
    fetchStaffSettings();
  };

  const handleRegisterStaff = async () => {
    const trimmedName = newStaffRegisterInput.trim();
    const trimmedPass = newStaffPasswordInput.trim();

    if (!trimmedName) {
      alert("スタッフ名を入力してください。");
      return;
    }
    if (!trimmedPass) {
      alert("パスワードを設定してください。");
      return;
    }
    if (knownStaff.includes(trimmedName)) {
      alert("既に同名のスタッフが存在します。");
      return;
    }

    const { error } = await supabase.from("staff_settings").insert({
      user_name: trimmedName,
      target_shifts: 6,
      password: trimmedPass,
    });

    if (error) {
      alert("登録失敗: " + error.message);
      return;
    }

    alert(`「${trimmedName}」を登録しました。設定したパスワードでログインしてください。`);
    setNewStaffRegisterInput("");
    setNewStaffPasswordInput("");
    await fetchStaffSettings();
    setSelectedStaffForAuth(trimmedName);
  };

  const handleChangeMyPassword = async () => {
    if (!currentUser || currentUser === "管理者") return;
    const trimmed = newPasswordUpdate.trim();
    if (!trimmed) {
      alert("新しいパスワードを入力してください。");
      return;
    }

    const { error } = await supabase
      .from("staff_settings")
      .update({ password: trimmed })
      .eq("user_name", currentUser);

    if (error) {
      alert("更新エラー: " + error.message);
    } else {
      alert("パスワードを変更しました。");
      setShowPasswordChangeModal(false);
      setNewPasswordUpdate("");
      fetchStaffSettings();
    }
  };

  const handleDeleteStaff = async (targetStaff: string) => {
    if (!isAdmin) return;

    const ok = confirm(`「${targetStaff}」を完全に削除しますか？\n希望データ、確定枠、設定がすべて削除されます。`);
    if (!ok) return;

    setIsProcessing(true);

    await supabase.from("staff_settings").delete().eq("user_name", targetStaff);
    await supabase.from("shift_requests").delete().eq("user_name", targetStaff);
    await supabase
      .from("confirmed_shifts")
      .update({ assigned_user: "未定" })
      .eq("assigned_user", targetStaff);

    await insertLog("スタッフ削除", `管理者により「${targetStaff}」が削除されました`);

    setStaffSettings((prev) => prev.filter((s) => s.user_name !== targetStaff));
    setAllRequests((prev) => prev.filter((r) => r.user_name !== targetStaff));

    setIsProcessing(false);
    alert(`「${targetStaff}」を削除しました。`);
    fetchAllData();
  };

  const handleSaveTargetShifts = async (newVal: number) => {
    if (!currentUser || currentUser === "管理者") return;
    setTargetShifts(newVal);
    await supabase.from("staff_settings").upsert({
      user_name: currentUser,
      target_shifts: newVal,
    });
  };

  const handleSelectShift = async (type: ShiftType) => {
    if (selectedDate === null || !currentUser || currentUser === "管理者") return;

    if (type === "全休" && remainingFullLeaves <= 0 && requests[selectedDate] !== "全休") {
      alert("全休（×）は月10日までしか登録できません。");
      return;
    }

    if (type === null) {
      await supabase
        .from("shift_requests")
        .delete()
        .eq("user_name", currentUser)
        .eq("year", currentYear)
        .eq("month", currentMonth)
        .eq("date", selectedDate);
    } else {
      await supabase.from("shift_requests").upsert(
        {
          user_name: currentUser,
          year: currentYear,
          month: currentMonth,
          date: selectedDate,
          request_type: type,
        },
        { onConflict: "user_name,year,month,date" }
      );
    }

    setSelectedDate(null);
    fetchAllData();
  };

  const handleDirectSwap = async (shift: ConfirmedShift) => {
    if (!swapTargetUser) {
      alert("交代先のスタッフを選択してください。");
      return;
    }
    if (swapTargetUser === currentUser) {
      alert("自分自身以外を選択してください。");
      return;
    }

    const ok = confirm(
      `${selectedDate}日の【${shift.shift_type}勤】を「${swapTargetUser}」さんに交代しますか？`
    );
    if (!ok) return;

    const { error } = await supabase
      .from("confirmed_shifts")
      .update({ assigned_user: swapTargetUser })
      .eq("year", currentYear)
      .eq("month", currentMonth)
      .eq("date", shift.date)
      .eq("shift_type", shift.shift_type);

    if (error) {
      alert("交代エラー: " + error.message);
    } else {
      await insertLog(
        "勤務交代",
        `${shift.date}日 ${shift.shift_type}勤: ${currentUser} → ${swapTargetUser}`
      );

      alert("交代が完了しました！");
      setSwapTargetUser("");
      setSelectedDate(null);
      fetchAllData();
    }
  };

  const generateDraftShifts = () => {
    if (!isAdmin) return;

    if (knownStaff.length < 2) {
      alert("シフト生成には最低2名のスタッフが必要です。");
      return;
    }

    const maxTargetMap: Record<string, number> = {};
    const actualAssignedCount: Record<string, number> = {};
    knownStaff.forEach((s) => {
      const setting = staffSettings.find((st) => st.user_name === s);
      maxTargetMap[s] = setting ? setting.target_shifts : 6;
      actualAssignedCount[s] = 0;
    });

    const newDraft: ConfirmedShift[] = [];
    const shortageLog: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayReqs = allRequests.filter((r) => r.date === d);
      const workedYesterday = newDraft
        .filter((a) => a.date === d - 1)
        .map((a) => a.assigned_user);

      const getPriorityScore = (staff: string) => {
        let score = actualAssignedCount[staff];
        if (workedYesterday.includes(staff)) score += 5;
        return score;
      };

      // A勤
      const candidatesA = knownStaff.filter((staff) => {
        if (actualAssignedCount[staff] >= maxTargetMap[staff]) return false;
        const req = dayReqs.find((r) => r.user_name === staff)?.request_type;
        return req !== "全休" && req !== "特別休" && req !== "A×";
      });
      candidatesA.sort((a, b) => getPriorityScore(a) - getPriorityScore(b));

      let assignedA = "未定";
      if (candidatesA.length > 0) {
        assignedA = candidatesA[0];
        actualAssignedCount[assignedA]++;
      } else {
        shortageLog.push(`${d}日 A勤`);
      }
      newDraft.push({
        year: currentYear,
        month: currentMonth,
        date: d,
        shift_type: "A",
        assigned_user: assignedA,
      });

      // B勤
      const candidatesB = knownStaff.filter((staff) => {
        if (staff === assignedA) return false;
        if (actualAssignedCount[staff] >= maxTargetMap[staff]) return false;
        const req = dayReqs.find((r) => r.user_name === staff)?.request_type;
        return req !== "全休" && req !== "特別休" && req !== "B×";
      });
      candidatesB.sort((a, b) => getPriorityScore(a) - getPriorityScore(b));

      let assignedB = "未定";
      if (candidatesB.length > 0) {
        assignedB = candidatesB[0];
        actualAssignedCount[assignedB]++;
      } else {
        shortageLog.push(`${d}日 B勤`);
      }
      newDraft.push({
        year: currentYear,
        month: currentMonth,
        date: d,
        shift_type: "B",
        assigned_user: assignedB,
      });
    }

    setDraftShifts(newDraft);
    setIsEditingDraft(true);

    if (shortageLog.length > 0) {
      alert(`下書きを作成しました。\n※不足枠:\n${shortageLog.join(", ")}`);
    } else {
      alert("下書きを作成しました。表内から微調整し、「確定して保存」を押してください。");
    }
  };

  const handleUpdateSlot = (date: number, shiftType: "A" | "B", newStaff: string) => {
    setDraftShifts((prev) => {
      const exists = prev.some((s) => s.date === date && s.shift_type === shiftType);
      if (exists) {
        return prev.map((s) =>
          s.date === date && s.shift_type === shiftType ? { ...s, assigned_user: newStaff } : s
        );
      } else {
        return [
          ...prev,
          {
            year: currentYear,
            month: currentMonth,
            date,
            shift_type: shiftType,
            assigned_user: newStaff,
          },
        ];
      }
    });
    setIsEditingDraft(true);
  };

  const handleSaveConfirmedShifts = async () => {
    if (!isAdmin) return;

    const ok = confirm(`${currentYear}年${currentMonth}月の編集内容を確定して保存しますか？`);
    if (!ok) return;

    setIsProcessing(true);

    await supabase
      .from("confirmed_shifts")
      .delete()
      .eq("year", currentYear)
      .eq("month", currentMonth);

    const toSave = draftShifts.map((s) => ({
      year: currentYear,
      month: currentMonth,
      date: s.date,
      shift_type: s.shift_type,
      assigned_user: s.assigned_user || "未定",
    }));

    const { error } = await supabase.from("confirmed_shifts").insert(toSave);

    setIsProcessing(false);

    if (error) {
      alert("保存エラー: " + error.message);
    } else {
      await insertLog("シフト確定", `${currentYear}年${currentMonth}月のシフトが確定・保存されました`);
      alert("✅ シフトを確定・保存しました！");
      fetchAllData();
    }
  };

  const handleDiscardDraft = () => {
    if (confirm("編集中の内容を破棄して、保存済みの状態に戻しますか？")) {
      setDraftShifts(confirmedShifts);
      setIsEditingDraft(false);
    }
  };

  const handleResetCurrentMonthShifts = async () => {
    if (!isAdmin) return;

    const ok = confirm(`⚠️ ${currentYear}年${currentMonth}月の確定シフトをすべて解除しますか？`);
    if (!ok) return;

    setIsProcessing(true);
    await supabase
      .from("confirmed_shifts")
      .delete()
      .eq("year", currentYear)
      .eq("month", currentMonth);

    await insertLog("シフト解除", `${currentYear}年${currentMonth}月の確定シフトが解除されました`);

    setIsProcessing(false);
    alert("確定シフトを解除しました。");
    fetchAllData();
  };

  const displayedShifts = isAdmin ? draftShifts : confirmedShifts;
  const myAssignedInSelected = confirmedShifts.filter(
    (c) => c.date === selectedDate && c.assigned_user === currentUser
  );

  // -----------------------------------------------------------------
  // ログイン画面
  // -----------------------------------------------------------------
  if (!currentUser) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-md border border-gray-200">
          <h1 className="text-xl font-bold text-center text-gray-800 mb-1">
            シフト管理システム
          </h1>
          <p className="text-xs text-center text-gray-500 mb-6">
            ログインしてシフトの入力・確認を行ってください
          </p>

          <div className="flex border-b border-gray-200 mb-5">
            <button
              onClick={() => {
                setLoginRole("staff");
                setSelectedStaffForAuth(null);
                setStaffPasswordInput("");
              }}
              className={`flex-1 py-2 text-sm font-bold border-b-2 transition ${
                loginRole === "staff"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              スタッフログイン
            </button>
            <button
              onClick={() => {
                setLoginRole("admin");
                setSelectedStaffForAuth(null);
                setStaffPasswordInput("");
              }}
              className={`flex-1 py-2 text-sm font-bold border-b-2 transition ${
                loginRole === "admin"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              管理者ログイン
            </button>
          </div>

          {loginRole === "staff" ? (
            <div className="space-y-4">
              {!selectedStaffForAuth ? (
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-2">
                    あなたのお名前のタブをタップしてください:
                  </label>
                  {knownStaff.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3 text-center">
                      登録されたスタッフがいません。下の欄から追加してください。
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {knownStaff.map((staff) => (
                        <button
                          key={staff}
                          type="button"
                          onClick={() => {
                            setSelectedStaffForAuth(staff);
                            setStaffPasswordInput("");
                          }}
                          className="py-3 px-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 text-gray-800 hover:text-blue-700 font-bold text-sm transition text-center shadow-2xs active:scale-95"
                        >
                          {staff}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-gray-800">
                      👤 {selectedStaffForAuth} さんのパスワード
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedStaffForAuth(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      選び直す
                    </button>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="password"
                      placeholder="パスワード（初期値: 0000）"
                      value={staffPasswordInput}
                      onChange={(e) => setStaffPasswordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleStaffLogin();
                      }}
                      autoFocus
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white font-medium"
                    />

                    <button
                      onClick={handleStaffLogin}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-sm"
                    >
                      ログイン
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2 text-center">
                    ※初期パスワードは <code className="bg-gray-100 px-1 rounded">0000</code> です
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2 font-semibold">名前が見つからない場合（新規登録）:</p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newStaffRegisterInput}
                      onChange={(e) => setNewStaffRegisterInput(e.target.value)}
                      placeholder="新しいスタッフ名"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs bg-gray-50"
                    />
                    <input
                      type="password"
                      value={newStaffPasswordInput}
                      onChange={(e) => setNewStaffPasswordInput(e.target.value)}
                      placeholder="ログインPW"
                      className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-xs bg-gray-50"
                    />
                  </div>
                  <button
                    onClick={handleRegisterStaff}
                    className="w-full bg-gray-800 hover:bg-black text-white text-xs font-bold py-2 rounded-lg transition"
                  >
                    登録する
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">
                  管理者パスワード:
                </label>
                <input
                  type="password"
                  placeholder="パスワードを入力"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdminLogin();
                  }}
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                />
              </div>

              <button
                onClick={handleAdminLogin}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg text-sm transition shadow-sm"
              >
                管理者としてログイン
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // -----------------------------------------------------------------
  // メイン画面
  // -----------------------------------------------------------------
  return (
    <main className="min-h-screen bg-gray-50 p-4 max-w-4xl mx-auto pb-24 text-gray-800">
      {/* ログインバー */}
      <header className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3 mb-3">
          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                isAdmin
                  ? "bg-red-100 text-red-700 border border-red-200"
                  : "bg-blue-100 text-blue-700 border border-blue-200"
              }`}
            >
              {isAdmin ? "管理者権限" : "スタッフ"}
            </span>
            <span className="font-bold text-base text-gray-900">{currentUser} さん</span>

            {!isAdmin && (
              <button
                onClick={() => setShowPasswordChangeModal(true)}
                className="text-xs text-blue-600 hover:text-blue-800 underline ml-1"
              >
                パスワード変更
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 text-xs">
              <button
                onClick={() => {
                  if (currentMonth === 1) {
                    setCurrentYear((y) => y - 1);
                    setCurrentMonth(12);
                  } else {
                    setCurrentMonth((m) => m - 1);
                  }
                }}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold"
              >
                ◀ 前月
              </button>
              <span className="px-2 py-1 font-bold text-gray-700">
                {currentYear}年 {currentMonth}月
              </span>
              <button
                onClick={() => {
                  if (currentMonth === 12) {
                    setCurrentYear((y) => y + 1);
                    setCurrentMonth(1);
                  } else {
                    setCurrentMonth((m) => m + 1);
                  }
                }}
                className="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded font-bold"
              >
                翌月 ▶
              </button>
            </div>

            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 px-2.5 py-1 rounded-lg ml-2 transition"
            >
              ログアウト
            </button>
          </div>
        </div>

        {!isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
            <div className="flex items-center gap-2 bg-blue-50/50 p-2 rounded-lg border border-blue-100">
              <span className="font-semibold text-gray-700">今月の希望勤務回数（上限）:</span>
              <input
                type="number"
                min="0"
                max={daysInMonth}
                value={targetShifts}
                onChange={(e) => handleSaveTargetShifts(Number(e.target.value))}
                className="border border-gray-300 w-16 px-2 py-1 rounded text-center font-bold bg-white text-blue-700"
              />
              <span className="text-gray-500">回</span>
            </div>

            <div className="inline-block bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-gray-600">全休（×）残り枠: </span>
              <span className="font-bold text-red-600">{remainingFullLeaves}</span>
              <span className="text-gray-600"> / 10日</span>
            </div>
          </div>
        )}

        {isAdmin && (
          <div className="pt-1 text-xs">
            <span className="font-semibold text-gray-500 block mb-1.5">登録スタッフ一覧・削除:</span>
            {knownStaff.length === 0 ? (
              <p className="text-gray-400">現在登録されているスタッフはいません。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {knownStaff.map((staff) => (
                  <div
                    key={staff}
                    className="flex items-center bg-gray-100 border border-gray-200 rounded-lg pl-2.5 pr-1 py-1 text-xs"
                  >
                    <span className="font-medium mr-1.5">{staff}</span>
                    <button
                      onClick={() => handleDeleteStaff(staff)}
                      disabled={isProcessing}
                      title="このスタッフを削除"
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded p-0.5 font-bold transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* カレンダー */}
      {!isAdmin && (
        <div className="max-w-md mx-auto mb-10">
          <p className="text-center text-xs font-semibold text-gray-500 mb-2">
            カレンダーの日付をタップして希望を入力してください
          </p>
          <div className="grid grid-cols-7 gap-1.5 bg-white p-3.5 rounded-xl shadow-sm border border-gray-200">
            {["日", "月", "火", "水", "木", "金", "土"].map((day, idx) => (
              <div
                key={idx}
                className={`text-center font-bold text-xs py-1 ${
                  idx === 0 ? "text-red-500" : idx === 6 ? "text-blue-500" : "text-gray-400"
                }`}
              >
                {day}
              </div>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square bg-gray-50/40 rounded-lg" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((date) => {
              const currentStatus = requests[date];
              const myShifts = confirmedShifts.filter(
                (c) => c.date === date && c.assigned_user === currentUser
              );

              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className="aspect-square flex flex-col items-center justify-between p-1 border border-gray-100 rounded-lg hover:bg-gray-50 transition relative"
                >
                  <span className="text-xs font-medium text-gray-600">{date}</span>

                  <div className="flex flex-col gap-0.5">
                    {myShifts.map((s, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] font-extrabold bg-blue-600 text-white px-1 rounded shadow-2xs"
                      >
                        {s.shift_type}勤
                      </span>
                    ))}
                  </div>

                  {currentStatus && (
                    <span
                      className={`text-[9px] font-bold px-1 rounded ${
                        currentStatus === "全休"
                          ? "bg-red-100 text-red-700"
                          : currentStatus === "A×"
                          ? "bg-orange-100 text-orange-700"
                          : currentStatus === "B×"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {currentStatus}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 確定シフト表 */}
      <section className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800">
                シフト表（{currentYear}年{currentMonth}月）
              </h2>
              {isEditingDraft && (
                <span className="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-200">
                  ⚠️ 編集中（未保存）
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin
                ? "自動生成後に表内のプルダウンから微調整し、最後に「確定して保存」を押してください。"
                : "全体の割り当て状況を確認できます"}
            </p>
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              {isEditingDraft && (
                <>
                  <button
                    onClick={handleDiscardDraft}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs px-3 py-2 rounded-lg transition"
                  >
                    変更を破棄
                  </button>
                  <button
                    onClick={handleSaveConfirmedShifts}
                    disabled={isProcessing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition flex items-center gap-1"
                  >
                    💾 編集内容を確定して保存
                  </button>
                </>
              )}

              {!isEditingDraft && (
                <>
                  <button
                    onClick={handleResetCurrentMonthShifts}
                    disabled={isProcessing || confirmedShifts.length === 0}
                    className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 disabled:opacity-40 font-bold text-xs px-3 py-2 rounded-lg transition"
                  >
                    🗑️ シフト解除
                  </button>
                  <button
                    onClick={generateDraftShifts}
                    disabled={isProcessing}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
                  >
                    ⚡️ シフトを自動生成する（下書き作成）
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 勤務回数状況 */}
        <div className="mb-4 bg-gray-50 p-3 rounded-lg border text-xs">
          <div className="font-bold text-gray-600 mb-1">
            {currentYear}年{currentMonth}月の{isEditingDraft ? "現在の編集後回数" : "確定回数"} / 希望上限回数:
          </div>
          <div className="flex flex-wrap gap-2.5">
            {knownStaff.map((staff) => {
              const actual = displayedShifts.filter((c) => c.assigned_user === staff).length;
              const target = staffSettings.find((s) => s.user_name === staff)?.target_shifts || 6;
              const isOver = actual > target;

              return (
                <div
                  key={staff}
                  className={`px-2.5 py-1 rounded border shadow-2xs ${
                    isOver ? "bg-red-50 border-red-300 text-red-700" : "bg-white text-gray-700"
                  }`}
                >
                  <span className="font-medium">{staff}: </span>
                  <strong className={isOver ? "text-red-700" : "text-blue-600"}>{actual}</strong>
                  <span className="text-gray-400"> / {target}回</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* シフト表 */}
        <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[500px]">
          <table className="min-w-full text-xs text-center border-collapse">
            <thead className="bg-gray-100 text-gray-600 sticky top-0 z-10">
              <tr>
                <th className="p-2 border-b border-r w-20">日付</th>
                <th className="p-2 border-b border-r bg-blue-50 text-blue-800 w-36 font-bold">A勤</th>
                <th className="p-2 border-b border-r bg-indigo-50 text-indigo-800 w-36 font-bold">B勤</th>
                <th className="p-2 border-b text-gray-500 text-left pl-3">スタッフ提出希望</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const aShift = displayedShifts.find((c) => c.date === d && c.shift_type === "A");
                const bShift = displayedShifts.find((c) => c.date === d && c.shift_type === "B");
                const dayReqs = allRequests.filter((r) => r.date === d);

                const currentA = aShift?.assigned_user || "未定";
                const currentB = bShift?.assigned_user || "未定";

                return (
                  <tr key={d} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="p-2 border-r font-semibold text-gray-700 bg-gray-50">{d}日</td>
                    
                    {/* A勤 */}
                    <td className="p-1.5 border-r bg-blue-50/30">
                      {isAdmin ? (
                        <select
                          value={currentA}
                          onChange={(e) => handleUpdateSlot(d, "A", e.target.value)}
                          className={`w-full p-1 rounded text-xs font-bold border ${
                            currentA === "未定"
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : "bg-white text-gray-800 border-gray-300"
                          }`}
                        >
                          <option value="未定">未定</option>
                          {knownStaff.map((staff) => (
                            <option key={staff} value={staff}>
                              {staff}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`font-bold ${currentA === "未定" ? "text-gray-400" : "text-gray-800"}`}>
                          {currentA}
                        </span>
                      )}
                    </td>

                    {/* B勤 */}
                    <td className="p-1.5 border-r bg-indigo-50/30">
                      {isAdmin ? (
                        <select
                          value={currentB}
                          onChange={(e) => handleUpdateSlot(d, "B", e.target.value)}
                          className={`w-full p-1 rounded text-xs font-bold border ${
                            currentB === "未定"
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : "bg-white text-gray-800 border-gray-300"
                          }`}
                        >
                          <option value="未定">未定</option>
                          {knownStaff.map((staff) => (
                            <option key={staff} value={staff}>
                              {staff}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`font-bold ${currentB === "未定" ? "text-gray-400" : "text-gray-800"}`}>
                          {currentB}
                        </span>
                      )}
                    </td>

                    <td className="p-2 text-left pl-3 text-[11px] text-gray-500">
                      {dayReqs.length === 0 ? (
                        <span className="text-gray-300">-</span>
                      ) : (
                        dayReqs.map((req, idx) => (
                          <span key={idx} className="mr-2">
                            {req.user_name}:
                            <strong
                              className={`ml-0.5 ${
                                req.request_type === "全休"
                                  ? "text-red-600"
                                  : req.request_type === "A×"
                                  ? "text-orange-600"
                                  : req.request_type === "B×"
                                  ? "text-amber-600"
                                  : "text-purple-600"
                              }`}
                            >
                              {req.request_type}
                            </strong>
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 変更履歴ログ */}
      <section className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🕒</span>
            <span className="font-bold text-gray-700">
              変更履歴（{currentYear}年{currentMonth}月）
            </span>
          </div>
          <span className="text-[10px] text-gray-400 font-medium">直近の更新履歴</span>
        </div>

        {logs.length === 0 ? (
          <p className="text-[11px] text-gray-400 py-2 text-center bg-gray-50 rounded-lg">
            この月の変更履歴はまだありません。
          </p>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-gray-100">
            {logs.map((item) => {
              const dateObj = new Date(item.created_at);
              const formattedTime = `${dateObj.getMonth() + 1}/${dateObj.getDate()} ${String(
                dateObj.getHours()
              ).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;

              return (
                <div key={item.id} className="pt-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        item.action_type === "勤務交代"
                          ? "bg-amber-100 text-amber-800"
                          : item.action_type === "シフト確定"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.action_type === "シフト解除"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {item.action_type}
                    </span>
                    <span className="text-gray-700 truncate">{item.description}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                    {formattedTime}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 希望選択モーダル */}
      {selectedDate !== null && !isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-lg">
            <h3 className="text-base font-bold text-gray-800 mb-3 text-center">
              {currentMonth}月{selectedDate}日の設定（{currentUser}）
            </h3>

            {myAssignedInSelected.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-xs font-bold text-amber-900 mb-1.5">
                  🔄 個人間での勤務交代（代理操作）:
                </p>
                {myAssignedInSelected.map((shift, idx) => (
                  <div key={idx} className="space-y-2">
                    <p className="text-xs text-gray-700">
                      担当: <strong>{shift.shift_type}勤</strong>
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={swapTargetUser}
                        onChange={(e) => setSwapTargetUser(e.target.value)}
                        className="border border-gray-300 text-xs rounded px-2 py-1 flex-1 bg-white"
                      >
                        <option value="">交代相手を選択</option>
                        {knownStaff
                          .filter((s) => s !== currentUser)
                          .map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleDirectSwap(shift)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1 rounded shadow-sm transition"
                      >
                        交代確定
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[11px] text-gray-500 font-semibold mb-1">シフト希望の選択:</p>
              <button
                onClick={() => handleSelectShift("全休")}
                disabled={remainingFullLeaves <= 0 && requests[selectedDate] !== "全休"}
                className="w-full py-2 px-3 text-sm font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 disabled:opacity-40"
              >
                全休 (×) {remainingFullLeaves <= 0 && requests[selectedDate] !== "全休" && "【上限】"}
              </button>
              <button
                onClick={() => handleSelectShift("A×")}
                className="w-full py-2 px-3 text-sm font-semibold rounded-lg bg-orange-50 text-orange-700 border border-orange-200"
              >
                A勤不可 (A×)
              </button>
              <button
                onClick={() => handleSelectShift("B×")}
                className="w-full py-2 px-3 text-sm font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200"
              >
                B勤不可 (B×)
              </button>
              <button
                onClick={() => handleSelectShift("特別休")}
                className="w-full py-2 px-3 text-sm font-semibold rounded-lg bg-purple-50 text-purple-700 border border-purple-200"
              >
                特別休 (枠外)
              </button>
              <button
                onClick={() => handleSelectShift(null)}
                className="w-full py-2 px-3 text-sm rounded-lg bg-gray-100 text-gray-700"
              >
                希望を解除する
              </button>
            </div>

            <button
              onClick={() => setSelectedDate(null)}
              className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600 text-center"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* パスワード変更モーダル */}
      {showPasswordChangeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-5 w-full max-w-xs shadow-lg">
            <h3 className="text-sm font-bold text-gray-800 mb-3 text-center">
              パスワードの変更
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">新しいパスワード:</label>
                <input
                  type="password"
                  value={newPasswordUpdate}
                  onChange={(e) => setNewPasswordUpdate(e.target.value)}
                  placeholder="新しいパスワード"
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowPasswordChangeModal(false)}
                  className="flex-1 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-semibold"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleChangeMyPassword}
                  className="flex-1 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
                >
                  変更する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}