import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  approveKpi as approveKpiRequest,
  changePassword as changePasswordRequest,
  createReviewPeriod as createReviewPeriodRequest,
  createStaff,
  createKpi as createKpiRequest,
  deleteKpiById,
  deleteStaff,
  getDepartmentReport,
  getNotifications,
  getUserComments,
  getDashboardSummary,
  getDepartments,
  getReviewPeriods,
  getStaffDirectory,
  getUserPerformance,
  getUserReport,
  getUserKpis,
  login,
  requestPasswordReset,
  resetStaffPassword,
  setActiveReviewPeriod as setActiveReviewPeriodRequest,
  submitFinalScore,
  submitManagerScore,
  submitSelfAppraisal,
  updateKpi as updateKpiRequest,
  updateStaff
} from "./api";
import { navItems, reportTrend } from "./data";
import {
  AuthUser,
  DashboardResponse,
  DepartmentReportResponse,
  Department,
  CommentHistoryItem,
  Kpi,
  LoginResponse,
  NotificationItem,
  PerformanceRow,
  ReviewPeriod,
  Role,
  StaffMember,
  UserReportResponse
} from "./types";

const navIcons = {
  dashboard: LayoutDashboard,
  kpis: Target,
  appraisals: ClipboardCheck,
  reviews: Users,
  reports: FileBarChart2,
  settings: Settings
};

const statusStyles: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700",
  Submitted: "bg-amber-50 text-amber-700",
  Approved: "bg-emerald-50 text-emerald-700",
  Rejected: "bg-rose-50 text-rose-700"
};

const statusLabels: Record<Kpi["status"], string> = {
  Draft: "Draft",
  Submitted: "Awaiting manager review",
  Approved: "Approved",
  Rejected: "Needs adjustment"
};

const storageKey = "news-central-auth";

const nameOverrides: Record<string, string> = {
  "hr@newscentral.com": "Obehi NC",
  "obehi@newscentral.com": "Obehi NC",
  "amina@newscentral.com": "Amina NC",
  "nkechi@newscentral.com": "Nkechi NC",
  "manager@newscentral.com": "Donald NC",
  "donald@newscentral.com": "Donald NC",
  "katleen@newscentral.com": "Katleen NC",
  "omolara@newscentral.com": "Omolara NC",
  "tolu@newscentral.com": "Emmanuel NC",
  "emmanuel@newscentral.com": "Emmanuel NC",
  "maya@newscentral.com": "Motun NC",
  "motun@newscentral.com": "Motun NC",
  "tomisin@newscentral.com": "Tomisin NC"
};

type SessionState = LoginResponse | null;
type KpiActionKind = "create" | "save" | "submit" | "delete" | "approve" | "return";
type KpiActionState = { kind: KpiActionKind | null; kpiId?: number };
type KpiFeedback = {
  scope: "create" | "workspace" | "review";
  tone: "success" | "error";
  message: string;
};
type AppraisalActionKind = "selfScore" | "managerScore" | "finalScore";
type AppraisalActionState = { kind: AppraisalActionKind | null; kpiId?: number };
type AppraisalFeedback = { tone: "success" | "error"; message: string } | null;

function normalizeStatus(status: string): Kpi["status"] {
  const map: Record<string, Kpi["status"]> = {
    draft: "Draft",
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected"
  };

  return map[status.toLowerCase()] ?? "Draft";
}

function mergeKpiData(
  rawKpis: Array<{
    id: number;
    appraisal_id?: number;
    appraisal_period?: string;
    appraisal_status?: "draft" | "in_review" | "completed";
    appraisal_created_at?: string;
    employee_signed?: boolean;
    manager_signed?: boolean;
    employee_signed_at?: string | null;
    manager_signed_at?: string | null;
    title: string;
    description?: string | null;
    weight: number | string;
    target: number | string;
    status: string;
  }>,
  rawPerformance: PerformanceRow[]
) {
  const performanceById = new Map(rawPerformance.map((item) => [item.kpi_id, item]));

  return rawKpis.map((item) => {
    const performance = performanceById.get(item.id);
    return {
      id: item.id,
      appraisalId: item.appraisal_id,
      appraisalPeriod: item.appraisal_period,
      appraisalStatus: item.appraisal_status,
      appraisalCreatedAt: item.appraisal_created_at,
      employeeSigned: item.employee_signed,
      managerSigned: item.manager_signed,
      employeeSignedAt: item.employee_signed_at ?? null,
      managerSignedAt: item.manager_signed_at ?? null,
      title: item.title,
      description: item.description ?? undefined,
      weight: Number(item.weight),
      target: Number(item.target),
      status: normalizeStatus(item.status),
      actual: performance?.actual === null || performance?.actual === undefined ? undefined : Number(performance.actual),
      selfScore:
        performance?.self_score === null || performance?.self_score === undefined
          ? undefined
          : Number(performance.self_score),
      managerScore:
        performance?.manager_score === null || performance?.manager_score === undefined
          ? undefined
          : Number(performance.manager_score),
      finalScore:
        performance?.final_score === null || performance?.final_score === undefined
          ? undefined
          : Number(performance.final_score)
    };
  });
}

function getDisplayName(user: Pick<AuthUser, "email">) {
  return nameOverrides[user.email] || user.email.split("@")[0];
}

function getDisplayNameFromStaff(staff: StaffMember) {
  return nameOverrides[staff.email] || staff.name;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function getNavItemsForRole(role: Role) {
  const allowedByRole: Record<Role, string[]> = {
    employee: ["dashboard", "kpis", "appraisals", "reports", "settings"],
    manager: ["dashboard", "kpis", "appraisals", "reviews", "reports", "settings"],
    hr: ["dashboard", "kpis", "appraisals", "reviews", "reports", "settings"]
  };

  return navItems.filter((item) => allowedByRole[role].includes(item.key));
}

function getStatusLabel(status: Kpi["status"]) {
  return statusLabels[status] ?? status;
}

function KpiPeriodBadge({ period }: { period?: string }) {
  if (!period) return null;

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
      {period}
    </span>
  );
}

function getDashboardAverageScore(summary: DashboardResponse["summary"]) {
  if ("organization_average_score" in summary) return summary.organization_average_score;
  if ("team_average_score" in summary) return summary.team_average_score;
  if ("average_final_score" in summary) return summary.average_final_score;
  return 0;
}

function App() {
  const [session, setSession] = useState<SessionState>(() => {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? (JSON.parse(saved) as LoginResponse) : null;
  });
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [passwordResetPending, setPasswordResetPending] = useState(false);
  const [passwordResetStatus, setPasswordResetStatus] = useState("");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [reviewPeriods, setReviewPeriods] = useState<ReviewPeriod[]>([]);
  const [activeReviewPeriod, setActiveReviewPeriod] = useState<ReviewPeriod | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cycleFilter, setCycleFilter] = useState<"active" | "all">("active");
  const [commentHistory, setCommentHistory] = useState<CommentHistoryItem[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [kpiRows, setKpiRows] = useState<Kpi[]>([]);
  const [kpiFeedback, setKpiFeedback] = useState<KpiFeedback | null>(null);
  const [kpiActionState, setKpiActionState] = useState<KpiActionState>({ kind: null });
  const [appraisalFeedback, setAppraisalFeedback] = useState<AppraisalFeedback>(null);
  const [appraisalActionState, setAppraisalActionState] = useState<AppraisalActionState>({ kind: null });
  const [newKpiForm, setNewKpiForm] = useState({
    title: "",
    description: "",
    weight: "",
    target: ""
  });
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadError, setLoadError] = useState("");

  const user = session?.user ?? null;
  const token = session?.token ?? "";
  const roleNavItems = user ? getNavItemsForRole(user.role) : navItems;

  const refreshDirectory = async (
    authToken: string,
    currentUser: AuthUser,
    preferredProfileId?: number | null
  ) => {
    const [staffResponse, departmentsResponse, periodsResponse] = await Promise.all([
      currentUser.role === "employee"
        ? Promise.resolve({ data: [] as StaffMember[] })
        : getStaffDirectory(authToken, currentUser.role === "manager" ? "team" : undefined),
      currentUser.role === "hr"
        ? getDepartments(authToken)
        : Promise.resolve({ data: [] as Department[] }),
      getReviewPeriods(authToken)
    ]);

    setStaff(staffResponse.data);
    setDepartments(departmentsResponse.data);
    setReviewPeriods(periodsResponse.data);
    setActiveReviewPeriod(periodsResponse.active);

    if (currentUser.role === "employee") {
      setSelectedProfileId(currentUser.id);
    } else {
      setSelectedProfileId((current) => {
        if (current && staffResponse.data.some((item) => item.id === current)) {
          return current;
        }

        if (preferredProfileId && staffResponse.data.some((item) => item.id === preferredProfileId)) {
          return preferredProfileId;
        }

        return staffResponse.data[0]?.id ?? null;
      });
    }
  };

  useEffect(() => {
    if (!session) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    if (!user || !token) return;

    let cancelled = false;

    const loadSummary = async () => {
      setLoadingSummary(true);
      setLoadError("");
      try {
        const [summaryResponse, notificationResponse] = await Promise.all([
          getDashboardSummary(token),
          getNotifications(token)
        ]);

        if (!cancelled) {
          setDashboard(summaryResponse);
          setNotifications(notificationResponse.data);
          const preferredProfileId =
            summaryResponse.role === "manager"
              ? summaryResponse.team.find((member) => toNumber(member.pending_approvals) > 0)?.id ?? summaryResponse.team[0]?.id ?? null
              : null;
          await refreshDirectory(token, user, preferredProfileId);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load dashboard data");
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  useEffect(() => {
    if (!user || !token || !selectedProfileId) {
      return;
    }

    setKpiFeedback(null);

    let cancelled = false;

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const [kpisResponse, performanceResponse, commentsResponse] = await Promise.all([
          getUserKpis(selectedProfileId, token),
          getUserPerformance(selectedProfileId, token),
          getUserComments(selectedProfileId, token)
        ]);

        if (!cancelled) {
          const merged = mergeKpiData(kpisResponse.data, performanceResponse.data);
          setKpiRows(merged);
          setCommentHistory(commentsResponse.data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load appraisal records");
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [selectedProfileId, token, user]);

  const refreshProfileData = async () => {
    if (!user || !token || !selectedProfileId) return;

    const [kpisResponse, performanceResponse, commentsResponse] = await Promise.all([
      getUserKpis(selectedProfileId, token),
      getUserPerformance(selectedProfileId, token),
      getUserComments(selectedProfileId, token)
    ]);

    const merged = mergeKpiData(kpisResponse.data, performanceResponse.data);
    setKpiRows(merged);
    setCommentHistory(commentsResponse.data);
  };

  const profile = useMemo(() => {
    if (!user) return null;
    if (user.role === "employee") {
      return {
        id: user.id,
        email: user.email,
        name: getDisplayName(user),
        role: user.role,
        department: null
      };
    }

    const match = staff.find((item) => item.id === selectedProfileId);
    return match
      ? { ...match, name: getDisplayNameFromStaff(match) }
      : null;
  }, [selectedProfileId, staff, user]);

  const profileMetrics = useMemo(() => {
    const approved = kpiRows.filter((item) => item.status === "Approved").length;
    const submitted = kpiRows.filter((item) => item.status === "Submitted").length;
    const draft = kpiRows.filter((item) => item.status === "Draft").length;
    const needsAdjustment = kpiRows.filter((item) => item.status === "Rejected").length;

    return {
      approved,
      submitted,
      total: kpiRows.length,
      draft,
      needsAdjustment
    };
  }, [kpiRows]);

  const cycleScopedKpiRows = useMemo(() => {
    if (cycleFilter === "all" || !activeReviewPeriod?.name) return kpiRows;
    return kpiRows.filter((item) => item.appraisalPeriod === activeReviewPeriod.name);
  }, [activeReviewPeriod?.name, cycleFilter, kpiRows]);

  const visibleKpiRows = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return cycleScopedKpiRows;
    return cycleScopedKpiRows.filter((item) =>
      [item.title, item.description ?? "", item.status].join(" ").toLowerCase().includes(term)
    );
  }, [cycleScopedKpiRows, searchQuery]);

  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];

    const staffMatches = staff
      .filter((item) =>
        [getDisplayNameFromStaff(item), item.email, item.department ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .map((item) => ({
        id: `staff-${item.id}`,
        label: getDisplayNameFromStaff(item),
        meta: item.role,
        action: () => {
          setSelectedProfileId(item.id);
          setActiveView(item.role === "employee" ? "kpis" : "dashboard");
          setSearchQuery("");
        }
      }));

    const kpiMatches = kpiRows
      .filter((item) => item.title.toLowerCase().includes(term))
      .map((item) => ({
        id: `kpi-${item.id}`,
        label: item.title,
        meta: "KPI",
        action: () => {
          setActiveView("kpis");
          setSearchQuery(item.title);
        }
      }));

    return [...staffMatches, ...kpiMatches].slice(0, 8);
  }, [kpiRows, searchQuery, staff]);

  useEffect(() => {
    if (!user) return;
    if (!roleNavItems.some((item) => item.key === activeView)) {
      setActiveView("dashboard");
    }
  }, [activeView, roleNavItems, user]);

  useEffect(() => {
    if (!kpiFeedback) return;

    const timer = window.setTimeout(() => {
      setKpiFeedback((current) => (current === kpiFeedback ? null : current));
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [kpiFeedback]);

  useEffect(() => {
    if (!appraisalFeedback) return;

    const timer = window.setTimeout(() => {
      setAppraisalFeedback((current) => (current === appraisalFeedback ? null : current));
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [appraisalFeedback]);

  const pageTitle = roleNavItems.find((item) => item.key === activeView)?.label ?? "Dashboard";

  const beginKpiAction = (kind: KpiActionKind, kpiId?: number) => {
    setKpiActionState({ kind, kpiId });
    setKpiFeedback(null);
  };

  const finishKpiAction = () => {
    setKpiActionState({ kind: null });
  };

  const updateKpiRow = (id: number, field: keyof Kpi, value: string) => {
    setKpiRows((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === "title" || field === "description"
                  ? value
                  : Number(value)
            }
          : item
      )
    );
  };

  const handleCreateKpi = async () => {
    if (!user || !token || !selectedProfileId) return;
    beginKpiAction("create");

    try {
      if (!newKpiForm.title.trim()) {
        throw new Error("KPI title is required.");
      }
      await createKpiRequest(token, {
        userId: selectedProfileId,
        period: activeReviewPeriod?.name,
        title: newKpiForm.title,
        description: newKpiForm.description
      });
      await refreshProfileData();
      setNewKpiForm({ title: "", description: "", weight: "", target: "" });
      setKpiFeedback({
        scope: "create",
        tone: "success",
        message: "KPI created successfully."
      });
    } catch (error) {
      setKpiFeedback({
        scope: "create",
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to create KPI"
      });
    } finally {
      finishKpiAction();
    }
  };

  const handleSaveKpi = async (kpi: Kpi, status?: "draft" | "submitted", achievementNote?: string) => {
    if (!token) return;
    beginKpiAction(status === "submitted" ? "submit" : "save", kpi.id);

    try {
      if (!kpi.title.trim()) {
        throw new Error("KPI title is required before saving.");
      }

      if (status === "submitted") {
        const normalizedAchievementNote = achievementNote?.trim();

        if (!kpi.selfScore) {
          throw new Error("Set the staff score before sending this KPI to the manager.");
        }

        if (!normalizedAchievementNote) {
          throw new Error("Add the actual achievement before sending this KPI to the manager.");
        }

        await submitSelfAppraisal(token, {
          kpiId: kpi.id,
          selfScore: Number(kpi.selfScore),
          comment: normalizedAchievementNote
        });
      }

      await updateKpiRequest(token, kpi.id, {
        title: kpi.title,
        description: kpi.description
      });

      if (status) {
        await updateKpiRequest(token, kpi.id, { status });
      }

      await refreshProfileData();
      setKpiFeedback({
        scope: "workspace",
        tone: "success",
        message: status === "submitted" ? "KPI submitted to the manager." : "KPI updated."
      });
    } catch (error) {
      setKpiFeedback({
        scope: "workspace",
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save KPI"
      });
    } finally {
      finishKpiAction();
    }
  };

  const handleDeleteKpi = async (kpiId: number) => {
    if (!token) return;
    beginKpiAction("delete", kpiId);

    try {
      await deleteKpiById(token, kpiId);
      await refreshProfileData();
      setKpiFeedback({
        scope: "workspace",
        tone: "success",
        message: "KPI deleted."
      });
    } catch (error) {
      setKpiFeedback({
        scope: "workspace",
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to delete KPI"
      });
    } finally {
      finishKpiAction();
    }
  };

  const handleApproveKpi = async (kpi: Kpi, status: "approved" | "rejected", comment?: string) => {
    if (!token) return;
    beginKpiAction(status === "approved" ? "approve" : "return", kpi.id);

    try {
      if (status === "rejected" && !comment?.trim()) {
        throw new Error("Add manager feedback before sending a KPI back for adjustment.");
      }

      if (status === "approved" && !kpi.managerScore) {
        throw new Error("Set the manager score before approving this KPI.");
      }

      await updateKpiRequest(token, kpi.id, {
        title: kpi.title,
        description: kpi.description
      });

      if (status === "approved") {
        await submitManagerScore(token, {
          kpiId: kpi.id,
          managerScore: Number(kpi.managerScore),
          comment: comment?.trim() || kpi.description || "Manager expectations recorded"
        });
      }

      await approveKpiRequest(token, kpi.id, {
        status,
        comment: comment?.trim() || undefined
      });
      await refreshProfileData();
      setKpiFeedback({
        scope: "review",
        tone: "success",
        message: status === "approved" ? "KPI approved." : "KPI returned to the employee for adjustment."
      });
    } catch (error) {
      setKpiFeedback({
        scope: "review",
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to update KPI approval"
      });
    } finally {
      finishKpiAction();
    }
  };

  const beginAppraisalAction = (kind: AppraisalActionKind, kpiId: number) => {
    setAppraisalActionState({ kind, kpiId });
    setAppraisalFeedback(null);
  };

  const finishAppraisalAction = () => {
    setAppraisalActionState({ kind: null });
  };

  const handleSubmitSelfScore = async (kpiId: number, selfScore: number, comment: string) => {
    if (!token) return;
    beginAppraisalAction("selfScore", kpiId);

    try {
      await submitSelfAppraisal(token, { kpiId, selfScore, comment });
      await refreshProfileData();
      setAppraisalFeedback({ tone: "success", message: "Self-score submitted." });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to submit self-score"
      });
    } finally {
      finishAppraisalAction();
    }
  };

  const handleSubmitManagerScore = async (kpiId: number, managerScore: number, comment: string) => {
    if (!token) return;
    beginAppraisalAction("managerScore", kpiId);

    try {
      await submitManagerScore(token, { kpiId, managerScore, comment });
      await refreshProfileData();
      setAppraisalFeedback({ tone: "success", message: "Manager score submitted." });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to submit manager score"
      });
    } finally {
      finishAppraisalAction();
    }
  };

  const handleSubmitFinalScore = async (kpiId: number, finalScore: number) => {
    if (!token) return;
    beginAppraisalAction("finalScore", kpiId);

    try {
      await submitFinalScore(token, { kpiId, finalScore, agree: true });
      await refreshProfileData();
      setAppraisalFeedback({ tone: "success", message: "Final score recorded for review." });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to record the final score"
      });
    } finally {
      finishAppraisalAction();
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginPending(true);
    setLoginError("");

    try {
      const result = await login(loginForm.email, loginForm.password);
      setSession(result);
      setActiveView("dashboard");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoginPending(false);
    }
  };

  const handlePasswordResetRequest = async (payload: { email: string; newPassword: string }) => {
    setPasswordResetPending(true);
    setLoginError("");
    setPasswordResetStatus("");

    try {
      await requestPasswordReset(payload.email, payload.newPassword);
      setPasswordResetStatus("Password reset successful. You can sign in with the new password now.");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to reset password");
    } finally {
      setPasswordResetPending(false);
    }
  };

  const handleLogout = () => {
    setSession(null);
    setDashboard(null);
    setStaff([]);
    setNotifications([]);
    setSearchQuery("");
    setSelectedProfileId(null);
    setKpiRows([]);
    setKpiFeedback(null);
    setKpiActionState({ kind: null });
    setActiveView("dashboard");
    setSidebarOpen(false);
    setLoadError("");
  };

  if (!user) {
    return (
      <LoginScreen
        form={loginForm}
        pending={loginPending}
        error={loginError}
        resetPending={passwordResetPending}
        status={passwordResetStatus}
        onChange={setLoginForm}
        onResetPassword={handlePasswordResetRequest}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f5f6f8] font-sans text-ink">
      <div className="flex min-h-screen w-full">
        <Sidebar
          activeView={activeView}
          setActiveView={setActiveView}
          onClose={() => setSidebarOpen(false)}
          sidebarOpen={sidebarOpen}
          user={user}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            pageTitle={pageTitle}
            onMenuClick={() => setSidebarOpen(true)}
            user={user}
            notifications={notifications}
            searchQuery={searchQuery}
            searchResults={searchResults}
            onSearchChange={setSearchQuery}
            onLogout={handleLogout}
          />
          <main className="flex-1 bg-[#f5f6f8] px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
              {(user.role === "manager" || user.role === "hr") && staff.length > 0 && (
                <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Staff profile focus</p>
                      <p className="text-sm text-slate-500">
                        Switch between staff records while keeping your dashboard metrics live.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedProfileId ?? ""}
                        onChange={(event) => setSelectedProfileId(Number(event.target.value))}
                        className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
                      >
                        {staff.map((item) => (
                          <option key={item.id} value={item.id}>
                            {getDisplayNameFromStaff(item)} | {item.department ?? "No department"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
              )}

              {(activeView === "kpis" || activeView === "appraisals") && (
                <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Review period view</p>
                      <p className="text-sm text-slate-500">
                        {activeReviewPeriod?.name
                          ? `Active cycle is ${activeReviewPeriod.name}. Switch between only this cycle and all saved cycles.`
                          : "Switch between only the active cycle and all saved cycles."}
                      </p>
                    </div>
                    <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                      <button
                        className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                          cycleFilter === "active" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                        }`}
                        onClick={() => setCycleFilter("active")}
                      >
                        Active cycle
                      </button>
                      <button
                        className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                          cycleFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                        }`}
                        onClick={() => setCycleFilter("all")}
                      >
                        All cycles
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {loadError && (
                <section className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {loadError}
                </section>
              )}

              {activeView === "dashboard" && (
                <RoleDashboard
                  user={user}
                  dashboard={dashboard}
                  staff={staff}
                  profile={profile}
                  profileMetrics={profileMetrics}
                  loading={loadingSummary}
                />
              )}
              {activeView === "kpis" && (
                <KpiManagement
                  user={user}
                  kpiRows={visibleKpiRows}
                  commentHistory={commentHistory}
                  onRowChange={updateKpiRow}
                  loading={loadingProfile}
                  profileName={profile?.name ?? getDisplayName(user)}
                  activePeriodName={activeReviewPeriod?.name ?? null}
                  cycleFilter={cycleFilter}
                  newKpiForm={newKpiForm}
                  onNewKpiChange={setNewKpiForm}
                  onCreateKpi={handleCreateKpi}
                  onSaveKpi={handleSaveKpi}
                  onDeleteKpi={handleDeleteKpi}
                  onApproveKpi={handleApproveKpi}
                  feedback={kpiFeedback}
                  actionState={kpiActionState}
                />
              )}
              {activeView === "appraisals" && (
                <AppraisalFlow
                  user={user}
                  kpis={visibleKpiRows}
                  loading={loadingProfile}
                  profileName={profile?.name ?? getDisplayName(user)}
                  commentHistory={commentHistory}
                  feedback={appraisalFeedback}
                  actionState={appraisalActionState}
                  onSubmitSelfScore={handleSubmitSelfScore}
                  onSubmitManagerScore={handleSubmitManagerScore}
                  onSubmitFinalScore={handleSubmitFinalScore}
                />
              )}
              {activeView === "reviews" && (
                <ReviewsPanel
                  user={user}
                  dashboard={dashboard}
                  staff={staff}
                  kpiRows={visibleKpiRows}
                  selectedProfileId={selectedProfileId}
                  onApproveKpi={handleApproveKpi}
                />
              )}
              {activeView === "reports" && (
                <Reports
                  user={user}
                  token={token}
                  dashboard={dashboard}
                  staff={staff}
                  departments={departments}
                  reviewPeriods={reviewPeriods}
                />
              )}
              {activeView === "settings" && (
                <SettingsPanel
                  user={user}
                  token={token}
                  staff={staff}
                  departments={departments}
                  reviewPeriods={reviewPeriods}
                  activeReviewPeriod={activeReviewPeriod}
                  onDirectoryRefresh={async () => {
                    await refreshDirectory(token, user);
                  }}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({
  form,
  pending,
  error,
  resetPending,
  status,
  onChange,
  onResetPassword,
  onSubmit
}: {
  form: { email: string; password: string };
  pending: boolean;
  error: string;
  resetPending: boolean;
  status: string;
  onChange: (value: { email: string; password: string }) => void;
  onResetPassword: (payload: { email: string; newPassword: string }) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetForm, setResetForm] = useState({ email: "", newPassword: "" });
  const [rememberMe, setRememberMe] = useState(true);

  return (
    <div className="min-h-screen bg-[#eef1f5] p-4 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-7xl overflow-hidden rounded-[36px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] ring-1 ring-black/5 lg:grid-cols-2">
        <section className="relative hidden min-h-[760px] overflow-hidden bg-[#0f172a] lg:block">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#0f172a_0%,#111827_45%,#1e293b_100%)]" />
          <div className="absolute inset-y-0 right-0 w-px bg-white/10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.22),transparent_28%),radial-gradient(circle_at_80%_30%,rgba(59,130,246,0.18),transparent_24%),linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_35%,transparent_70%)]" />
          <div className="absolute left-14 top-14 h-px w-40 bg-gradient-to-r from-white/0 via-white/40 to-white/0" />
          <div className="absolute right-20 top-28 h-px w-56 rotate-[-16deg] bg-gradient-to-r from-white/0 via-indigo-300/45 to-white/0" />
          <div className="absolute bottom-20 left-16 right-16">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-200">News Central</p>
            <h1 className="mt-6 max-w-md text-5xl font-bold leading-tight text-white">
              Welcome Back to Your Workspace
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-slate-300">
              Track, evaluate, and grow your performance
            </p>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-40 w-40 items-center justify-center rounded-[40px] border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_30px_80px_rgba(15,23,42,0.45)]">
              <span className="text-[4.5rem] font-black tracking-tight text-white">NC</span>
            </div>
          </div>
        </section>
        <section className="flex items-center justify-center bg-[#fbfcfd] p-6 sm:p-10">
          <div className="w-full max-w-xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">News Central</p>
                <h2 className="mt-3 text-3xl font-bold text-slate-900">
                  {mode === "login" ? "Sign in to your account" : "Reset password"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {mode === "login"
                    ? "Sign in to continue your appraisal workflow."
                    : "Set a new password so you can access your workspace."}
                </p>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-900 text-lg font-black text-white">
                NC
              </div>
            </div>
            <div className="rounded-[32px] bg-white p-8 shadow-sm ring-1 ring-black/5">
              {status && (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {status}
                </div>
              )}
              {error && (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}
              {mode === "login" ? (
                <form className="space-y-4" onSubmit={onSubmit}>
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Email address</span>
                    <input
                      value={form.email}
                      onChange={(event) => onChange({ ...form, email: event.target.value })}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="name@newscentral.com"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Password</span>
                    <input
                      value={form.password}
                      onChange={(event) => onChange({ ...form, password: event.target.value })}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      type="password"
                      placeholder="Enter your password"
                    />
                  </label>
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <label className="flex items-center gap-3 text-slate-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={rememberMe}
                        onChange={(event) => setRememberMe(event.target.checked)}
                      />
                      Remember me
                    </label>
                  </div>
                  <button
                    disabled={pending}
                    className="w-full rounded-2xl bg-brand px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {pending ? "Signing in..." : "Sign In"}
                  </button>
                  <div className="pt-2 text-right">
                    <button type="button" onClick={() => setMode("forgot")} className="text-sm font-medium text-brand">
                      Forgot password?
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onResetPassword(resetForm);
                  }}
                >
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Work email</span>
                    <input
                      value={resetForm.email}
                      onChange={(event) => setResetForm((current) => ({ ...current, email: event.target.value }))}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="name@newscentral.com"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">New password</span>
                    <input
                      type="password"
                      value={resetForm.newPassword}
                      onChange={(event) => setResetForm((current) => ({ ...current, newPassword: event.target.value }))}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="Enter a new password"
                    />
                  </label>
                  <button
                    disabled={resetPending}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {resetPending ? "Resetting..." : "Reset password"}
                  </button>
                  <div className="pt-2 text-right">
                    <button type="button" onClick={() => setMode("login")} className="text-sm font-medium text-brand">
                      Back to sign in
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Sidebar({
  activeView,
  setActiveView,
  sidebarOpen,
  onClose,
  user
}: {
  activeView: string;
  setActiveView: (view: string) => void;
  sidebarOpen: boolean;
  onClose: () => void;
  user: AuthUser;
}) {
  return (
    <>
      <aside className="hidden w-[276px] flex-col justify-between border-r border-slate-800 bg-[#0f172a] md:flex">
        <SidebarContent activeView={activeView} setActiveView={setActiveView} user={user} />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-label="Close menu" />
          <aside className="relative z-10 flex w-[276px] flex-col justify-between bg-[#0f172a] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">Appraisal</p>
                <h1 className="text-lg font-bold text-white">News Central</h1>
              </div>
              <button
                className="rounded-xl border border-slate-700 p-2 text-slate-300"
                onClick={onClose}
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent
              activeView={activeView}
              setActiveView={(view) => {
                setActiveView(view);
                onClose();
              }}
              user={user}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarContent({
  activeView,
  setActiveView,
  user
}: {
  activeView: string;
  setActiveView: (view: string) => void;
  user: AuthUser;
}) {
  const displayName = getDisplayName(user);
  const roleNavItems = getNavItemsForRole(user.role);

  return (
    <>
      <div className="p-5">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">Performance</p>
          <h1 className="mt-2 text-xl font-bold text-white">News Central</h1>
        </div>
        <nav className="space-y-1">
          {roleNavItems.map((item) => {
            const Icon = navIcons[item.key as keyof typeof navIcons];
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveView(item.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  active
                    ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-inset ring-indigo-500/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-slate-800 p-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-sm font-semibold text-white shadow-lg shadow-indigo-950/40">
            {displayName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            <div className="mt-1 inline-flex rounded-full bg-indigo-500/15 px-2 py-1 text-xs font-medium capitalize text-indigo-200">
              {user.role}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Topbar({
  pageTitle,
  onMenuClick,
  user,
  notifications,
  searchQuery,
  searchResults,
  onSearchChange,
  onLogout
}: {
  pageTitle: string;
  onMenuClick: () => void;
  user: AuthUser;
  notifications: NotificationItem[];
  searchQuery: string;
  searchResults: Array<{ id: string; label: string; meta: string; action: () => void }>;
  onSearchChange: (value: string) => void;
  onLogout: () => void;
}) {
  const displayName = getDisplayName(user);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCount = notifications.length;

  return (
    <header className="border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            className="rounded-xl border border-neutral-200 p-2 text-slate-600 md:hidden"
            onClick={onMenuClick}
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">News Central</p>
            <h2 className="text-xl font-bold text-slate-900">{pageTitle}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden lg:block">
            <input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search appraisals, staff, or KPIs"
              className="min-w-[280px] rounded-2xl border border-neutral-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-brand"
            />
            {searchQuery.trim() && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-full rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl">
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={result.action}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-900">{result.label}</span>
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-400">{result.meta}</span>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">No results found.</div>
                )}
              </div>
            )}
          </div>
          <div className="relative">
          <button
            onClick={() => setNotificationsOpen((current) => !current)}
            className="relative rounded-2xl border border-neutral-200 bg-white p-2.5 text-slate-600"
          >
            <Bell size={18} />
            {notificationCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            ) : null}
          </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[340px] rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl">
                <div className="mb-2 px-2 text-sm font-semibold text-slate-900">Notifications</div>
                <div className="max-h-[320px] space-y-2 overflow-y-auto">
                  {notifications.length ? (
                    notifications.map((item) => (
                      <div key={item.id} className="rounded-xl bg-slate-50 px-3 py-3">
                        <p className="text-sm font-medium text-slate-900">
                          {nameOverrides[item.email] || item.name} {item.action.replace(/_/g, " ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-500">No unread activity is waiting for you right now.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            className="rounded-2xl border border-neutral-200 bg-white p-2.5 text-slate-600"
            onClick={onLogout}
            title="Log out"
          >
            <LogOut size={18} />
          </button>
          <button className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
              {displayName
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-slate-900">{displayName}</p>
              <p className="text-xs capitalize text-slate-500">{user.role}</p>
            </div>
            <ChevronDown size={16} className="text-slate-500" />
          </button>
        </div>
      </div>
    </header>
  );
}

function RoleDashboard({
  user,
  dashboard,
  staff,
  profile,
  profileMetrics,
  loading
}: {
  user: AuthUser;
  dashboard: DashboardResponse | null;
  staff: StaffMember[];
  profile: { name: string; department?: string | null } | null;
  profileMetrics: {
    approved: number;
    submitted: number;
    total: number;
    draft: number;
    needsAdjustment: number;
  };
  loading: boolean;
}) {
  if (user.role === "employee") {
    return (
      <EmployeeDashboard
        profileName={profile?.name ?? getDisplayName(user)}
        metrics={profileMetrics}
        summary={dashboard?.role === "employee" ? dashboard.summary : null}
        loading={loading}
      />
    );
  }

  if (user.role === "manager") {
    return (
      <ManagerDashboard
        summary={dashboard?.role === "manager" ? dashboard.summary : null}
        team={dashboard?.role === "manager" ? dashboard.team : []}
        staff={staff}
        loading={loading}
      />
    );
  }

  return (
    <HrDashboard
      summary={dashboard?.role === "hr" ? dashboard.summary : null}
      departments={dashboard?.role === "hr" ? dashboard.departments : []}
      distribution={dashboard?.role === "hr" ? dashboard.distribution : null}
      loading={loading}
    />
  );
}

function EmployeeDashboard({
  profileName,
  metrics,
  summary,
  loading
}: {
  profileName: string;
  metrics: { approved: number; submitted: number; total: number; draft: number; needsAdjustment: number };
  summary: Extract<DashboardResponse, { role: "employee" }>["summary"] | null;
  loading: boolean;
}) {
  const cards = [
    {
      label: "Approved",
      value: `${metrics.approved}`,
      note: "KPIs fully cleared by your manager"
    },
    {
      label: "Awaiting review",
      value: `${metrics.submitted}`,
      note: "Already sent to your manager"
    },
    {
      label: "Needs adjustment",
      value: `${metrics.needsAdjustment}`,
      note: "Returned with manager feedback"
    }
  ];

  const actionItems = [
    {
      title: "Complete your drafting",
      note: `${metrics.draft} KPI item(s) are still in draft`
    },
    {
      title: "Check manager feedback",
      note: metrics.needsAdjustment
        ? `${metrics.needsAdjustment} KPI item(s) need updates before resubmission`
        : "No KPI has been returned for changes"
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">Employee Dashboard</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">{profileName}</h3>
            <p className="mt-2 text-sm text-slate-500">Track what is still in draft, what is with your manager, and what has already been approved.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            <TrendingUp size={16} />
            {loading ? "Refreshing" : "Live status"}
          </div>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-2 text-sm text-slate-500">{card.note}</p>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">Progress snapshot</h4>
          <div className="mt-5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={reportTrend}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="performance" stroke="#4f46e5" strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">Current cycle</h4>
          <div className="mt-5 space-y-4">
            <SnapshotRow label="Total KPIs" value={String(metrics.total)} />
            <SnapshotRow label="Approved KPIs" value={String(metrics.approved)} />
            <SnapshotRow label="Submitted KPIs" value={String(summary ? toNumber(summary.submitted_kpis) : metrics.submitted)} />
            <SnapshotRow label="Draft or returned" value={String(metrics.draft + metrics.needsAdjustment)} />
          </div>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h4 className="text-lg font-semibold text-slate-900">Action center</h4>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {actionItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-neutral-200 p-4">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ManagerDashboard({
  summary,
  team,
  staff,
  loading
}: {
  summary: Extract<DashboardResponse, { role: "manager" }>["summary"] | null;
  team: Extract<DashboardResponse, { role: "manager" }>["team"];
  staff: StaffMember[];
  loading: boolean;
}) {
  const cards = [
    {
      label: "Team overview",
      value: summary ? String(summary.team_members) : "--",
      note: "Active direct reports"
    },
    {
      label: "Pending approvals",
      value: summary ? String(summary.pending_approvals) : "--",
      note: "KPIs awaiting action"
    },
    {
      label: "Returned items",
      value: summary ? String(summary.pending_scoring_tasks) : "--",
      note: "KPIs sent back for employee adjustment"
    }
  ];

  const actionItems = [
    {
      title: "Pending KPI approvals",
      note: summary ? `${summary.pending_approvals} KPI(s) are waiting for manager action` : "No current queue"
    },
    {
      title: "Returned for adjustment",
      note: summary ? `${summary.pending_scoring_tasks} KPI(s) are currently back with employees for updates` : "No current queue"
    },
    {
      title: "Best next step",
      note: "Use KPI Management to review submitted KPIs, then approve them or return them for adjustment."
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">Manager Dashboard</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Team review operations</h3>
            <p className="mt-2 text-sm text-slate-500">See who needs review, who is revising returned KPIs, and where your next approval action should go.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            <BriefcaseBusiness size={16} />
            {loading ? "Refreshing" : "Manager view"}
          </div>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-2 text-sm text-slate-500">{card.note}</p>
          </div>
        ))}
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h4 className="text-lg font-semibold text-slate-900">Team overview</h4>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                {["Staff", "Department", "Pending Approvals", "Returned Items", "Average Score"].map((col) => (
                  <th key={col} className="px-4 py-3 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member.id} className="border-t border-neutral-100">
                  <td className="px-4 py-4 font-medium text-slate-900">
                    {getDisplayNameFromStaff(staff.find((item) => item.id === member.id) ?? {
                      id: member.id,
                      name: member.name,
                      email: "",
                      role: "employee",
                      department: member.department
                    })}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{member.department ?? "Unassigned"}</td>
                  <td className="px-4 py-4 text-slate-600">{member.pending_approvals}</td>
                  <td className="px-4 py-4 text-slate-600">{member.pending_scoring_tasks}</td>
                  <td className="px-4 py-4 text-slate-600">{member.average_score}</td>
                </tr>
              ))}
              {!loading && team.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                    No team members are currently assigned.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h4 className="text-lg font-semibold text-slate-900">Action center</h4>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {actionItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-neutral-200 p-4">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HrDashboard({
  summary,
  departments,
  distribution,
  loading
}: {
  summary: Extract<DashboardResponse, { role: "hr" }>["summary"] | null;
  departments: Extract<DashboardResponse, { role: "hr" }>["departments"];
  distribution: Extract<DashboardResponse, { role: "hr" }>["distribution"] | null;
  loading: boolean;
}) {
  const cards = [
    {
      label: "Department metrics",
      value: summary ? String(summary.departments) : "--",
      note: "Departments under review"
    },
    {
      label: "Completion rates",
      value: summary ? `${summary.completion_rate}%` : "--",
      note: "Completed appraisals"
    },
    {
      label: "Performance distribution",
      value: summary ? String(summary.organization_average_score) : "--",
      note: "Organization average score"
    }
  ];

  const actionItems = [
    {
      title: "Department follow-up",
      note: summary ? `${summary.active_appraisals} active appraisal(s) are in motion across the organization` : "No active appraisals"
    },
    {
      title: "Completion monitoring",
      note: summary ? `${summary.completion_rate}% of appraisals have been completed` : "No cycle progress yet"
    }
  ];

  const distributionChart = distribution
    ? [
        { name: "Needs support", value: toNumber(distribution.needs_support), color: "#ef4444" },
        { name: "Steady", value: toNumber(distribution.steady), color: "#6366f1" },
        { name: "High performing", value: toNumber(distribution.high_performing), color: "#22c55e" }
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">HR Dashboard</p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">Department performance command center</h3>
            <p className="mt-2 text-sm text-slate-500">Monitor completion, compare departments, and spot score distribution at a glance.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
            <ShieldCheck size={16} />
            {loading ? "Refreshing" : "HR control"}
          </div>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{card.value}</p>
            <p className="mt-2 text-sm text-slate-500">{card.note}</p>
          </div>
        ))}
      </section>
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">Department metrics</h4>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  {["Department", "Employees", "Completion", "Average Score"].map((col) => (
                    <th key={col} className="px-4 py-3 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => (
                  <tr key={department.id} className="border-t border-neutral-100">
                    <td className="px-4 py-4 font-medium text-slate-900">{department.name}</td>
                    <td className="px-4 py-4 text-slate-600">{department.employees}</td>
                    <td className="px-4 py-4 text-slate-600">{department.completion_rate}%</td>
                    <td className="px-4 py-4 text-slate-600">{department.average_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">Performance distribution</h4>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={distributionChart} dataKey="value" nameKey="name" outerRadius={110}>
                  {distributionChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h4 className="text-lg font-semibold text-slate-900">Action center</h4>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {actionItems.map((item) => (
            <div key={item.title} className="rounded-2xl border border-neutral-200 p-4">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-2 text-sm text-slate-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function MetricCard({
  title,
  value,
  note,
  tone
}: {
  title: string;
  value: string;
  note: string;
  tone: "indigo" | "green" | "amber" | "slate";
}) {
  const toneStyles: Record<"indigo" | "green" | "amber" | "slate", string> = {
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700"
  };

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneStyles[tone]}`}>
        {title}
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{note}</p>
    </div>
  );
}

function KpiManagement({
  user,
  kpiRows,
  commentHistory,
  onRowChange,
  loading,
  profileName,
  activePeriodName,
  cycleFilter,
  newKpiForm,
  onNewKpiChange,
  onCreateKpi,
  onSaveKpi,
  onDeleteKpi,
  onApproveKpi,
  feedback,
  actionState
}: {
  user: AuthUser;
  kpiRows: Kpi[];
  commentHistory: CommentHistoryItem[];
  onRowChange: (id: number, field: keyof Kpi, value: string) => void;
  loading: boolean;
  profileName: string;
  activePeriodName: string | null;
  cycleFilter: "active" | "all";
  newKpiForm: { title: string; description: string; weight: string; target: string };
  onNewKpiChange: (value: { title: string; description: string; weight: string; target: string }) => void;
  onCreateKpi: () => Promise<void>;
  onSaveKpi: (kpi: Kpi, status?: "draft" | "submitted", achievementNote?: string) => Promise<void>;
  onDeleteKpi: (kpiId: number) => Promise<void>;
  onApproveKpi: (kpi: Kpi, status: "approved" | "rejected", comment?: string) => Promise<void>;
  feedback: KpiFeedback | null;
  actionState: KpiActionState;
}) {
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [employeeNotes, setEmployeeNotes] = useState<Record<number, string>>({});
  const canCreate = user.role === "employee" || user.role === "hr";
  const canEdit = user.role === "employee" || user.role === "hr";
  const canDelete = user.role === "employee" || user.role === "hr";
  const canApprove = user.role === "manager" || user.role === "hr";
  const editableKpis = kpiRows.filter((item) => item.status === "Draft" || item.status === "Rejected");
  const submittedKpis = kpiRows.filter((item) => item.status === "Submitted");
  const approvedCount = kpiRows.filter((item) => item.status === "Approved").length;
  const archivedKpis = kpiRows.filter((item) => item.status === "Submitted" || item.status === "Approved");
  const latestManagerComments = new Map(
    commentHistory
      .filter((item) => item.type === "manager")
      .map((item) => [item.kpi_title, item.comment])
  );
  const latestEmployeeComments = new Map(
    commentHistory
      .filter((item) => item.type === "employee")
      .map((item) => [item.kpi_title, item.comment])
  );
  const createFeedback = feedback?.scope === "create" ? feedback : null;
  const workspaceFeedback = feedback?.scope === "workspace" ? feedback : null;
  const reviewFeedback = feedback?.scope === "review" ? feedback : null;

  const handleReviewAction = async (kpi: Kpi, status: "approved" | "rejected") => {
    await onApproveKpi(kpi, status, reviewNotes[kpi.id]);
    setReviewNotes((current) => ({ ...current, [kpi.id]: "" }));
  };

  useEffect(() => {
    setEmployeeNotes((current) => {
      const next = { ...current };

      editableKpis.forEach((item) => {
        if (next[item.id] === undefined) {
          next[item.id] = latestEmployeeComments.get(item.title) ?? "";
        }
      });

      return next;
    });
  }, [editableKpis, latestEmployeeComments]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Draft" value={String(kpiRows.filter((item) => item.status === "Draft").length)} note="Still with the employee" tone="slate" />
        <MetricCard title="Awaiting Review" value={String(submittedKpis.length)} note="Already sent to the manager" tone="amber" />
        <MetricCard title="Needs Adjustment" value={String(kpiRows.filter((item) => item.status === "Rejected").length)} note="Returned with comments" tone="indigo" />
        <MetricCard title="Approved" value={String(approvedCount)} note="Ready for appraisal scoring" tone="green" />
      </div>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {canApprove ? "Manager review queue" : "Active KPI workspace"}
              </h3>
              <p className="text-sm text-slate-500">
                {canApprove
                  ? `Review KPI submissions for ${profileName}, then approve them or send them back for adjustment.`
                  : `Employees can draft KPIs, record actual achievement, set a 1 to 5 self-score, then submit to the manager.`}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                {cycleFilter === "active"
                  ? `Showing active cycle${activePeriodName ? `: ${activePeriodName}` : ""}`
                  : "Showing all review cycles"}
              </p>
            </div>
            {activePeriodName && (
              <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                {activePeriodName}
              </div>
            )}
          </div>

          {reviewFeedback && canApprove && (
            <div
              className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                reviewFeedback.tone === "error"
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {reviewFeedback.message}
            </div>
          )}

          {workspaceFeedback && !canApprove && (
            <div
              className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                workspaceFeedback.tone === "error"
                  ? "border border-rose-200 bg-rose-50 text-rose-700"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {workspaceFeedback.message}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {canApprove &&
              submittedKpis.map((item) => (
                <div key={item.id} className="rounded-2xl border border-neutral-200 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <KpiPeriodBadge period={item.appraisalPeriod} />
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{item.description || "No description provided yet."}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-2 block font-medium text-slate-700">Achievement / measures expected from staff</span>
                      <textarea
                        rows={4}
                        value={reviewNotes[item.id] ?? item.description ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setReviewNotes((current) => ({ ...current, [item.id]: value }));
                          onRowChange(item.id, "description", value);
                        }}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                        placeholder="List the quality and quantity expectations for this KPI."
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-2 block font-medium text-slate-700">Manager score</span>
                      <select
                        value={item.managerScore ?? ""}
                        onChange={(event) => onRowChange(item.id, "managerScore", event.target.value)}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      >
                        <option value="">Select a score</option>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <option key={score} value={score}>
                            {score} / 5
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      The manager score must be set before approval.
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      disabled={actionState.kind !== null}
                      className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                      onClick={() => void handleReviewAction(item, "approved")}
                    >
                      {actionState.kind === "approve" && actionState.kpiId === item.id ? "Approving..." : "Approve"}
                    </button>
                    <button
                      disabled={actionState.kind !== null}
                      className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-70"
                      onClick={() => void handleReviewAction(item, "rejected")}
                    >
                      {actionState.kind === "return" && actionState.kpiId === item.id ? "Sending back..." : "Send back for adjustment"}
                    </button>
                  </div>
                </div>
              ))}

            {!canApprove &&
              editableKpis.map((item) => (
                <div key={item.id} className="rounded-2xl border border-neutral-200 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <KpiPeriodBadge period={item.appraisalPeriod} />
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                  {item.status === "Rejected" && latestManagerComments.get(item.title) && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Manager feedback: {latestManagerComments.get(item.title)}
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-2 block font-medium text-slate-700">Title</span>
                      <input
                        value={item.title}
                        onChange={(event) => onRowChange(item.id, "title", event.target.value)}
                        disabled={!canEdit}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand disabled:bg-slate-50"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-2 block font-medium text-slate-700">Description</span>
                      <textarea
                        value={item.description ?? ""}
                        onChange={(event) => onRowChange(item.id, "description", event.target.value)}
                        rows={3}
                        disabled={!canEdit}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand disabled:bg-slate-50"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="mb-2 block font-medium text-slate-700">Actual achievement</span>
                      <textarea
                        value={employeeNotes[item.id] ?? ""}
                        onChange={(event) => setEmployeeNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                        rows={4}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                        placeholder="List what you actually achieved for this KPI."
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-2 block font-medium text-slate-700">Staff score</span>
                      <select
                        value={item.selfScore ?? ""}
                        onChange={(event) => onRowChange(item.id, "selfScore", event.target.value)}
                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      >
                        <option value="">Select a score</option>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <option key={score} value={score}>
                            {score} / 5
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      The staff score must be set before sending this KPI to the manager.
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      disabled={actionState.kind !== null}
                      className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white"
                      onClick={() => void onSaveKpi(item, "submitted", employeeNotes[item.id] ?? "")}
                    >
                      {actionState.kind === "submit" && actionState.kpiId === item.id ? "Submitting..." : "Submit to manager"}
                    </button>
                    {canDelete && (
                      <button
                        disabled={actionState.kind !== null}
                        className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
                        onClick={() => void onDeleteKpi(item.id)}
                      >
                        {actionState.kind === "delete" && actionState.kpiId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              ))}

            {!loading && ((canApprove && submittedKpis.length === 0) || (!canApprove && editableKpis.length === 0)) && (
              <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {canApprove
                  ? "There is nothing waiting for manager review here right now."
                  : "There is nothing left to work on here right now. Submitted and approved items have been cleared off this page."}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {canCreate && (
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-slate-900">Create KPI</h3>
              <p className="text-sm text-slate-500">Employees only need to enter the title and description before sending the KPI for approval.</p>
              {createFeedback && (
                <div
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                    createFeedback.tone === "error"
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {createFeedback.message}
                </div>
              )}
              <div className="mt-5 grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Title</span>
                  <input
                    value={newKpiForm.title}
                    onChange={(event) => onNewKpiChange({ ...newKpiForm, title: event.target.value })}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Description</span>
                  <textarea
                    value={newKpiForm.description}
                    onChange={(event) => onNewKpiChange({ ...newKpiForm, description: event.target.value })}
                    rows={4}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                  />
                </label>
                <button
                  disabled={actionState.kind !== null}
                  className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                  onClick={() => void onCreateKpi()}
                >
                  {actionState.kind === "create" ? "Creating KPI..." : "Create KPI"}
                </button>
              </div>
            </div>
          )}

          {canCreate && archivedKpis.length > 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-slate-900">Already in this cycle</h3>
              <p className="text-sm text-slate-500">These KPIs are already submitted or approved in the current appraisal cycle, so they are not shown in the main working area above.</p>
              <div className="mt-5 space-y-3">
                {archivedKpis.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-neutral-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <KpiPeriodBadge period={item.appraisalPeriod} />
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{item.description || "No description provided."}</p>
                    <p className="mt-3 text-sm text-slate-600">This KPI is already in the appraisal flow.</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function AppraisalFlow({
  user,
  kpis,
  loading,
  profileName,
  commentHistory,
  feedback,
  actionState,
  onSubmitSelfScore,
  onSubmitManagerScore,
  onSubmitFinalScore
}: {
  user: AuthUser;
  kpis: Kpi[];
  loading: boolean;
  profileName: string;
  commentHistory: CommentHistoryItem[];
  feedback: AppraisalFeedback;
  actionState: AppraisalActionState;
  onSubmitSelfScore: (kpiId: number, selfScore: number, comment: string) => Promise<void>;
  onSubmitManagerScore: (kpiId: number, managerScore: number, comment: string) => Promise<void>;
  onSubmitFinalScore: (kpiId: number, finalScore: number) => Promise<void>;
}) {
  const approvedKpis = kpis.filter((item) => item.status === "Approved");
  const [selectedKpiId, setSelectedKpiId] = useState<number | null>(approvedKpis[0]?.id ?? null);
  const [employeeAchievements, setEmployeeAchievements] = useState("");
  const [selfScoreInput, setSelfScoreInput] = useState("");
  const [managerExpectations, setManagerExpectations] = useState("");
  const [managerScoreInput, setManagerScoreInput] = useState("");
  const [finalScoreInput, setFinalScoreInput] = useState("");

  useEffect(() => {
    if (approvedKpis.length === 0) {
      setSelectedKpiId(null);
      return;
    }

    setSelectedKpiId((current) => (current && approvedKpis.some((item) => item.id === current) ? current : approvedKpis[0].id));
  }, [approvedKpis]);

  const selectedKpi = approvedKpis.find((item) => item.id === selectedKpiId) ?? approvedKpis[0] ?? null;
  const latestEmployeeComments = new Map<number, string>();
  const latestManagerComments = new Map<number, string>();

  commentHistory.forEach((item) => {
    if (item.type === "employee" && !latestEmployeeComments.has(item.kpi_id)) {
      latestEmployeeComments.set(item.kpi_id, item.comment);
    }
    if (item.type === "manager" && !latestManagerComments.has(item.kpi_id)) {
      latestManagerComments.set(item.kpi_id, item.comment);
    }
  });

  useEffect(() => {
    if (!selectedKpi) return;

    setEmployeeAchievements(latestEmployeeComments.get(selectedKpi.id) ?? "");
    setSelfScoreInput(selectedKpi.selfScore === undefined ? "" : String(selectedKpi.selfScore));
    setManagerExpectations(latestManagerComments.get(selectedKpi.id) ?? "");
    setManagerScoreInput(selectedKpi.managerScore === undefined ? "" : String(selectedKpi.managerScore));
    setFinalScoreInput(selectedKpi.finalScore === undefined ? "" : String(selectedKpi.finalScore));
  }, [selectedKpi, commentHistory]);

  const buildReviewDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setMonth(date.getMonth() + 6);
    return date;
  };

  const reviewDueDate = buildReviewDate(selectedKpi?.appraisalCreatedAt);
  const finalReviewOpen = reviewDueDate ? new Date() >= reviewDueDate : false;
  const selfScoredCount = approvedKpis.filter((item) => item.selfScore !== undefined).length;
  const managerScoredCount = approvedKpis.filter((item) => item.managerScore !== undefined).length;
  const finalReviewCount = approvedKpis.filter((item) => {
    const reviewDate = buildReviewDate(item.appraisalCreatedAt);
    return reviewDate ? new Date() >= reviewDate : false;
  }).length;

  const scoreOptions = ["", "1", "2", "3", "4", "5"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Approved KPIs" value={String(approvedKpis.length)} note={`Manager-approved KPIs for ${profileName}`} tone="slate" />
        <MetricCard title="Self-scored" value={String(selfScoredCount)} note="Employee ratings submitted on the 1 to 5 scale" tone="amber" />
        <MetricCard title="Manager-scored" value={String(managerScoredCount)} note="Manager ratings already captured" tone="indigo" />
        <MetricCard title="Final review due" value={String(finalReviewCount)} note="KPIs eligible for six-month final review" tone="green" />
      </div>

      {feedback && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            feedback.tone === "error"
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">My appraisals</h3>
            <p className="text-sm text-slate-500">Approved KPIs are listed below. Click a row to expand the full appraisal details.</p>
          </div>
          {reviewDueDate && selectedKpi && (
            <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
              Final review opens {reviewDueDate.toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                {["KPI", "Description", "Employee Achievements", "Actual Achievement", "Employee Score", "Manager Score", "Final Score"].map((col) => (
                  <th key={col} className="px-4 py-3 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {approvedKpis.length ? (
                approvedKpis.map((item) => {
                  const isSelected = item.id === selectedKpiId;
                  const itemReviewDate = buildReviewDate(item.appraisalCreatedAt);
                  const itemFinalReviewOpen = itemReviewDate ? new Date() >= itemReviewDate : false;

                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={`cursor-pointer border-t border-neutral-100 ${isSelected ? "bg-brand/5" : "bg-white"}`}
                        onClick={() => setSelectedKpiId(item.id)}
                      >
                        <td className="px-4 py-4 font-medium text-slate-900">{item.title}</td>
                        <td className="px-4 py-4 text-slate-600">{item.description || "--"}</td>
                        <td className="px-4 py-4 text-slate-600">{latestManagerComments.get(item.id) || "--"}</td>
                        <td className="px-4 py-4 text-slate-600">{latestEmployeeComments.get(item.id) || "--"}</td>
                        <td className="px-4 py-4 text-slate-600">{item.selfScore !== undefined ? `${item.selfScore}/5` : "--"}</td>
                        <td className="px-4 py-4 text-slate-600">{item.managerScore !== undefined ? `${item.managerScore}/5` : "--"}</td>
                        <td className="px-4 py-4 text-slate-600">{item.finalScore !== undefined ? `${item.finalScore}/5` : itemFinalReviewOpen ? "Pending" : "Locked"}</td>
                      </tr>
                      {isSelected && (
                        <tr className="border-t border-neutral-100 bg-slate-50">
                          <td colSpan={7} className="px-4 py-5">
                            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                              <div className="space-y-3 xl:col-span-2">
                                <SnapshotRow label="Description" value={item.description || "No description recorded"} />
                                <SnapshotRow label="Employee achievements" value={latestManagerComments.get(item.id) || "Manager expectations have not been recorded yet"} />
                                <SnapshotRow label="Actual achievement" value={latestEmployeeComments.get(item.id) || "Employee actual achievement has not been submitted yet"} />
                                <SnapshotRow label="Review period" value={item.appraisalPeriod || "--"} />
                              </div>
                              <div className="space-y-4">
                                {(user.role === "employee" || user.role === "hr") && (
                                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                                    <p className="font-semibold text-slate-900">Employee scoring</p>
                                    <label className="mt-3 block text-sm">
                                      <span className="mb-2 block font-medium text-slate-700">Actual achievement</span>
                                      <textarea
                                        rows={4}
                                        value={employeeAchievements}
                                        onChange={(event) => setEmployeeAchievements(event.target.value)}
                                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                        placeholder="List what was actually achieved."
                                      />
                                    </label>
                                    <label className="mt-3 block text-sm">
                                      <span className="mb-2 block font-medium text-slate-700">Employee score</span>
                                      <select
                                        value={selfScoreInput}
                                        onChange={(event) => setSelfScoreInput(event.target.value)}
                                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                      >
                                        {scoreOptions.map((value) => (
                                          <option key={value || "blank"} value={value}>
                                            {value ? `${value} / 5` : "Select a score"}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      disabled={actionState.kind !== null || selfScoreInput === "" || employeeAchievements.trim().length < 2}
                                      className="mt-3 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                      onClick={() => void onSubmitSelfScore(item.id, Number(selfScoreInput), employeeAchievements)}
                                    >
                                      {actionState.kind === "selfScore" && actionState.kpiId === item.id ? "Submitting..." : "Submit self-score"}
                                    </button>
                                  </div>
                                )}

                                {(user.role === "manager" || user.role === "hr") && (
                                  <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                                    <p className="font-semibold text-slate-900">Manager scoring</p>
                                    <label className="mt-3 block text-sm">
                                      <span className="mb-2 block font-medium text-slate-700">Employee achievements expected from staff</span>
                                      <textarea
                                        rows={4}
                                        value={managerExpectations}
                                        onChange={(event) => setManagerExpectations(event.target.value)}
                                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                        placeholder="List the expected achievements for this KPI."
                                      />
                                    </label>
                                    <label className="mt-3 block text-sm">
                                      <span className="mb-2 block font-medium text-slate-700">Manager score</span>
                                      <select
                                        value={managerScoreInput}
                                        onChange={(event) => setManagerScoreInput(event.target.value)}
                                        className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                      >
                                        {scoreOptions.map((value) => (
                                          <option key={value || "blank"} value={value}>
                                            {value ? `${value} / 5` : "Select a score"}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      disabled={actionState.kind !== null || managerScoreInput === "" || managerExpectations.trim().length < 2}
                                      className="mt-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                      onClick={() => void onSubmitManagerScore(item.id, Number(managerScoreInput), managerExpectations)}
                                    >
                                      {actionState.kind === "managerScore" && actionState.kpiId === item.id ? "Submitting..." : "Submit manager score"}
                                    </button>
                                  </div>
                                )}

                                <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                                  <p className="font-semibold text-slate-900">Final review after six months</p>
                                  <p className="mt-2 text-sm text-slate-500">
                                    {itemReviewDate
                                      ? `Final review opens on ${itemReviewDate.toLocaleDateString()}.`
                                      : "Final review opens six months after the appraisal record is created."}
                                  </p>
                                  {(user.role === "manager" || user.role === "hr") && (
                                    <>
                                      <label className="mt-3 block text-sm">
                                        <span className="mb-2 block font-medium text-slate-700">Final score</span>
                                        <select
                                          value={finalScoreInput}
                                          onChange={(event) => setFinalScoreInput(event.target.value)}
                                          disabled={!itemFinalReviewOpen}
                                          className="w-full rounded-2xl border border-neutral-200 px-4 py-3 disabled:bg-slate-50"
                                        >
                                          {scoreOptions.map((value) => (
                                            <option key={value || "blank"} value={value}>
                                              {value ? `${value} / 5` : "Select a score"}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <button
                                        disabled={actionState.kind !== null || !itemFinalReviewOpen || finalScoreInput === ""}
                                        className="mt-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                        onClick={() => void onSubmitFinalScore(item.id, Number(finalScoreInput))}
                                      >
                                        {actionState.kind === "finalScore" && actionState.kpiId === item.id ? "Saving..." : "Record final score"}
                                      </button>
                                    </>
                                  )}
                                  {!itemFinalReviewOpen && (
                                    <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                                      Final review is locked until the six-month window is reached.
                                    </div>
                                  )}
                                  {item.finalScore !== undefined && (
                                    <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                      Final score captured. This KPI is ready for printing. Email delivery is not yet implemented in the backend.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-sm text-slate-500">
                    {loading ? "Loading approved KPIs..." : "No approved KPI is in My Appraisals yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReviewsPanel({
  user,
  dashboard,
  staff,
  kpiRows,
  selectedProfileId,
  onApproveKpi
}: {
  user: AuthUser;
  dashboard: DashboardResponse | null;
  staff: StaffMember[];
  kpiRows: Kpi[];
  selectedProfileId: number | null;
  onApproveKpi: (kpi: Kpi, status: "approved" | "rejected", comment?: string) => Promise<void>;
}) {
  if (user.role === "manager" && dashboard?.role === "manager") {
    return (
      <section className="space-y-5">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Manager focus</p>
          <p className="mt-2 text-sm text-amber-800">
            Start with the employee who has the highest pending approvals, then use KPI Management to approve the KPI or return it for adjustment.
          </p>
        </div>
        {dashboard.team.map((member) => {
          const staffMatch = staff.find((item) => item.id === member.id);
          const name = staffMatch ? getDisplayNameFromStaff(staffMatch) : member.name;

          return (
            <div key={member.id} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
                  <p className="text-sm text-slate-500">{member.department ?? "No department assigned"}</p>
                </div>
                <div className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                  {member.pending_approvals} approvals pending
                </div>
              </div>
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <SnapshotRow label="Pending approvals" value={String(member.pending_approvals)} />
                  <SnapshotRow label="Returned items" value={selectedProfileId === member.id ? String(kpiRows.filter((item) => item.status === "Rejected").length) : "--"} />
                  <SnapshotRow label="Review readiness" value={toNumber(member.pending_approvals) === 0 ? "Clear" : "Action needed"} />
                </div>
                {selectedProfileId === member.id && kpiRows.some((item) => item.status === "Submitted") && (
                  <div className="mt-5 space-y-3">
                    {kpiRows
                      .filter((item) => item.status === "Submitted")
                      .map((item) => (
                        <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{item.title}</p>
                            <p className="text-sm text-slate-500">Open this KPI to continue the appraisal scoring flow.</p>
                          </div>
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            Open this employee in KPI Management if you want to review the KPI and add manager feedback before approval.
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                              onClick={() => void onApproveKpi(item, "approved")}
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {selectedProfileId !== member.id && toNumber(member.pending_approvals) > 0 && (
                  <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Switch the staff focus above to this employee to work on their submitted KPIs.
                  </div>
                )}
              </div>
            );
          })}
      </section>
    );
  }

  if (user.role === "hr" && dashboard?.role === "hr") {
    return (
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h3 className="text-lg font-semibold text-slate-900">Department review queue</h3>
          <div className="mt-5 space-y-4">
            {dashboard.departments.map((department) => (
              <div key={department.id} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{department.name}</p>
                    <p className="text-sm text-slate-500">{department.employees} employees in cycle</p>
                  </div>
                  <div className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                    {department.completion_rate}% complete
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <SnapshotRow label="Average score" value={String(department.average_score)} />
                  <SnapshotRow label="Completion rate" value={`${department.completion_rate}%`} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h3 className="text-lg font-semibold text-slate-900">Review oversight</h3>
          <p className="mt-2 text-sm text-slate-500">Track which teams are moving smoothly and where follow-up is still needed.</p>
          <div className="mt-6 space-y-4">
            <SnapshotRow label="Active appraisals" value={String(dashboard.summary.active_appraisals)} />
            <SnapshotRow label="Organization completion" value={`${dashboard.summary.completion_rate}%`} />
            <SnapshotRow label="Average final score" value={String(dashboard.summary.organization_average_score)} />
          </div>
        </div>
      </section>
    );
  }

  if (user.role === "employee") {
    return (
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h3 className="text-lg font-semibold text-slate-900">Review status</h3>
        <p className="mt-2 text-sm text-slate-500">Use Appraisals to track manager feedback and use the KPI page to handle drafting, adjustments, and resubmission.</p>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <SnapshotRow label="Submitted KPIs" value={String(kpiRows.filter((item) => item.status === "Submitted").length)} />
          <SnapshotRow label="Needs adjustment" value={String(kpiRows.filter((item) => item.status === "Rejected").length)} />
          <SnapshotRow label="Approved" value={String(kpiRows.filter((item) => item.status === "Approved").length)} />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <h3 className="text-lg font-semibold text-slate-900">Review workflow</h3>
        <p className="mt-2 text-sm text-slate-500">Use the KPI page for the active review queue and the Appraisals page for scoring, final review, and action tracking.</p>
    </section>
  );
}

function Reports({
  user,
  token,
  dashboard,
  staff,
  departments,
  reviewPeriods
}: {
  user: AuthUser;
  token: string;
  dashboard: DashboardResponse | null;
  staff: StaffMember[];
  departments: Department[];
  reviewPeriods: ReviewPeriod[];
}) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>(String(user.id));
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all");
  const [userReport, setUserReport] = useState<UserReportResponse | null>(null);
  const [departmentReport, setDepartmentReport] = useState<DepartmentReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user.role !== "hr") return;
    if (!selectedDepartmentId && departments[0]?.id) {
      setSelectedDepartmentId(String(departments[0].id));
    }
  }, [departments, selectedDepartmentId, user.role]);

  useEffect(() => {
    if (user.role === "employee") {
      setSelectedUserId(String(user.id));
      return;
    }

    if (staff[0]?.id && !staff.some((member) => String(member.id) === selectedUserId)) {
      setSelectedUserId(String(staff[0].id));
    } else if (!selectedUserId && staff[0]?.id) {
      setSelectedUserId(String(staff[0].id));
    }
  }, [selectedUserId, staff, user]);

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      setLoading(true);
      setError("");
      try {
        const tasks: Array<Promise<unknown>> = [];
        const isHr = user.role === "hr";
        const reportUserId = user.role === "employee" ? user.id : Number(selectedUserId);

        if (reportUserId) {
          tasks.push(getUserReport(reportUserId, token));
        } else {
          tasks.push(Promise.resolve(null));
        }

        if (isHr && selectedDepartmentId) {
          tasks.push(getDepartmentReport(Number(selectedDepartmentId), token));
        } else {
          tasks.push(Promise.resolve(null));
        }

        const [userResult, departmentResult] = await Promise.all(tasks);

        if (!cancelled) {
          setUserReport((userResult as UserReportResponse | null) ?? null);
          setDepartmentReport((departmentResult as DepartmentReportResponse | null) ?? null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load report data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [selectedDepartmentId, selectedUserId, token, user]);

  const barData =
    user.role === "hr" && departmentReport?.periods?.length
      ? departmentReport.periods
          .filter((item) => selectedPeriod === "all" || item.period === selectedPeriod)
          .map((item) => ({
          period: item.period,
          score: toNumber(item.average_score),
          completion: toNumber(item.completion_rate)
        }))
      : userReport?.periods
          .filter((item) => selectedPeriod === "all" || item.period === selectedPeriod)
          .map((item) => ({
          period: item.period,
          score: toNumber(item.average_score),
          completion:
            item.status === "completed"
              ? 100
              : item.employee_signed && item.manager_signed
                ? 100
                : item.employee_signed || item.manager_signed
                  ? 60
                  : 25
        })) ?? [];

  const lineData =
    userReport?.periods
      .filter((item) => selectedPeriod === "all" || item.period === selectedPeriod)
      .map((item) => ({
      month: item.period,
      performance: toNumber(item.average_score)
    })) ?? [];

  const availablePeriods = Array.from(
    new Set([
      ...reviewPeriods.map((item) => item.name),
      ...(userReport?.periods.map((item) => item.period) ?? []),
      ...(departmentReport?.periods.map((item) => item.period) ?? [])
    ])
  );

  const filteredKpis =
    userReport?.kpis.filter((item) => selectedPeriod === "all" || item.period === selectedPeriod) ?? [];

  const filteredDepartmentEmployees =
    departmentReport?.employees.filter((item) => selectedPeriod === "all" || item.period === selectedPeriod) ?? [];

  const filteredUserPeriods =
    userReport?.periods.filter((item) => selectedPeriod === "all" || item.period === selectedPeriod) ?? [];

  const selectedStaff = staff.find((member) => String(member.id) === selectedUserId);

  const exportCsv = () => {
    const rows =
      filteredKpis.map((item) => ({
        period: item.period,
        title: item.title,
        status: item.status,
        weight: item.weight,
        target: item.target,
        actual: item.actual ?? "",
        self_score: item.self_score ?? "",
        manager_score: item.manager_score ?? "",
        final_score: item.final_score ?? "",
        variance: item.variance
      })) ?? [];

    if (rows.length === 0) {
      setError("There is no report data to export yet.");
      return;
    }

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header as keyof typeof row] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `news-central-report-${selectedStaff?.name ?? getDisplayName(user)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const reportTitle = selectedStaff?.name ?? getDisplayName(user);
    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!reportWindow) {
      setError("Allow pop-ups to export the PDF report.");
      return;
    }

    const rows = filteredKpis
      .map(
        (item) => `
          <tr>
            <td>${item.period}</td>
            <td>${item.title}</td>
            <td>${item.status}</td>
            <td>${item.final_score ?? "--"}</td>
            <td>${item.variance}</td>
          </tr>
        `
      )
      .join("");

    reportWindow.document.write(`
      <html>
        <head>
          <title>News Central Report</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1, h2, p { margin: 0; }
            .meta { margin-top: 8px; color: #475569; font-size: 14px; }
            .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
            .card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; background: #f8fafc; }
            .label { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
            .value { margin-top: 8px; font-size: 26px; font-weight: 700; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 24px; }
            th, td { border-bottom: 1px solid #e2e8f0; padding: 12px; text-align: left; font-size: 14px; }
            th { color: #64748b; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>News Central Performance Report</h1>
          <p class="meta">${reportTitle}${selectedPeriod !== "all" ? ` | ${selectedPeriod}` : ""}</p>
          <div class="grid">
            <div class="card"><div class="label">Average final score</div><div class="value">${userReport ? toNumber(userReport.summary.average_final_score).toFixed(1) : "0.0"}</div></div>
            <div class="card"><div class="label">KPI achievement</div><div class="value">${userReport ? toNumber(userReport.summary.achievement_rate).toFixed(1) : "0.0"}%</div></div>
            <div class="card"><div class="label">Score variance</div><div class="value">${userReport ? toNumber(userReport.summary.score_variance).toFixed(1) : "0.0"}</div></div>
            <div class="card"><div class="label">Completion rate</div><div class="value">${userReport ? ((toNumber(userReport.summary.completed_appraisals) / Math.max(toNumber(userReport.summary.appraisal_count), 1)) * 100).toFixed(1) : "0.0"}%</div></div>
          </div>
          <h2>KPI Details</h2>
          <table>
            <thead>
              <tr><th>Period</th><th>KPI</th><th>Status</th><th>Final Score</th><th>Variance</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">No rows available for this filter.</td></tr>'}</tbody>
          </table>
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Reports and exports</h3>
            <p className="text-sm text-slate-500">Live performance reporting across users, departments, and review cycles.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            {user.role !== "employee" && (
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
              >
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {getDisplayNameFromStaff(member)}
                  </option>
                ))}
              </select>
            )}
            {user.role === "hr" && (
              <select
                value={selectedDepartmentId}
                onChange={(event) => setSelectedDepartmentId(event.target.value)}
                className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={selectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value)}
              className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm"
            >
              <option value="all">All periods</option>
              {availablePeriods.map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
            <button
              onClick={exportCsv}
              className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Export CSV
            </button>
            <button
              onClick={exportPdf}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Export PDF
            </button>
          </div>
        </div>
        {(error || loading) && (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
              error ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {error || "Loading report data..."}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Average final score"
          value={userReport ? toNumber(userReport.summary.average_final_score).toFixed(1) : dashboard ? toNumber(getDashboardAverageScore(dashboard.summary)).toFixed(1) : "0.0"}
          note="Live from submitted reviews"
          tone="indigo"
        />
        <MetricCard
          title="KPI achievement"
          value={`${userReport ? toNumber(userReport.summary.achievement_rate).toFixed(1) : departmentReport?.summary ? toNumber(departmentReport.summary.achievement_rate).toFixed(1) : 0}%`}
          note="Actual vs target attainment"
          tone="green"
        />
        <MetricCard
          title="Score variance"
          value={userReport ? toNumber(userReport.summary.score_variance).toFixed(1) : departmentReport?.summary ? toNumber(departmentReport.summary.score_variance).toFixed(1) : "0.0"}
          note="Employee vs manager gap"
          tone="amber"
        />
        <MetricCard
          title="Completion rate"
          value={`${user.role === "hr" && departmentReport?.summary ? toNumber(departmentReport.summary.completion_rate).toFixed(1) : userReport ? ((toNumber(userReport.summary.completed_appraisals) / Math.max(toNumber(userReport.summary.appraisal_count), 1)) * 100).toFixed(1) : 0}%`}
          note="Signed or completed appraisals"
          tone="slate"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">
            {user.role === "hr" ? "Department performance by period" : "Performance by review period"}
          </h4>
          <div className="mt-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="period" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                <Bar dataKey="completion" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">Score trend</h4>
          <div className="mt-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="performance" stroke="#0f172a" strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">Individual report details</h4>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                <tr>
                  {["Period", "KPI", "Status", "Final", "Variance"].map((col) => (
                    <th key={col} className="px-4 py-3 font-semibold">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredKpis.map((item, index) => (
                  <tr key={`${item.period}-${item.title}-${index}`} className="border-t border-neutral-100">
                    <td className="px-4 py-4 text-slate-600">{item.period}</td>
                    <td className="px-4 py-4 font-medium text-slate-900">{item.title}</td>
                    <td className="px-4 py-4 text-slate-600 capitalize">{item.status}</td>
                    <td className="px-4 py-4 text-slate-600">{item.final_score ?? "--"}</td>
                    <td className="px-4 py-4 text-slate-600">{item.variance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredKpis.length && !loading && (
              <div className="px-4 py-6 text-sm text-slate-500">No KPI report rows are available yet.</div>
            )}
          </div>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">
            {user.role === "hr" ? "Department progress" : "Review periods"}
          </h4>
          <div className="mt-5 space-y-4">
            {(user.role === "hr" ? filteredDepartmentEmployees : filteredUserPeriods).map((item, index) => (
              <div key={index} className="rounded-2xl border border-neutral-200 p-4">
                {user.role === "hr" ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{(item as DepartmentReportResponse["employees"][number]).name}</p>
                      <p className="text-sm capitalize text-slate-500">{(item as DepartmentReportResponse["employees"][number]).status.replace("_", " ")}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                      <span>{(item as DepartmentReportResponse["employees"][number]).period}</span>
                      <span>Avg {(item as DepartmentReportResponse["employees"][number]).average_score}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{(item as UserReportResponse["periods"][number]).period}</p>
                      <p className="text-sm capitalize text-slate-500">{(item as UserReportResponse["periods"][number]).status.replace("_", " ")}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                      <span>{(item as UserReportResponse["periods"][number]).kpi_count} KPIs</span>
                      <span>Avg {(item as UserReportResponse["periods"][number]).average_score}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {user.role === "hr" && !filteredDepartmentEmployees.length && !loading && (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No department progress data is available yet.</div>
            )}
            {user.role !== "hr" && !filteredUserPeriods.length && !loading && (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No review periods have been captured yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsPanel({
  user,
  token,
  staff,
  departments,
  reviewPeriods,
  activeReviewPeriod,
  onDirectoryRefresh
}: {
  user: AuthUser;
  token: string;
  staff: StaffMember[];
  departments: Department[];
  reviewPeriods: ReviewPeriod[];
  activeReviewPeriod: ReviewPeriod | null;
  onDirectoryRefresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee" as Role,
    departmentId: "",
    managerId: ""
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [periodForm, setPeriodForm] = useState({
    name: "",
    startsOn: "",
    endsOn: "",
    isActive: true
  });
  const [staffStatus, setStaffStatus] = useState("");
  const [staffError, setStaffError] = useState("");
  const [periodStatus, setPeriodStatus] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [periodSubmitting, setPeriodSubmitting] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const managers = staff.filter((member) => member.role === "manager");
  const reportingLeaders = staff.filter(
    (member) => member.role !== "employee" && member.id !== editingId
  );

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      password: "",
      role: "employee",
      departmentId: "",
      managerId: ""
    });
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStaffStatus("");
    setStaffError("");

    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        managerId:
          (form.role === "employee" || form.role === "manager") && form.managerId
            ? Number(form.managerId)
            : null
      };

      if (editingId) {
        await updateStaff(token, editingId, payload);
        setStaffStatus("Staff record updated.");
      } else {
        await createStaff(token, {
          ...payload,
          password: form.password
        });
        setStaffStatus("Staff account created.");
      }

      await onDirectoryRefresh();
      resetForm();
    } catch (submitError) {
      setStaffError(submitError instanceof Error ? submitError.message : "Unable to save staff record");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setForm({
      name: getDisplayNameFromStaff(member),
      email: member.email,
      password: "",
      role: member.role,
      departmentId: departments.find((department) => department.name === member.department)?.id?.toString() ?? "",
      managerId: member.manager_id ? String(member.manager_id) : ""
    });
    setStaffStatus("");
    setStaffError("");
  };

  const handleDelete = async (member: StaffMember) => {
    const confirmed = window.confirm(
      `Delete ${getDisplayNameFromStaff(member)}? This only works for users without linked appraisal records.`
    );
    if (!confirmed) return;

    try {
      await deleteStaff(token, member.id);
      setStaffStatus("Staff account deleted.");
      setStaffError("");
      await onDirectoryRefresh();
      if (editingId === member.id) {
        resetForm();
      }
    } catch (deleteError) {
      setStaffError(deleteError instanceof Error ? deleteError.message : "Unable to delete staff account");
    }
  };

  const handlePasswordReset = async (member: StaffMember) => {
    const newPassword = window.prompt(
      `Enter a new password for ${getDisplayNameFromStaff(member)}:`,
      "password"
    );
    if (!newPassword) return;

    try {
      await resetStaffPassword(token, member.id, newPassword);
      setStaffStatus(`Password reset for ${getDisplayNameFromStaff(member)}.`);
      setStaffError("");
    } catch (resetError) {
      setStaffError(resetError instanceof Error ? resetError.message : "Unable to reset password");
    }
  };

  const handleCreatePeriod = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPeriodSubmitting(true);
    setPeriodStatus("");
    setPeriodError("");

    try {
      await createReviewPeriodRequest(token, {
        name: periodForm.name,
        startsOn: periodForm.startsOn || null,
        endsOn: periodForm.endsOn || null,
        isActive: periodForm.isActive
      });
      await onDirectoryRefresh();
      setPeriodForm({
        name: "",
        startsOn: "",
        endsOn: "",
        isActive: true
      });
      setPeriodStatus("Review period created.");
    } catch (periodError) {
      setPeriodError(periodError instanceof Error ? periodError.message : "Unable to create review period");
    } finally {
      setPeriodSubmitting(false);
    }
  };

  const handleSetActivePeriod = async (periodId: number) => {
    setPeriodSubmitting(true);
    setPeriodStatus("");
    setPeriodError("");

    try {
      await setActiveReviewPeriodRequest(token, periodId);
      await onDirectoryRefresh();
      setPeriodStatus("Active review period updated.");
    } catch (periodError) {
      setPeriodError(periodError instanceof Error ? periodError.message : "Unable to activate review period");
    } finally {
      setPeriodSubmitting(false);
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordSubmitting(true);
    setPasswordStatus("");
    setPasswordError("");

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error("New password and confirmation must match.");
      }

      await changePasswordRequest(token, passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setPasswordStatus("Password changed successfully.");
    } catch (changeError) {
      setPasswordError(changeError instanceof Error ? changeError.message : "Unable to change password");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <section className="space-y-6">
      {user.role === "hr" ? (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Appraisal periods</h3>
                <p className="text-sm text-slate-500">Set the active review cycle so KPI creation and reporting stay aligned.</p>
              </div>
              <div className="rounded-2xl bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
                Active: {activeReviewPeriod?.name ?? "Not set"}
              </div>
            </div>
            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleCreatePeriod}>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Period name</span>
                <input
                  value={periodForm.name}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                  placeholder="2027 Annual Review"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Starts on</span>
                <input
                  type="date"
                  value={periodForm.startsOn}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, startsOn: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Ends on</span>
                <input
                  type="date"
                  value={periodForm.endsOn}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, endsOn: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={periodForm.isActive}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Make active immediately
              </label>
              <div className="md:col-span-2">
                <button
                  disabled={periodSubmitting}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {periodSubmitting ? "Saving..." : "Create review period"}
                </button>
              </div>
            </form>
            {(periodStatus || periodError) && (
              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                  periodError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {periodError || periodStatus}
              </div>
            )}
            <div className="mt-6 space-y-3">
              {reviewPeriods.map((period) => (
                <div key={period.id} className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{period.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {period.starts_on || "No start date"} to {period.ends_on || "No end date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {period.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <button
                        disabled={periodSubmitting}
                        className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-70"
                        onClick={() => void handleSetActivePeriod(period.id)}
                      >
                        Set active
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">User management</h3>
                <p className="text-sm text-slate-500">Create and maintain real staff accounts for the live system.</p>
              </div>
              {editingId && (
                <button
                  className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              )}
            </div>
            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Full name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Email</span>
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Role</span>
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as Role,
                      managerId:
                        event.target.value === "employee" || event.target.value === "manager"
                          ? current.managerId
                          : ""
                    }))
                  }
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr">HR</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Department</span>
                <select
                  value={form.departmentId}
                  onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                >
                  <option value="">Select department</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              {!editingId && (
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Temporary password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                  />
                </label>
              )}
              {(form.role === "employee" || form.role === "manager") && (
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">
                    {form.role === "manager" ? "Managing director" : "Reporting manager"}
                  </span>
                  <select
                    value={form.managerId}
                    onChange={(event) => setForm((current) => ({ ...current, managerId: event.target.value }))}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                  >
                    <option value="">{form.role === "manager" ? "Select managing director" : "Select manager"}</option>
                    {(form.role === "manager" ? reportingLeaders : managers).map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {getDisplayNameFromStaff(manager)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(staffStatus || staffError) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
                    staffError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {staffError || staffStatus}
                </div>
              )}
              <div className="md:col-span-2">
                <button
                  disabled={submitting}
                  className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {submitting ? "Saving..." : editingId ? "Update staff" : "Create staff account"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Change password</h3>
                <p className="text-sm text-slate-500">Let staff replace temporary or existing passwords with one they prefer.</p>
              </div>
            </div>
            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleChangePassword}>
              <label className="text-sm md:col-span-2">
                <span className="mb-2 block font-medium text-slate-700">Current password</span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">New password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Confirm new password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              {(passwordStatus || passwordError) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
                    passwordError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {passwordError || passwordStatus}
                </div>
              )}
              <div className="md:col-span-2">
                <button
                  disabled={passwordSubmitting}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {passwordSubmitting ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Staff directory</h3>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    {["Name", "Email", "Role", "Department", "Actions"].map((col) => (
                      <th key={col} className="px-4 py-3 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <tr key={member.id} className="border-t border-neutral-100">
                      <td className="px-4 py-4 font-medium text-slate-900">{getDisplayNameFromStaff(member)}</td>
                      <td className="px-4 py-4 text-slate-600">{member.email}</td>
                      <td className="px-4 py-4 text-slate-600 capitalize">{member.role}</td>
                      <td className="px-4 py-4 text-slate-600">{member.department ?? "Unassigned"}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-slate-700"
                            onClick={() => handleEdit(member)}
                          >
                            Edit
                          </button>
                          <button
                            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-brand"
                            onClick={() => handlePasswordReset(member)}
                          >
                            Reset password
                          </button>
                          <button
                            className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-rose-600"
                            onClick={() => handleDelete(member)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Current session</h3>
            <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-[28px] bg-slate-50 p-6">
              <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5">
                <h4 className="text-center text-xl font-bold text-slate-900">{getDisplayName(user)}</h4>
                <p className="mt-2 text-center text-sm text-slate-500">Authenticated workspace session</p>
                <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-neutral-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Email</p>
                    <p className="mt-1 font-semibold text-slate-900">{user.email}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Role</p>
                    <p className="mt-1 font-semibold capitalize text-slate-900">{user.role}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Department ID</p>
                    <p className="mt-1 font-semibold text-slate-900">{user.departmentId ?? "None"}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Change password</h3>
            <p className="mt-1 text-sm text-slate-500">Replace your current password with one you prefer.</p>
            <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleChangePassword}>
              <label className="text-sm md:col-span-2">
                <span className="mb-2 block font-medium text-slate-700">Current password</span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">New password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Confirm new password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              {(passwordStatus || passwordError) && (
                <div
                  className={`rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
                    passwordError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {passwordError || passwordStatus}
                </div>
              )}
              <div className="md:col-span-2">
                <button
                  disabled={passwordSubmitting}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
                >
                  {passwordSubmitting ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default App;
