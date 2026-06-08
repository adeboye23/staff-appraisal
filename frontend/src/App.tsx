import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  BriefcaseBusiness,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileBarChart2,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Menu,
  MoreVertical,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  UserCog,
  Users,
  Workflow,
  Wrench,
  Trash2,
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
import jsPDF from "jspdf";
import {
  approveKpi as approveKpiRequest,
  bulkOnboardStaff,
  changePassword as changePasswordRequest,
  completePasswordReset,
  acceptInvitation as acceptInvitationRequest,
  createDepartment as createDepartmentRequest,
  createReviewPeriod as createReviewPeriodRequest,
  createStaff,
  createKpi as createKpiRequest,
  deleteDepartment as deleteDepartmentRequest,
  deleteKpiById,
  deleteStaff,
  getDepartmentReport,
  getNotifications,
  getStaffInvitations,
  getOrganizationReport,
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
  resendStaffInvitation,
  resetStaffPassword,
  revokeStaffInvitation,
  setActiveReviewPeriod as setActiveReviewPeriodRequest,
  submitDirectorReview,
  submitFinalScore,
  submitManagerScore,
  submitSelfAppraisal,
  updateDepartment as updateDepartmentRequest,
  updateKpi as updateKpiRequest,
  updateStaff,
  updateStaffStatus,
  validateInvitation as validateInvitationRequest
} from "./api";
import companyLogo from "./assets/news-central-logo-photo.jpg";
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
  StaffInvitation,
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

type BulkInviteRole = "employee" | "manager" | "hr";

function getSidebarSections(role: Role) {
  return [
    { label: "Workspace", keys: ["dashboard"] },
    { label: "Performance", keys: ["appraisals", "kpis", "reviews", "reports"] },
    { label: hasAdminAccess(role) ? "HR & People" : "Account", keys: ["settings"] }
  ];
}

function getRoleBadgeClass(role: Role) {
  if (role === "hr" || role === "super_admin") {
    return "bg-brand-50 text-brand ring-1 ring-brand/15";
  }
  if (role === "manager") {
    return "bg-slate-900/5 text-slate-800 ring-1 ring-slate-900/10";
  }
  return "bg-slate-100 text-slate-600 ring-1 ring-slate-200";
}

function getAccountStatusBadgeClass(status?: string | null) {
  if (status === "deactivated" || status === "revoked") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  if (status === "pending") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
  if (status === "accepted" || status === "active") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

const storageKey = "news-central-auth";

const nameOverrides: Record<string, string> = {};

type SessionState = LoginResponse | null;
type KpiActionKind = "create" | "save" | "submit" | "delete" | "approve" | "return";
type KpiActionState = { kind: KpiActionKind | null; kpiId?: number };
type KpiFeedback = {
  scope: "create" | "workspace" | "review";
  tone: "success" | "error";
  message: string;
};
type AppraisalActionKind = "selfScore" | "managerScore" | "finalScore" | "directorReview";
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
    appraisal_review_date?: string | null;
    appraisal_evaluation_unlocked_by_hr?: boolean;
    appraisal_evaluation_unlocked_at?: string | null;
    appraisal_director_overall_remark?: string | null;
    appraisal_director_improvement_suggestions?: string | null;
    appraisal_director_training_recommendations?: string | null;
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
      appraisalReviewDate: item.appraisal_review_date ?? null,
      appraisalEvaluationUnlockedByHr: item.appraisal_evaluation_unlocked_by_hr,
      appraisalEvaluationUnlockedAt: item.appraisal_evaluation_unlocked_at ?? null,
      appraisalDirectorOverallRemark: item.appraisal_director_overall_remark ?? null,
      appraisalDirectorImprovementSuggestions: item.appraisal_director_improvement_suggestions ?? null,
      appraisalDirectorTrainingRecommendations: item.appraisal_director_training_recommendations ?? null,
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
      targetSelfScore:
        performance?.target_self_score === null || performance?.target_self_score === undefined
          ? undefined
          : Number(performance.target_self_score),
      selfScore:
        performance?.self_score === null || performance?.self_score === undefined
          ? undefined
          : Number(performance.self_score),
      managerScore:
        performance?.manager_score === null || performance?.manager_score === undefined
          ? undefined
          : Number(performance.manager_score),
      managerScoreLocked: Boolean(performance?.manager_score_locked),
      finalScore:
        performance?.final_score === null || performance?.final_score === undefined
          ? undefined
          : Number(performance.final_score)
    };
  });
}

function getDisplayName(user: Pick<AuthUser, "email">) {
  return "name" in user && typeof user.name === "string"
    ? user.name
    : nameOverrides[user.email] || user.email.split("@")[0];
}

function getDisplayNameFromStaff(staff: StaffMember) {
  return nameOverrides[staff.email] || staff.name;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function toScorePercent(value: string | number | null | undefined) {
  return Number((toNumber(value) * 20).toFixed(1));
}

function getAggregateFinalScore(kpis: Kpi[]) {
  if (!kpis.length || kpis.some((item) => item.finalScore === undefined)) {
    return null;
  }

  const weightedTotal = kpis.reduce((total, item) => total + (item.finalScore ?? 0) * Math.max(item.weight, 1), 0);
  const totalWeight = kpis.reduce((total, item) => total + Math.max(item.weight, 1), 0);
  return Number((weightedTotal / Math.max(totalWeight, 1)).toFixed(2));
}

function getObjectiveList(description?: string) {
  const cleaned = description?.trim();
  if (!cleaned) return ["No objective note recorded for this KPI."];

  const lines = cleaned
    .split(/\r?\n|;+/)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);

  return lines.length > 1 ? lines : [cleaned];
}

function isReviewDateOpen(reviewDate?: string | null) {
  if (!reviewDate) return true;
  const deadline = new Date(reviewDate);
  if (Number.isNaN(deadline.getTime())) return true;
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() >= Date.now();
}

function getNavItemsForRole(role: Role) {
  const allowedByRole: Record<Role, string[]> = {
    employee: ["dashboard", "kpis", "appraisals", "reports"],
    manager: ["dashboard", "kpis", "appraisals", "reviews", "reports", "settings"],
    hr: ["dashboard", "kpis", "appraisals", "reviews", "reports", "settings"],
    super_admin: ["dashboard", "kpis", "appraisals", "reviews", "reports", "settings"]
  };

  return navItems.filter((item) => allowedByRole[role].includes(item.key));
}

function hasAdminAccess(role?: Role | null) {
  return role === "hr" || role === "super_admin";
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

function BrandLogo({ className = "", withLabel = false }: { className?: string; withLabel?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src={companyLogo} alt="News Central" className="h-12 w-12 rounded-xl object-cover" />
      {withLabel ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">News Central</p>
          <p className="text-sm font-semibold text-slate-900">Performance Portal</p>
        </div>
      ) : null}
    </div>
  );
}

function getDashboardAverageScore(summary: DashboardResponse["summary"]) {
  if ("organization_average_score" in summary) return summary.organization_average_score;
  if ("team_average_score" in summary) return summary.team_average_score;
  if ("average_final_score" in summary) return summary.average_final_score;
  return 0;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  if (rows.length === 0) return false;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
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
    weight: "1",
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
      hasAdminAccess(currentUser.role)
        ? getDepartments(authToken)
        : Promise.resolve({ data: [] as Department[] }),
      getReviewPeriods(authToken)
    ]);

    const selfDirectoryEntry: StaffMember = {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      department: null,
      manager_id: null
    };
    const mergedStaff =
      currentUser.role === "employee"
        ? staffResponse.data
        : [selfDirectoryEntry, ...staffResponse.data.filter((item) => item.id !== currentUser.id)];

    setStaff(mergedStaff);
    setDepartments(departmentsResponse.data);
    setReviewPeriods(periodsResponse.data);
    setActiveReviewPeriod(periodsResponse.active);

    if (currentUser.role === "employee") {
      setSelectedProfileId(currentUser.id);
    } else {
      setSelectedProfileId((current) => {
        if (current && mergedStaff.some((item) => item.id === current)) {
          return current;
        }

        if (preferredProfileId && mergedStaff.some((item) => item.id === preferredProfileId)) {
          return preferredProfileId;
        }

        return mergedStaff[0]?.id ?? null;
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
    setLoadError("");

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
        name: user.name,
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

  useEffect(() => {
    if (!user || !token || !selectedProfileId) return;
    if (activeView !== "appraisals") return;

    const interval = window.setInterval(() => {
      void refreshProfileData();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeView, selectedProfileId, token, user]);

  const pageTitle =
    hasAdminAccess(user?.role)
      ? {
          dashboard: "HR Command Center",
          kpis: "HR KPI Workspace",
          appraisals: "HR Appraisal Control",
          reviews: "HR Review Queue",
          reports: "HR Reporting",
          settings: "HR Settings"
        }[activeView] ?? "HR Command Center"
      : user?.role === "manager"
        ? {
            dashboard: "Manager Overview",
            kpis: "Team KPI Workspace",
            appraisals: "Team Appraisals",
            reviews: "Manager Review Queue",
            reports: "Team Reports",
            settings: "Manager Settings"
          }[activeView] ?? "Manager Overview"
        : {
            dashboard: "My Dashboard",
            kpis: "My KPI Workspace",
            appraisals: "My Appraisals",
            reports: "My Reports",
            settings: "My Settings"
          }[activeView] ?? "My Dashboard";

  const showProfileFocus =
    (user?.role === "manager" || hasAdminAccess(user?.role)) &&
    staff.length > 0 &&
    ["kpis", "appraisals", "reviews"].includes(activeView);

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
        description: newKpiForm.description,
        weight: 1,
        target: newKpiForm.target ? Number(newKpiForm.target) : 0
      });
      await refreshProfileData();
      setNewKpiForm({ title: "", description: "", weight: "1", target: "" });
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

  const handleSaveKpi = async (kpi: Kpi, status?: "draft" | "submitted") => {
    if (!token) return;
    beginKpiAction(status === "submitted" ? "submit" : "save", kpi.id);

    try {
      if (!kpi.title.trim()) {
        throw new Error("KPI title is required before saving.");
      }

      await updateKpiRequest(token, kpi.id, {
        title: kpi.title,
        description: kpi.description,
        weight: kpi.weight || 1,
        target: kpi.target
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

  const handleSubmitSelfScore = async (kpiId: number, selfScore: number) => {
    if (!token) return;
    beginAppraisalAction("selfScore", kpiId);

    try {
      await submitSelfAppraisal(token, { kpiId, selfScore, comment: undefined });
      await refreshProfileData();
      setAppraisalFeedback({ tone: "success", message: "Target self-score saved." });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save the target self-score"
      });
    } finally {
      finishAppraisalAction();
    }
  };

  const handleSubmitAchievement = async (kpiId: number, selfScore: number, achievement: string) => {
    if (!token) return;
    beginAppraisalAction("selfScore", kpiId);

    try {
      await submitSelfAppraisal(token, { kpiId, selfScore, comment: achievement });
      await refreshProfileData();
      setAppraisalFeedback({ tone: "success", message: "Post-review self-score and actual achievement saved." });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save the post-review evaluation"
      });
    } finally {
      finishAppraisalAction();
    }
  };

  const handleSubmitManagerScore = async (kpiId: number, managerScore: number) => {
    if (!token) return;
    beginAppraisalAction("managerScore", kpiId);

    try {
      await submitManagerScore(token, { kpiId, managerScore, comment: undefined });
      await refreshProfileData();
      setAppraisalFeedback({
        tone: "success",
        message: "Manager score submitted, locked, and sent to the staff member for the physical review discussion."
      });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save the manager score"
      });
    } finally {
      finishAppraisalAction();
    }
  };

  const handleSubmitDirectorReview = async (
    appraisalId: number,
    overallRemark: string,
    improvementSuggestions: string,
    trainingRecommendations: string
  ) => {
    if (!token) return;
    beginAppraisalAction("directorReview", appraisalId);

    try {
      await submitDirectorReview(token, {
        appraisalId,
        overallRemark,
        improvementSuggestions: improvementSuggestions || undefined,
        trainingRecommendations: trainingRecommendations || undefined
      });
      await refreshProfileData();
      setAppraisalFeedback({
        tone: "success",
        message: "Director review saved."
      });
    } catch (error) {
      setAppraisalFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to save the director review"
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

  const handlePasswordResetRequest = async (email: string) => {
    setPasswordResetPending(true);
    setLoginError("");
    setPasswordResetStatus("");

    try {
      const response = await requestPasswordReset(email);
      setPasswordResetStatus(response.message);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to request password reset");
    } finally {
      setPasswordResetPending(false);
    }
  };

  const handlePasswordResetComplete = async (payload: { email: string; token: string; newPassword: string }) => {
    setPasswordResetPending(true);
    setLoginError("");
    setPasswordResetStatus("");

    try {
      await completePasswordReset(payload.email, payload.token, payload.newPassword);
      setPasswordResetStatus("Password reset successful. You can sign in with the new password now.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to reset password");
    } finally {
      setPasswordResetPending(false);
    }
  };

  const handleInvitationSetupComplete = async (payload: { token: string; name?: string; password: string }) => {
    setPasswordResetPending(true);
    setLoginError("");
    setPasswordResetStatus("");

    try {
      await acceptInvitationRequest(payload);
      setPasswordResetStatus("Account setup complete. You can sign in now.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to complete account setup");
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
        onRequestPasswordReset={handlePasswordResetRequest}
        onCompletePasswordReset={handlePasswordResetComplete}
        onCompleteInvitationSetup={handleInvitationSetupComplete}
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
              <WorkspaceControls
                activeView={activeView}
                showProfileFocus={showProfileFocus}
                staff={staff}
                selectedProfileId={selectedProfileId}
                setSelectedProfileId={setSelectedProfileId}
                activeReviewPeriod={activeReviewPeriod}
                cycleFilter={cycleFilter}
                setCycleFilter={setCycleFilter}
              />

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
                  isOwnProfile={selectedProfileId === user.id}
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
                  isOwnProfile={selectedProfileId === user.id}
                  kpis={visibleKpiRows}
                  loading={loadingProfile}
                  profileName={profile?.name ?? getDisplayName(user)}
                  commentHistory={commentHistory}
                  feedback={appraisalFeedback}
                  actionState={appraisalActionState}
                  onSubmitSelfScore={handleSubmitSelfScore}
                  onSubmitAchievement={handleSubmitAchievement}
                  onSubmitManagerScore={handleSubmitManagerScore}
                  onSubmitFinalScore={handleSubmitFinalScore}
                  onSubmitDirectorReview={handleSubmitDirectorReview}
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
  onRequestPasswordReset,
  onCompletePasswordReset,
  onCompleteInvitationSetup,
  onSubmit
}: {
  form: { email: string; password: string };
  pending: boolean;
  error: string;
  resetPending: boolean;
  status: string;
  onChange: (value: { email: string; password: string }) => void;
  onRequestPasswordReset: (email: string) => Promise<void>;
  onCompletePasswordReset: (payload: { email: string; token: string; newPassword: string }) => Promise<void>;
  onCompleteInvitationSetup: (payload: { token: string; name?: string; password: string }) => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const resetParams = new URLSearchParams(window.location.search);
  const setupToken = resetParams.get("setupToken") ?? "";
  const [mode, setMode] = useState<"login" | "forgot" | "setup">(
    setupToken ? "setup" : resetParams.get("resetToken") ? "forgot" : "login"
  );
  const [resetForm, setResetForm] = useState({
    email: resetParams.get("email") ?? "",
    token: resetParams.get("resetToken") ?? "",
    newPassword: ""
  });
  const [setupForm, setSetupForm] = useState({
    token: setupToken,
    name: "",
    password: "",
    confirmPassword: ""
  });
  const [setupDetails, setSetupDetails] = useState<{ email: string; name: string; department: string | null } | null>(null);
  const [setupValidationError, setSetupValidationError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const hasResetToken = resetForm.token.trim().length > 0;

  useEffect(() => {
    if (!setupToken) return;

    let cancelled = false;
    setSetupValidationError("");
    validateInvitationRequest(setupToken)
      .then((response) => {
        if (cancelled) return;
        setSetupDetails(response.invitation);
        setSetupForm((current) => ({
          ...current,
          name: response.invitation.name ?? "",
          token: setupToken
        }));
      })
      .catch((validationError) => {
        if (cancelled) return;
        setSetupValidationError(validationError instanceof Error ? validationError.message : "Invitation link is invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [setupToken]);

  return (
    <div className="min-h-screen bg-[#c1121f]">
      <div className="grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden overflow-hidden bg-[#c1121f] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_24%),radial-gradient(circle_at_82%_22%,rgba(255,255,255,0.10),transparent_18%),linear-gradient(145deg,#d71920_0%,#c1121f_42%,#7f0916_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(125deg,transparent_0%,rgba(255,255,255,0.08)_30%,transparent_55%)]" />
          <div className="absolute left-16 top-16 h-px w-40 bg-gradient-to-r from-white/0 via-white/60 to-white/0" />
          <div className="absolute right-20 top-28 h-px w-56 rotate-[-18deg] bg-gradient-to-r from-white/0 via-white/50 to-white/0" />
          <div className="absolute bottom-20 left-16 right-16">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">News Central</p>
            <h1 className="mt-6 max-w-xl text-6xl font-bold leading-[1.02] text-white">
              Performance reviews in one bold, focused workspace.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-white/82">
              Sign in to manage KPIs, review progress, and complete appraisal cycles with a cleaner News Central workflow.
            </p>
          </div>
        </section>
        <section className="flex min-h-screen items-center justify-center bg-[#fff7f7] px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-xl rounded-[32px] border border-white/70 bg-white/95 p-6 shadow-[0_24px_60px_rgba(127,9,22,0.14)] backdrop-blur sm:p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">News Central</p>
                <h2 className="mt-3 text-3xl font-bold text-slate-900">
                  {mode === "login" ? "Sign in to your account" : mode === "setup" ? "Set up your account" : "Reset password"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {mode === "login"
                    ? "Sign in to continue your appraisal workflow."
                    : mode === "setup"
                      ? "Create your password to activate your appraisal workspace."
                    : hasResetToken
                      ? "Set a new password so you can access your workspace."
                      : "Enter your work email and we will send a secure reset link."}
                </p>
              </div>
              <BrandLogo />
            </div>
            <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              {status && (
                <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {status}
                </div>
              )}
              {(error || setupValidationError) && (
                <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error || setupValidationError}
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
              ) : mode === "setup" ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (setupForm.password !== setupForm.confirmPassword) {
                      setSetupValidationError("Password and confirmation must match.");
                      return;
                    }
                    setSetupValidationError("");
                    void onCompleteInvitationSetup({
                      token: setupForm.token,
                      name: setupForm.name.trim() || undefined,
                      password: setupForm.password
                    });
                  }}
                >
                  {setupDetails && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      <p className="font-semibold text-slate-900">{setupDetails.email}</p>
                      <p>{setupDetails.department ?? "Department not assigned"}</p>
                    </div>
                  )}
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Full name</span>
                    <input
                      value={setupForm.name}
                      onChange={(event) => setSetupForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="Enter your full name"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Password</span>
                    <input
                      type="password"
                      value={setupForm.password}
                      onChange={(event) => setSetupForm((current) => ({ ...current, password: event.target.value }))}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="At least 10 characters, upper/lowercase and number"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Confirm password</span>
                    <input
                      type="password"
                      value={setupForm.confirmPassword}
                      onChange={(event) => setSetupForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="Repeat password"
                    />
                  </label>
                  <button
                    disabled={resetPending || Boolean(setupValidationError && !setupDetails)}
                    className="w-full rounded-2xl bg-brand px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {resetPending ? "Activating..." : "Activate account"}
                  </button>
                  <div className="pt-2 text-right">
                    <button type="button" onClick={() => setMode("login")} className="text-sm font-medium text-brand">
                      Back to sign in
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (hasResetToken) {
                      void onCompletePasswordReset(resetForm);
                      return;
                    }

                    void onRequestPasswordReset(resetForm.email);
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
                  {hasResetToken && (
                    <>
                      <label className="block text-sm">
                        <span className="mb-2 block font-medium text-slate-700">Reset token</span>
                        <input
                          value={resetForm.token}
                          onChange={(event) => setResetForm((current) => ({ ...current, token: event.target.value }))}
                          className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                          placeholder="Paste reset token"
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
                    </>
                  )}
                  <button
                    disabled={resetPending}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {resetPending ? "Working..." : hasResetToken ? "Reset password" : "Send reset link"}
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
      <aside className="hidden w-[276px] flex-col justify-between border-r border-red-950/30 bg-[#7f111b] md:flex">
        <SidebarContent activeView={activeView} setActiveView={setActiveView} user={user} />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-label="Close menu" />
          <aside className="relative z-10 flex w-[276px] flex-col justify-between bg-[#7f111b] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">Appraisal</p>
                <div className="mt-2">
                  <img src={companyLogo} alt="News Central" className="h-11 w-11 rounded-lg object-cover" />
                </div>
              </div>
              <button
                className="rounded-lg border border-slate-700/70 bg-transparent p-2 text-slate-300"
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
  const sidebarSections = getSidebarSections(user.role);

  return (
    <>
      <div className="p-5">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">Staff Appraisal</p>
          <div className="mt-3 flex items-center gap-3">
            <img src={companyLogo} alt="News Central" className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/10" />
            <div>
              <p className="text-sm font-semibold text-white">News Central</p>
              <p className="text-xs text-slate-400">Performance suite</p>
            </div>
          </div>
        </div>
        <nav className="space-y-6">
          {sidebarSections.map((section) => {
            const sectionItems = roleNavItems.filter((item) => section.keys.includes(item.key));
            if (!sectionItems.length) return null;
            return (
              <div key={section.label}>
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{section.label}</p>
                <div className="space-y-1">
                  {sectionItems.map((item) => {
                    const Icon = navIcons[item.key as keyof typeof navIcons];
                    const active = activeView === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => setActiveView(item.key)}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                          active
                            ? "bg-white/10 text-white ring-1 ring-inset ring-white/10"
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icon size={18} />
                        <span>{item.key === "settings" && hasAdminAccess(user.role) ? "HR & People" : item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{displayName}</p>
            <div className="mt-1 inline-flex rounded-full bg-indigo-500/15 px-2 py-1 text-xs font-medium capitalize text-indigo-200">
              {user.role}
            </div>
          </div>
          <LogOut size={17} className="shrink-0 text-slate-500" aria-hidden="true" />
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
  const notificationCount = notifications.length + 1;
  const notificationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [notificationsOpen]);

  return (
    <header className="relative z-20 border-b border-neutral-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg border border-neutral-200 bg-white p-2 text-slate-600 md:hidden"
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
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative rounded-lg border border-neutral-200 bg-white p-2.5 text-slate-600"
            >
              <Bell size={18} />
              {notificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              ) : null}
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[340px] rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl">
                <div className="mb-2 px-2 text-sm font-semibold text-slate-900">Notifications</div>
                <div className="max-h-[320px] space-y-2 overflow-y-auto">
                  <div className="rounded-xl bg-slate-900 px-3 py-3 text-left text-white">
                    <p className="text-sm font-semibold">Welcome back.</p>
                    <p className="mt-1 text-xs text-slate-300">Your workspace is ready.</p>
                  </div>
                  {notifications.length ? (
                    notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="block w-full rounded-xl bg-slate-50 px-3 py-3 text-left transition hover:bg-slate-100"
                      >
                        <p className="text-sm font-medium text-slate-900">{item.title ?? "Activity update"}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.message ?? `${item.action.replace(/[._]/g, " ")} recorded.`}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-500">No unread activity is waiting for you right now.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            className="rounded-lg border border-neutral-200 bg-white p-2.5 text-slate-600"
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
                <Line type="monotone" dataKey="performance" stroke="#c1121f" strokeWidth={3} dot={{ r: 5 }} />
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
        { name: "Steady", value: toNumber(distribution.steady), color: "#111827" },
        { name: "High performing", value: toNumber(distribution.high_performing), color: "#c1121f" }
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
  isOwnProfile,
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
  isOwnProfile: boolean;
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
  onSaveKpi: (kpi: Kpi, status?: "draft" | "submitted") => Promise<void>;
  onDeleteKpi: (kpiId: number) => Promise<void>;
  onApproveKpi: (kpi: Kpi, status: "approved" | "rejected", comment?: string) => Promise<void>;
  feedback: KpiFeedback | null;
  actionState: KpiActionState;
}) {
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const canCreate = hasAdminAccess(user.role) || isOwnProfile;
  const canEdit = hasAdminAccess(user.role) || isOwnProfile;
  const canDelete = hasAdminAccess(user.role) || isOwnProfile;
  const canApprove = (user.role === "manager" || hasAdminAccess(user.role)) && !isOwnProfile;
  const editableKpis = kpiRows.filter((item) => item.status === "Draft" || item.status === "Rejected");
  const submittedKpis = kpiRows.filter((item) => item.status === "Submitted");
  const approvedCount = kpiRows.filter((item) => item.status === "Approved").length;
  const archivedKpis = kpiRows.filter((item) => item.status === "Submitted" || item.status === "Approved");
  const latestManagerComments = new Map<number, string>();
  const createFeedback = feedback?.scope === "create" ? feedback : null;
  const workspaceFeedback = feedback?.scope === "workspace" ? feedback : null;
  const reviewFeedback = feedback?.scope === "review" ? feedback : null;

  commentHistory.forEach((item) => {
    if (item.type === "manager" && !latestManagerComments.has(item.kpi_id)) {
      latestManagerComments.set(item.kpi_id, item.comment);
    }
  });

  const handleReviewAction = async (kpi: Kpi, status: "approved" | "rejected") => {
    await onApproveKpi(kpi, status, reviewNotes[kpi.id]);
    setReviewNotes((current) => ({ ...current, [kpi.id]: "" }));
  };

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Draft" value={String(kpiRows.filter((item) => item.status === "Draft").length)} note="Still with the employee" tone="slate" />
        <MetricCard title="Awaiting Review" value={String(submittedKpis.length)} note="Already sent to the manager" tone="amber" />
        <MetricCard title="Needs Adjustment" value={String(kpiRows.filter((item) => item.status === "Rejected").length)} note="Returned with comments" tone="indigo" />
        <MetricCard title="Approved" value={String(approvedCount)} note="Ready for the appraisal page" tone="green" />
      </div>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{canApprove ? "KPI review register" : "KPI working register"}</h3>
              <p className="text-sm text-slate-500">
                {canApprove
                  ? `Review KPI submissions for ${profileName}, then approve or return them with clear guidance.`
                  : "Draft, revise, and submit KPIs from a simpler workspace built for the active cycle."}
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                {cycleFilter === "active"
                  ? `Showing active cycle${activePeriodName ? `: ${activePeriodName}` : ""}`
                  : "Showing all review cycles"}
              </p>
            </div>
            {activePeriodName && <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{activePeriodName}</div>}
          </div>

          {reviewFeedback && canApprove && (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${reviewFeedback.tone === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {reviewFeedback.message}
            </div>
          )}

          {workspaceFeedback && !canApprove && (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${workspaceFeedback.tone === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {workspaceFeedback.message}
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-4">KPI</th>
                    <th className="px-4 py-4">Cycle</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {(canApprove ? submittedKpis : editableKpis).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.description || "No description provided yet."}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{item.appraisalPeriod || "--"}</td>
                      <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{getStatusLabel(item.status)}</span></td>
                      <td className="px-4 py-4 text-sm text-slate-600">{item.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {canApprove &&
              submittedKpis.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{item.description || "No description provided yet."}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:min-w-[280px]">
                      <SnapshotRow label="Cycle" value={item.appraisalPeriod || "--"} />
                      <SnapshotRow label="Target" value={String(item.target)} />
                      <SnapshotRow label="Status" value={getStatusLabel(item.status)} />
                    </div>
                  </div>
                  <label className="mt-5 block text-sm">
                    <span className="mb-2 block font-medium text-slate-700">Manager comment</span>
                    <textarea
                      rows={4}
                      value={reviewNotes[item.id] ?? ""}
                      onChange={(event) => setReviewNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                      className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand"
                      placeholder="Add an approval note or explain what the employee should adjust."
                    />
                  </label>
                  <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                    Approved KPIs move directly into the appraisal workflow after this step.
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button disabled={actionState.kind !== null} className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70" onClick={() => void handleReviewAction(item, "approved")}>
                      {actionState.kind === "approve" && actionState.kpiId === item.id ? "Approving..." : "Approve KPI"}
                    </button>
                    <button disabled={actionState.kind !== null} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-70" onClick={() => void handleReviewAction(item, "rejected")}>
                      {actionState.kind === "return" && actionState.kpiId === item.id ? "Sending back..." : "Return for adjustment"}
                    </button>
                  </div>
                </div>
              ))}

            {!canApprove &&
              editableKpis.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <KpiPeriodBadge period={item.appraisalPeriod} />
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{getStatusLabel(item.status)}</span>
                  </div>
                  {item.status === "Rejected" && latestManagerComments.get(item.id) && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Manager feedback: {latestManagerComments.get(item.id)}
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <label className="text-sm lg:col-span-2">
                      <span className="mb-2 block font-medium text-slate-700">Title</span>
                      <input value={item.title} onChange={(event) => onRowChange(item.id, "title", event.target.value)} disabled={!canEdit} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand disabled:bg-slate-50" />
                    </label>
                    <label className="text-sm lg:col-span-2">
                      <span className="mb-2 block font-medium text-slate-700">Goals</span>
                      <textarea value={item.description ?? ""} onChange={(event) => onRowChange(item.id, "description", event.target.value)} rows={4} disabled={!canEdit} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand disabled:bg-slate-50" />
                    </label>
                    <label className="text-sm">
                      <span className="mb-2 block font-medium text-slate-700">Target</span>
                      <input type="number" min="0" value={item.target} onChange={(event) => onRowChange(item.id, "target", event.target.value)} disabled={!canEdit} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand disabled:bg-slate-50" />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button disabled={actionState.kind !== null} className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-70" onClick={() => void onSaveKpi(item)}>
                      {actionState.kind === "save" && actionState.kpiId === item.id ? "Saving..." : "Save draft"}
                    </button>
                    <button disabled={actionState.kind !== null} className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70" onClick={() => void onSaveKpi(item, "submitted")}>
                      {actionState.kind === "submit" && actionState.kpiId === item.id ? "Submitting..." : "Submit to manager"}
                    </button>
                    {canDelete && (
                      <button disabled={actionState.kind !== null} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:opacity-70" onClick={() => void onDeleteKpi(item.id)}>
                        {actionState.kind === "delete" && actionState.kpiId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              ))}

            {!loading && ((canApprove && submittedKpis.length === 0) || (!canApprove && editableKpis.length === 0)) && (
              <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm text-slate-500">
                {canApprove ? "There is nothing waiting for manager review here right now." : "There is nothing left to work on here right now. Submitted and approved items have been cleared off this page."}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {canCreate && (
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-slate-900">Create KPI</h3>
              <p className="text-sm text-slate-500">Start with the KPI title and goals, then send it to the manager for approval.</p>
              {createFeedback && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${createFeedback.tone === "error" ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  {createFeedback.message}
                </div>
              )}
              <div className="mt-5 grid grid-cols-1 gap-3">
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Title</span>
                  <input value={newKpiForm.title} onChange={(event) => onNewKpiChange({ ...newKpiForm, title: event.target.value })} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand" />
                </label>
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Goals</span>
                  <textarea value={newKpiForm.description} onChange={(event) => onNewKpiChange({ ...newKpiForm, description: event.target.value })} rows={4} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand" />
                </label>
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Target</span>
                  <input type="number" min="0" value={newKpiForm.target} onChange={(event) => onNewKpiChange({ ...newKpiForm, target: event.target.value })} className="w-full rounded-2xl border border-neutral-200 px-4 py-3 outline-none transition focus:border-brand" />
                </label>
                <button disabled={actionState.kind !== null} className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70" onClick={() => void onCreateKpi()}>
                  {actionState.kind === "create" ? "Creating KPI..." : "Create KPI"}
                </button>
              </div>
            </div>
          )}

          {canCreate && archivedKpis.length > 0 && (
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="text-lg font-semibold text-slate-900">Cycle archive</h3>
              <p className="text-sm text-slate-500">Submitted and approved items stay here for reference while the live workspace stays focused.</p>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-4 py-3">KPI</th>
                      <th className="px-4 py-3">Cycle</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {archivedKpis.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.description || "No description provided."}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">{item.appraisalPeriod || "--"}</td>
                        <td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{getStatusLabel(item.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
  isOwnProfile,
  kpis,
  loading,
  profileName,
  commentHistory,
  feedback,
  actionState,
  onSubmitSelfScore,
  onSubmitAchievement,
  onSubmitManagerScore,
  onSubmitFinalScore,
  onSubmitDirectorReview
}: {
  user: AuthUser;
  isOwnProfile: boolean;
  kpis: Kpi[];
  loading: boolean;
  profileName: string;
  commentHistory: CommentHistoryItem[];
  feedback: AppraisalFeedback;
  actionState: AppraisalActionState;
  onSubmitSelfScore: (kpiId: number, selfScore: number) => Promise<void>;
  onSubmitAchievement: (kpiId: number, selfScore: number, achievement: string) => Promise<void>;
  onSubmitManagerScore: (kpiId: number, managerScore: number) => Promise<void>;
  onSubmitFinalScore: (kpiId: number, finalScore: number) => Promise<void>;
  onSubmitDirectorReview: (
    appraisalId: number,
    overallRemark: string,
    improvementSuggestions: string,
    trainingRecommendations: string
  ) => Promise<void>;
}) {
  const approvedKpis = kpis.filter((item) => item.status === "Approved");
  const [expandedKpiId, setExpandedKpiId] = useState<number | null>(null);
  const [targetScoreInputs, setTargetScoreInputs] = useState<Record<number, string>>({});
  const [reviewSelfScoreInputs, setReviewSelfScoreInputs] = useState<Record<number, string>>({});
  const [achievementInputs, setAchievementInputs] = useState<Record<number, string>>({});
  const [managerScoreInputs, setManagerScoreInputs] = useState<Record<number, string>>({});
  const [finalScoreInputs, setFinalScoreInputs] = useState<Record<number, string>>({});
  const [finalAgreementInputs, setFinalAgreementInputs] = useState<Record<number, boolean>>({});
  const [directorOverallInputs, setDirectorOverallInputs] = useState<Record<number, string>>({});
  const [directorImprovementInputs, setDirectorImprovementInputs] = useState<Record<number, string>>({});
  const [directorTrainingInputs, setDirectorTrainingInputs] = useState<Record<number, string>>({});
  const latestEmployeeComments = new Map<number, string>();

  commentHistory.forEach((item) => {
    if (item.type === "employee" && !latestEmployeeComments.has(item.kpi_id)) {
      latestEmployeeComments.set(item.kpi_id, item.comment);
    }
  });

  useEffect(() => {
    setExpandedKpiId((current) => (current !== null && approvedKpis.some((item) => item.id === current) ? current : null));
  }, [approvedKpis]);

  useEffect(() => {
    setTargetScoreInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        next[item.id] = current[item.id] ?? (item.targetSelfScore === undefined ? "" : String(item.targetSelfScore));
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setReviewSelfScoreInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        next[item.id] = current[item.id] ?? (item.selfScore === undefined ? "" : String(item.selfScore));
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setAchievementInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        next[item.id] = current[item.id] ?? (latestEmployeeComments.get(item.id) ?? "");
      });
      return next;
    });
  }, [approvedKpis, commentHistory]);

  useEffect(() => {
    setManagerScoreInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        next[item.id] = item.managerScore === undefined ? (current[item.id] ?? "") : String(item.managerScore);
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setFinalScoreInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        next[item.id] = item.finalScore === undefined ? (current[item.id] ?? "") : String(item.finalScore);
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setFinalAgreementInputs((current) => {
      const next: Record<number, boolean> = {};
      approvedKpis.forEach((item) => {
        next[item.id] = item.finalScore !== undefined || Boolean(current[item.id]);
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setDirectorOverallInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        if (item.appraisalId) {
          next[item.appraisalId] =
            current[item.appraisalId] ?? item.appraisalDirectorOverallRemark ?? "";
        }
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setDirectorImprovementInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        if (item.appraisalId) {
          next[item.appraisalId] =
            current[item.appraisalId] ?? item.appraisalDirectorImprovementSuggestions ?? "";
        }
      });
      return next;
    });
  }, [approvedKpis]);

  useEffect(() => {
    setDirectorTrainingInputs((current) => {
      const next: Record<number, string> = {};
      approvedKpis.forEach((item) => {
        if (item.appraisalId) {
          next[item.appraisalId] =
            current[item.appraisalId] ?? item.appraisalDirectorTrainingRecommendations ?? "";
        }
      });
      return next;
    });
  }, [approvedKpis]);

  const buildReviewDate = (value?: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setMonth(date.getMonth() + 3);
    return date;
  };

  const completedReviewStage = approvedKpis.filter((item) => item.selfScore !== undefined).length;
  const lockedManagerScores = approvedKpis.filter((item) => item.managerScoreLocked).length;
  const completedFinalScores = approvedKpis.filter((item) => item.finalScore !== undefined).length;
  const aggregateScore = getAggregateFinalScore(approvedKpis);

  const toggleKpiDetails = (kpiId: number) => {
    setExpandedKpiId((current) => (current === kpiId ? null : kpiId));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="Approved KPIs" value={String(approvedKpis.length)} note={`Manager-approved KPIs for ${profileName}`} tone="slate" />
        <MetricCard title="Review Stage" value={`${completedReviewStage}/${approvedKpis.length || 0}`} note="Employee review stages completed" tone="amber" />
        <MetricCard title="Manager Locks" value={`${lockedManagerScores}/${approvedKpis.length || 0}`} note="Submitted scores are locked automatically" tone="indigo" />
        <MetricCard title="Overall Score" value={aggregateScore === null ? "--" : `${aggregateScore.toFixed(2)}/5`} note={aggregateScore === null ? `${completedFinalScores}/${approvedKpis.length || 0} final scores completed` : "Aggregate weighted final score"} tone="green" />
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

      <section className="rounded-[32px] bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Appraisal register</h3>
            <p className="text-sm text-slate-500">Track review readiness, locked manager scores, agreed final scores, and director feedback in one clean flow.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 sm:text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm ring-1 ring-slate-200">
              <Lock size={14} /> Manager lock
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm ring-1 ring-slate-200">
              <CheckCircle2 size={14} /> Final agreement
            </span>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
          {approvedKpis.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-4 py-4">KPI</th>
                    <th className="px-4 py-4">Cycle</th>
                    <th className="px-4 py-4">Review date</th>
                    <th className="px-4 py-4">Target score</th>
                    <th className="px-4 py-4">Review stage</th>
                    <th className="px-4 py-4">Manager</th>
                    <th className="px-4 py-4">Final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {approvedKpis.map((item) => {
                    const isExpanded = expandedKpiId === item.id;
                    const reviewOpen = isReviewDateOpen(item.appraisalReviewDate);
                    const itemReviewDate = item.appraisalReviewDate ? new Date(item.appraisalReviewDate) : buildReviewDate(item.appraisalCreatedAt);
                    const employeeAchievement = latestEmployeeComments.get(item.id) ?? "";
                    const canEmployeeSetTargetScore = isOwnProfile && item.targetSelfScore === undefined && reviewOpen;
                    const canEmployeeAddAchievement =
                      isOwnProfile &&
                      item.targetSelfScore !== undefined &&
                      item.selfScore === undefined &&
                      reviewOpen;
                    const canManagerScore =
                      (user.role === "manager" || hasAdminAccess(user.role)) &&
                      !isOwnProfile &&
                      reviewOpen &&
                      item.selfScore !== undefined &&
                      !item.managerScoreLocked &&
                      item.managerScore === undefined;
                    const canSubmitFinalScore =
                      (user.role === "manager" || hasAdminAccess(user.role)) &&
                      !isOwnProfile &&
                      reviewOpen &&
                      item.managerScore !== undefined &&
                      item.finalScore === undefined;
                    const stageSteps = [
                      { label: "Target", done: item.targetSelfScore !== undefined },
                      { label: "Employee review", done: item.selfScore !== undefined },
                      { label: "Manager locked", done: item.managerScoreLocked },
                      { label: "Final agreed", done: item.finalScore !== undefined }
                    ];
                    const canUseDirectorReview = user.role === "manager" && !isOwnProfile;
                    const canDirectorReview =
                      canUseDirectorReview &&
                      !isOwnProfile &&
                      Boolean(item.appraisalId) &&
                      item.appraisalDirectorOverallRemark === null &&
                      approvedKpis.filter((kpi) => kpi.appraisalId === item.appraisalId).every((kpi) => kpi.finalScore !== undefined);
                    const targetScoreInput = targetScoreInputs[item.id] ?? "";
                    const reviewSelfScoreInput = reviewSelfScoreInputs[item.id] ?? "";
                    const achievementInput = achievementInputs[item.id] ?? "";
                    const managerScoreInput = managerScoreInputs[item.id] ?? "";
                    const finalScoreInput = finalScoreInputs[item.id] ?? "";
                    const finalAgreementConfirmed = finalAgreementInputs[item.id] ?? false;
                    const directorOverallInput = item.appraisalId ? directorOverallInputs[item.appraisalId] ?? "" : "";
                    const directorImprovementInput = item.appraisalId ? directorImprovementInputs[item.appraisalId] ?? "" : "";
                    const directorTrainingInput = item.appraisalId ? directorTrainingInputs[item.appraisalId] ?? "" : "";
                    const objectives = getObjectiveList(item.description);

                    return (
                      <Fragment key={item.id}>
                        <tr
                          className={`cursor-pointer transition hover:bg-slate-50 ${isExpanded ? "bg-slate-50/80" : ""}`}
                          onClick={() => toggleKpiDetails(item.id)}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <ChevronDown
                                size={16}
                                className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                              <div>
                                <p className="font-semibold text-slate-900">{item.title}</p>
                                <p className="text-xs text-slate-500">{item.description || "No objective note"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{item.appraisalPeriod || "--"}</td>
                          <td className="px-4 py-4 text-sm text-slate-600">{item.appraisalReviewDate ? new Date(item.appraisalReviewDate).toLocaleDateString() : "--"}</td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {item.targetSelfScore !== undefined ? `${item.targetSelfScore.toFixed(1)}/5` : "Pending"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {item.selfScore !== undefined ? `${item.selfScore.toFixed(1)}/5` : reviewOpen ? "Awaiting employee" : "--"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {item.managerScore !== undefined ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                <Lock size={12} /> {item.managerScore.toFixed(1)}/5
                              </span>
                            ) : item.selfScore !== undefined ? "Pending" : "--"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">
                            {item.finalScore !== undefined ? `${item.finalScore.toFixed(1)}/5` : item.managerScore !== undefined ? "Pending" : "--"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[#fcfcfd]">
                            <td colSpan={7} className="p-0">
                              <div className="m-3 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:m-4 sm:p-6">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected appraisal</p>
                                    <h4 className="mt-2 text-xl font-semibold text-slate-900">{item.title}</h4>
                                    <ul className="mt-3 max-w-3xl space-y-2 text-sm leading-6 text-slate-600">
                                      {objectives.map((objective, index) => (
                                        <li key={`${item.id}-objective-${index}`} className="flex gap-2">
                                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                          <span>{objective}</span>
                                        </li>
                                      ))}
                                    </ul>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {stageSteps.map((step) => (
                                        <span
                                          key={step.label}
                                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                            step.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                                          }`}
                                        >
                                          {step.done ? <CheckCircle2 size={13} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                                          {step.label}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 lg:min-w-[340px]">
                                    <SnapshotRow label="Cycle" value={item.appraisalPeriod || "--"} />
                                    <SnapshotRow label="Review date" value={itemReviewDate ? itemReviewDate.toLocaleDateString() : "--"} />
                                    <SnapshotRow label="Target self-score" value={item.targetSelfScore !== undefined ? `${item.targetSelfScore.toFixed(1)}/5` : "Pending"} />
                                    <SnapshotRow label="Review self-score" value={item.selfScore !== undefined ? `${item.selfScore.toFixed(1)}/5` : "Pending"} />
                                  </div>
                                </div>

                                <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                    <p className="text-base font-semibold text-slate-900">Employee stage</p>
                                    {canEmployeeSetTargetScore ? (
                                      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
                                        <label className="block flex-1 text-sm">
                                          <span className="mb-2 block font-medium text-slate-700">Target self-score</span>
                                          <input
                                            type="number"
                                            min="1"
                                            max="5"
                                            step="0.1"
                                            value={targetScoreInput}
                                            onChange={(event) =>
                                              setTargetScoreInputs((current) => ({
                                                ...current,
                                                [item.id]: event.target.value
                                              }))
                                            }
                                            className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                            placeholder="Enter the target score you want to hit"
                                          />
                                        </label>
                                        <button
                                          disabled={actionState.kind !== null || targetScoreInput === ""}
                                          className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                          onClick={() => void onSubmitSelfScore(item.id, Number(targetScoreInput))}
                                        >
                                          {actionState.kind === "selfScore" && actionState.kpiId === item.id ? "Saving..." : "Save target self-score"}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                        {item.targetSelfScore !== undefined
                                          ? `Target self-score saved at ${item.targetSelfScore.toFixed(1)}/5.`
                                          : "The employee sets the target self-score here after approval."}
                                      </div>
                                    )}

                                    <div className="mt-5 border-t border-slate-100 pt-5">
                                      <p className="text-base font-semibold text-slate-900">Review stage</p>
                                      <p className="mt-2 text-sm text-slate-500">
                                        {itemReviewDate
                                          ? `Review date: ${itemReviewDate.toLocaleDateString()}. This appraisal remains open until the end of that day.`
                                          : "This appraisal remains open until a review date is set."}
                                      </p>

                                      {canEmployeeAddAchievement ? (
                                        <div className="mt-4 space-y-3">
                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Post-review self-score</span>
                                            <input
                                              type="number"
                                              min="1"
                                              max="5"
                                              step="0.1"
                                              value={reviewSelfScoreInput}
                                              onChange={(event) =>
                                                setReviewSelfScoreInputs((current) => ({
                                                  ...current,
                                                  [item.id]: event.target.value
                                                }))
                                              }
                                              className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                              placeholder="Score yourself after reviewing the actual achievement"
                                            />
                                          </label>
                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Actual achievement</span>
                                            <textarea
                                              rows={4}
                                              value={achievementInput}
                                              onChange={(event) =>
                                                setAchievementInputs((current) => ({
                                                  ...current,
                                                  [item.id]: event.target.value
                                                }))
                                              }
                                              className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                                              placeholder="Enter what was actually achieved."
                                            />
                                          </label>
                                          <button
                                            disabled={actionState.kind !== null || achievementInput.trim() === "" || reviewSelfScoreInput === ""}
                                            className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                            onClick={() => void onSubmitAchievement(item.id, Number(reviewSelfScoreInput), achievementInput)}
                                          >
                                            {actionState.kind === "selfScore" && actionState.kpiId === item.id ? "Saving..." : "Save review stage"}
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                          {item.selfScore !== undefined
                                            ? `${employeeAchievement || "Actual achievement recorded."} Review self-score: ${item.selfScore.toFixed(1)}/5.`
                                            : employeeAchievement
                                              ? employeeAchievement
                                              : item.targetSelfScore !== undefined
                                                ? reviewOpen
                                                  ? "The employee can now complete the review stage."
                                                  : "The review date has passed."
                                                : "The employee must set the initial target self-score before this stage can continue."}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid gap-5">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-base font-semibold text-slate-900">Manager and final scoring</p>
                                          <p className="mt-1 text-xs leading-5 text-slate-500">
                                            Manager scores lock on submission. Staff and manager then discuss the result physically before the agreed final score is submitted.
                                          </p>
                                        </div>
                                        {item.managerScoreLocked ? (
                                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                            <Lock size={13} /> Locked
                                          </span>
                                        ) : null}
                                      </div>
                                      {(canManagerScore || item.managerScore !== undefined || canSubmitFinalScore || item.finalScore !== undefined) ? (
                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Manager score</span>
                                            <input
                                              type="number"
                                              min="1"
                                              max="5"
                                              step="0.1"
                                              value={managerScoreInput}
                                              disabled={!canManagerScore}
                                              onChange={(event) =>
                                                setManagerScoreInputs((current) => ({
                                                  ...current,
                                                  [item.id]: event.target.value
                                                }))
                                              }
                                              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 disabled:bg-slate-50 disabled:text-slate-500"
                                              placeholder="Enter manager score"
                                            />
                                            {item.managerScore !== undefined && (
                                              <span className="mt-2 block text-xs font-semibold text-emerald-700">Manager score submitted and locked.</span>
                                            )}
                                          </label>
                                          <div className="flex items-end">
                                            <button
                                              disabled={!canManagerScore || actionState.kind !== null || managerScoreInput === ""}
                                              className={`w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-70 ${
                                                item.managerScore !== undefined ? "bg-emerald-600" : "bg-slate-900"
                                              }`}
                                              onClick={() => void onSubmitManagerScore(item.id, Number(managerScoreInput))}
                                            >
                                              {item.managerScore !== undefined
                                                ? "Saved"
                                                : actionState.kind === "managerScore" && actionState.kpiId === item.id
                                                  ? "Saving..."
                                                  : "Save manager score"}
                                            </button>
                                          </div>

                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Final score</span>
                                            <input
                                              type="number"
                                              min="1"
                                              max="5"
                                              step="0.1"
                                              value={finalScoreInput}
                                              disabled={!canSubmitFinalScore}
                                              onChange={(event) =>
                                                setFinalScoreInputs((current) => ({
                                                  ...current,
                                                  [item.id]: event.target.value
                                                }))
                                              }
                                              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 disabled:bg-slate-50 disabled:text-slate-500"
                                              placeholder="Enter final agreed score"
                                            />
                                            {item.finalScore !== undefined && (
                                              <span className="mt-2 block text-xs font-semibold text-emerald-700">Final score submitted and locked.</span>
                                            )}
                                          </label>
                                          <div className="flex items-end">
                                            <button
                                              disabled={!canSubmitFinalScore || actionState.kind !== null || finalScoreInput === "" || !finalAgreementConfirmed}
                                              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                              onClick={() => void onSubmitFinalScore(item.id, Number(finalScoreInput))}
                                            >
                                              {item.finalScore !== undefined
                                                ? "Saved"
                                                : actionState.kind === "finalScore" && actionState.kpiId === item.id
                                                  ? "Saving..."
                                                  : "Save final score"}
                                            </button>
                                          </div>
                                          <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2">
                                            <input
                                              type="checkbox"
                                              className="mt-1 h-4 w-4 accent-brand"
                                              checked={finalAgreementConfirmed}
                                              disabled={!canSubmitFinalScore || item.finalScore !== undefined}
                                              onChange={(event) =>
                                                setFinalAgreementInputs((current) => ({
                                                  ...current,
                                                  [item.id]: event.target.checked
                                                }))
                                              }
                                            />
                                            <span>
                                              Staff and manager have physically discussed this KPI and agreed that this is the final score.
                                            </span>
                                          </label>
                                        </div>
                                      ) : (
                                        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                          {!reviewOpen
                                            ? "The review date has passed."
                                            : item.selfScore === undefined
                                              ? "Waiting for the employee to complete the review stage before manager scoring can continue."
                                              : item.managerScore !== undefined
                                                ? "Manager score is locked. Final score opens until it is submitted, then locks too."
                                                : "Manager scoring will appear here when the record is ready."}
                                        </div>
                                      )}
                                    </div>

                                    {(canUseDirectorReview || item.appraisalDirectorOverallRemark) && (
                                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                      <p className="text-base font-semibold text-slate-900">
                                        {canUseDirectorReview ? "Director review" : "Director remarks"}
                                      </p>
                                      {canDirectorReview ? (
                                        <div className="mt-4 space-y-3">
                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Overall remark</span>
                                            <textarea rows={3} value={directorOverallInput} onChange={(event) => item.appraisalId && setDirectorOverallInputs((current) => ({ ...current, [item.appraisalId!]: event.target.value }))} className="w-full rounded-2xl border border-neutral-200 px-4 py-3" />
                                          </label>
                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Suggestions for improvement</span>
                                            <textarea rows={3} value={directorImprovementInput} onChange={(event) => item.appraisalId && setDirectorImprovementInputs((current) => ({ ...current, [item.appraisalId!]: event.target.value }))} className="w-full rounded-2xl border border-neutral-200 px-4 py-3" />
                                          </label>
                                          <label className="block text-sm">
                                            <span className="mb-2 block font-medium text-slate-700">Recommended training / improvement initiatives</span>
                                            <textarea rows={3} value={directorTrainingInput} onChange={(event) => item.appraisalId && setDirectorTrainingInputs((current) => ({ ...current, [item.appraisalId!]: event.target.value }))} className="w-full rounded-2xl border border-neutral-200 px-4 py-3" />
                                          </label>
                                          <button
                                            disabled={actionState.kind !== null || !item.appraisalId || directorOverallInput.trim() === ""}
                                            className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
                                            onClick={() => item.appraisalId && void onSubmitDirectorReview(item.appraisalId, directorOverallInput, directorImprovementInput, directorTrainingInput)}
                                          >
                                            {actionState.kind === "directorReview" && actionState.kpiId === item.appraisalId ? "Saving..." : "Save director review"}
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                                          <p>
                                            {item.appraisalDirectorOverallRemark ||
                                              "Director review opens here after every approved KPI in this appraisal has a locked final score."}
                                          </p>
                                          {item.appraisalDirectorImprovementSuggestions ? <p>Improvement: {item.appraisalDirectorImprovementSuggestions}</p> : null}
                                          {item.appraisalDirectorTrainingRecommendations ? <p>Training: {item.appraisalDirectorTrainingRecommendations}</p> : null}
                                        </div>
                                      )}
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
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-slate-500">
              {loading ? "Loading approved KPIs..." : "There are no approved KPIs in this appraisal view yet."}
            </div>
          )}
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
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Manager review board</h3>
              <p className="text-sm text-slate-500">A clearer summary of team review readiness, pending approvals, and the currently selected workspace.</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {dashboard.team.filter((member) => toNumber(member.pending_approvals) > 0).length} team member(s) need action
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ring-1 ring-black/5">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-4">Team member</th>
                  <th className="px-4 py-4">Department</th>
                  <th className="px-4 py-4">Pending approvals</th>
                  <th className="px-4 py-4">Readiness</th>
                  <th className="px-4 py-4">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {dashboard.team.map((member) => {
                  const staffMatch = staff.find((item) => item.id === member.id);
                  const name = staffMatch ? getDisplayNameFromStaff(staffMatch) : member.name;
                  return (
                    <tr key={member.id}>
                      <td className="px-4 py-4 font-semibold text-slate-900">{name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{member.department ?? "No department assigned"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{member.pending_approvals}</td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${toNumber(member.pending_approvals) === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {toNumber(member.pending_approvals) === 0 ? "Clear" : "Action needed"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{selectedProfileId === member.id ? "Selected" : "Available"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {selectedProfileId !== null && kpiRows.some((item) => item.status === "Submitted") && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h4 className="text-lg font-semibold text-slate-900">Selected employee review items</h4>
            <p className="mt-2 text-sm text-slate-500">These submitted KPIs are ready for action in the current workspace.</p>
            <div className="mt-5 space-y-3">
              {kpiRows
                .filter((item) => item.status === "Submitted")
                .map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-500">Use KPI Workspace for full notes, approval, or return actions.</p>
                    </div>
                    <button
                      className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => void onApproveKpi(item, "approved")}
                    >
                      Quick approve
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  if (hasAdminAccess(user.role) && dashboard?.role === "hr") {
    return (
      <section className="space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h3 className="text-lg font-semibold text-slate-900">Review oversight</h3>
          <p className="mt-2 text-sm text-slate-500">Track which teams are moving smoothly and where follow-up is still needed.</p>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SnapshotRow label="Active appraisals" value={String(dashboard.summary.active_appraisals)} />
            <SnapshotRow label="Organization completion" value={`${dashboard.summary.completion_rate}%`} />
            <SnapshotRow label="Average final score" value={String(dashboard.summary.organization_average_score)} />
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ring-1 ring-black/5">
          <div className="border-b border-slate-200 px-6 py-5">
            <h3 className="text-lg font-semibold text-slate-900">Department review queue</h3>
            <p className="mt-1 text-sm text-slate-500">A clearer table of department readiness and review progress across the organization.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-4">Department</th>
                  <th className="px-4 py-4">Employees</th>
                  <th className="px-4 py-4">Completion</th>
                  <th className="px-4 py-4">Average score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {dashboard.departments.map((department) => (
                  <tr key={department.id}>
                    <td className="px-4 py-4 font-semibold text-slate-900">{department.name}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{department.employees}</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{department.completion_rate}%</td>
                    <td className="px-4 py-4 text-sm text-slate-600">{department.average_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

function WorkspaceControls({
  activeView,
  showProfileFocus,
  staff,
  selectedProfileId,
  setSelectedProfileId,
  activeReviewPeriod,
  cycleFilter,
  setCycleFilter
}: {
  activeView: string;
  showProfileFocus: boolean;
  staff: StaffMember[];
  selectedProfileId: number | null;
  setSelectedProfileId: (value: number) => void;
  activeReviewPeriod: ReviewPeriod | null;
  cycleFilter: "active" | "all";
  setCycleFilter: (value: "active" | "all") => void;
}) {
  const [staffSearch, setStaffSearch] = useState("");
  const showToolbar = showProfileFocus || activeView === "kpis" || activeView === "appraisals";
  const visibleStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return staff;

    return staff.filter((item) =>
      [getDisplayNameFromStaff(item), item.email, item.department ?? ""].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [staff, staffSearch]);

  if (!showToolbar) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-[620px]">
            {showProfileFocus && (
              <label className="block text-sm">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Staff</span>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={staffSearch}
                    onChange={(event) => setStaffSearch(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white py-3 pl-9 pr-4 text-sm"
                    placeholder="Search staff"
                  />
                </div>
                <select
                  value={selectedProfileId ?? ""}
                  onChange={(event) => setSelectedProfileId(Number(event.target.value))}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm"
                >
                  {visibleStaff.map((item) => (
                    <option key={item.id} value={item.id}>
                      {getDisplayNameFromStaff(item)}{item.department ? ` | ${item.department}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(activeView === "kpis" || activeView === "appraisals") && (
              <div className="sm:justify-self-end">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review period</span>
                <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                  <button
                    className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                      cycleFilter === "active" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                    }`}
                    onClick={() => setCycleFilter("active")}
                  >
                    {activeReviewPeriod?.name ? activeReviewPeriod.name : "Active cycle"}
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
            )}
          </div>
      </div>
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
  const [organizationExporting, setOrganizationExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasAdminAccess(user.role)) return;
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
        const isHr = hasAdminAccess(user.role);
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
    hasAdminAccess(user.role) && departmentReport?.periods?.length
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
  const reportName = selectedStaff?.name ?? getDisplayName(user);
  const safeReportName = reportName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "staff";
  const safeSelectedPeriod =
    selectedPeriod === "all"
      ? "all-periods"
      : selectedPeriod.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "selected-period";

  const formatScore = (value: string | number | null | undefined) =>
    value === null || value === undefined ? "--" : `${Number(value).toFixed(1)}/5`;

  const addWrappedText = (
    doc: jsPDF,
    label: string,
    value: string,
    x: number,
    y: number,
    maxWidth: number
  ) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, x, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "--", maxWidth);
    doc.text(lines, x, y + 6);
    return y + 10 + lines.length * 5;
  };

  const exportCsv = () => {
    const rows =
      filteredKpis.map((item) => ({
        period: item.period,
        title: item.title,
        status: item.status,
        target: item.target,
        actual: item.actual ?? "",
        objective: item.description ?? "",
        achievement: item.employee_comment ?? "",
        self_score: item.self_score ?? "",
        manager_score: item.manager_score ?? "",
        final_score: item.final_score ?? "",
        manager_comment: item.manager_comment ?? "",
        director_suggestions: item.director_improvement_suggestions ?? "",
        variance: item.variance
      })) ?? [];

    if (rows.length === 0) {
      setError("There is no report data to export yet.");
      return;
    }

    downloadCsv(`news-central-report-${safeReportName}.csv`, rows);
  };

  const exportOrganizationExcel = async () => {
    if (!hasAdminAccess(user.role)) return;

    setOrganizationExporting(true);
    setError("");
    try {
      const response = await getOrganizationReport(token);
      const filteredRows = response.rows.filter((item) => selectedPeriod === "all" || item.period === selectedPeriod);
      const rows = filteredRows.map((item) => ({
        department: item.department ?? "",
        employee_name: item.employee_name,
        employee_email: item.employee_email,
        manager: item.manager_name ?? "",
        period: item.period ?? "",
        appraisal_status: item.appraisal_status ?? "",
        review_date: item.review_date ?? "",
        employee_signed: item.employee_signed ? "Yes" : "No",
        manager_signed: item.manager_signed ? "Yes" : "No",
        kpi: item.title ?? "",
        objective: item.description ?? "",
        target: item.target ?? "",
        actual: item.actual ?? "",
        target_self_score: item.target_self_score ?? "",
        employee_score: item.self_score ?? "",
        manager_score: item.manager_score ?? "",
        final_score: item.final_score ?? "",
        variance: item.variance ?? "",
        achievement: item.employee_comment ?? "",
        manager_comment: item.manager_comment ?? "",
        director_overall_remark: item.director_overall_remark ?? "",
        director_suggestions: item.director_improvement_suggestions ?? "",
        training_recommendations: item.director_training_recommendations ?? ""
      }));

      if (!downloadCsv(`news-central-all-staff-scores-${safeSelectedPeriod}.csv`, rows)) {
        setError("There is no organization score data to export yet.");
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export all staff scores");
    } finally {
      setOrganizationExporting(false);
    }
  };

  const exportPdf = () => {
    if (filteredKpis.length === 0) {
      setError("There is no report data to export yet.");
      return;
    }

    setError("");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = 18;

    const ensurePage = (needed = 28) => {
      if (y + needed <= pageHeight - margin) return;
      doc.addPage();
      y = 18;
    };

    doc.setTextColor(193, 18, 31);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("News Central Performance Report", margin, y);
    y += 8;
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`${reportName}${selectedPeriod !== "all" ? ` | ${selectedPeriod}` : ""}`, margin, y);
    y += 12;

    filteredKpis.forEach((item, index) => {
      ensurePage(82);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y - 5, contentWidth, 10, 2, 2, "F");
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${item.title}`, margin + 3, y + 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Period: ${item.period} | Status: ${item.status}`, margin + 3, y + 7);
      y += 16;

      doc.setFontSize(10);
      y = addWrappedText(doc, "Objective", item.description || item.title, margin, y, contentWidth);
      y = addWrappedText(doc, "What was achieved", item.employee_comment || String(item.actual ?? "--"), margin, y, contentWidth);

      ensurePage(22);
      doc.setFont("helvetica", "bold");
      doc.text("Scores", margin, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.text(`Target self-score: ${formatScore(item.target_self_score)}`, margin, y);
      doc.text(`Employee score: ${formatScore(item.self_score)}`, margin + 72, y);
      y += 6;
      doc.text(`Manager score: ${formatScore(item.manager_score)}`, margin, y);
      doc.text(`Final score: ${formatScore(item.final_score)}`, margin + 72, y);
      y += 10;

      y = addWrappedText(doc, "Manager comment", item.manager_comment || "--", margin, y, contentWidth);
      y = addWrappedText(doc, "Director overall remark", item.director_overall_remark || "--", margin, y, contentWidth);
      y = addWrappedText(doc, "Director suggestions", item.director_improvement_suggestions || "--", margin, y, contentWidth);
      y = addWrappedText(doc, "Training recommendations", item.director_training_recommendations || "--", margin, y, contentWidth);
      y += 4;
    });

    ensurePage(40);
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, y + 18, margin + 74, y + 18);
    doc.line(pageWidth - margin - 74, y + 18, pageWidth - margin, y + 18);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(10);
    doc.text("Director sign-off", margin, y + 24);
    doc.text("Date", pageWidth - margin - 74, y + 24);

    doc.save(`news-central-performance-report-${safeReportName}.pdf`);
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
            {hasAdminAccess(user.role) && (
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              <Download size={16} />
              Excel
            </button>
            {hasAdminAccess(user.role) && (
              <button
                onClick={() => void exportOrganizationExcel()}
                disabled={organizationExporting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-70"
              >
                <Download size={16} />
                {organizationExporting ? "Preparing..." : "All Staff Excel"}
              </button>
            )}
            <button
              onClick={exportPdf}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              <Download size={16} />
              PDF
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
          value={`${userReport ? toNumber(userReport.summary.average_final_score).toFixed(1) : dashboard ? toNumber(getDashboardAverageScore(dashboard.summary)).toFixed(1) : "0.0"}%`}
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
          value={`${hasAdminAccess(user.role) && departmentReport?.summary ? toNumber(departmentReport.summary.completion_rate).toFixed(1) : userReport ? ((toNumber(userReport.summary.completed_appraisals) / Math.max(toNumber(userReport.summary.appraisal_count), 1)) * 100).toFixed(1) : 0}%`}
          note="Signed or completed appraisals"
          tone="slate"
        />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h4 className="text-lg font-semibold text-slate-900">
            {hasAdminAccess(user.role) ? "Department performance by period" : "Performance by review period"}
          </h4>
          <div className="mt-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="period" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip />
                <Legend />
                <Bar dataKey="score" fill="#c1121f" radius={[8, 8, 0, 0]} />
                <Bar dataKey="completion" fill="#111827" radius={[8, 8, 0, 0]} />
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
                <Line type="monotone" dataKey="performance" stroke="#c1121f" strokeWidth={3} dot={{ r: 5 }} />
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
                    <td className="px-4 py-4 text-slate-600">{item.final_score !== null ? `${toScorePercent(item.final_score)}%` : "--"}</td>
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
            {hasAdminAccess(user.role) ? "Department progress" : "Review periods"}
          </h4>
          <div className="mt-5 space-y-4">
            {(hasAdminAccess(user.role) ? filteredDepartmentEmployees : filteredUserPeriods).map((item, index) => (
              <div key={index} className="rounded-2xl border border-neutral-200 p-4">
                {hasAdminAccess(user.role) ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{(item as DepartmentReportResponse["employees"][number]).name}</p>
                      <p className="text-sm capitalize text-slate-500">{(item as DepartmentReportResponse["employees"][number]).status.replace("_", " ")}</p>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                      <span>{(item as DepartmentReportResponse["employees"][number]).period}</span>
                      <span>Avg {(item as DepartmentReportResponse["employees"][number]).average_score}%</span>
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
                      <span>Avg {(item as UserReportResponse["periods"][number]).average_score}%</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {hasAdminAccess(user.role) && !filteredDepartmentEmployees.length && !loading && (
              <div className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">No department progress data is available yet.</div>
            )}
            {!hasAdminAccess(user.role) && !filteredUserPeriods.length && !loading && (
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
  const [departmentForm, setDepartmentForm] = useState({ name: "" });
  const [bulkForm, setBulkForm] = useState({
    departmentId: "",
    role: "employee" as BulkInviteRole,
    managerId: "",
    emails: ""
  });
  const [staffStatus, setStaffStatus] = useState("");
  const [staffError, setStaffError] = useState("");
  const [periodStatus, setPeriodStatus] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [departmentStatus, setDepartmentStatus] = useState("");
  const [departmentError, setDepartmentError] = useState("");
  const [openDepartmentMenuId, setOpenDepartmentMenuId] = useState<number | null>(null);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [invitationStatus, setInvitationStatus] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [invitationActionId, setInvitationActionId] = useState<number | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [periodSubmitting, setPeriodSubmitting] = useState(false);
  const [departmentSubmitting, setDepartmentSubmitting] = useState(false);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const managers = staff.filter((member) => member.role === "manager");
  const reportingLeaders = staff.filter(
    (member) => member.role !== "employee" && member.id !== editingId
  );
  const controlCenterItems = [
    {
      icon: SlidersHorizontal,
      title: "Workflow configuration",
      description: "Tune appraisal stages, manager locks, agreement checkpoints, and director-review readiness."
    },
    {
      icon: ShieldCheck,
      title: "Permissions and access",
      description: "Maintain HR access, manager hierarchy, elevated roles, and protected super admin accounts."
    },
    {
      icon: UserCog,
      title: "User corrections",
      description: "Repair department assignments, manager links, email details, and password access without database work."
    },
    {
      icon: Wrench,
      title: "Admin maintenance",
      description: "Keep review periods, onboarding, account recovery, and system clean-up in one backend settings area."
    }
  ];

  const refreshInvitations = async () => {
    if (!hasAdminAccess(user.role)) return;
    const response = await getStaffInvitations(token);
    setInvitations(response.data);
  };

  useEffect(() => {
    void refreshInvitations().catch((error) => {
      setInvitationError(error instanceof Error ? error.message : "Unable to load invitations");
    });
  }, [token, user.role]);

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

  const handleCreateDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDepartmentSubmitting(true);
    setDepartmentStatus("");
    setDepartmentError("");

    try {
      await createDepartmentRequest(token, departmentForm.name);
      await onDirectoryRefresh();
      setDepartmentForm({ name: "" });
      setDepartmentStatus("Department is ready for staff onboarding.");
    } catch (createError) {
      setDepartmentError(createError instanceof Error ? createError.message : "Unable to create department");
    } finally {
      setDepartmentSubmitting(false);
    }
  };

  const handleRenameDepartment = async (department: Department) => {
    const nextName = window.prompt("Rename department", department.name);
    if (!nextName?.trim() || nextName.trim() === department.name) {
      setOpenDepartmentMenuId(null);
      return;
    }

    setDepartmentSubmitting(true);
    setDepartmentStatus("");
    setDepartmentError("");

    try {
      await updateDepartmentRequest(token, department.id, nextName.trim());
      await onDirectoryRefresh();
      setDepartmentStatus("Department renamed.");
    } catch (renameError) {
      setDepartmentError(renameError instanceof Error ? renameError.message : "Unable to rename department");
    } finally {
      setDepartmentSubmitting(false);
      setOpenDepartmentMenuId(null);
    }
  };

  const handleDeleteDepartment = async (department: Department) => {
    const confirmed = window.confirm(`Delete ${department.name}? Reassign staff first if this department is in use.`);
    if (!confirmed) {
      setOpenDepartmentMenuId(null);
      return;
    }

    setDepartmentSubmitting(true);
    setDepartmentStatus("");
    setDepartmentError("");

    try {
      await deleteDepartmentRequest(token, department.id);
      await onDirectoryRefresh();
      setDepartmentStatus("Department deleted.");
    } catch (deleteError) {
      setDepartmentError(deleteError instanceof Error ? deleteError.message : "Unable to delete department");
    } finally {
      setDepartmentSubmitting(false);
      setOpenDepartmentMenuId(null);
    }
  };

  const handleBulkOnboard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBulkSubmitting(true);
    setBulkStatus("");
    setBulkError("");

    try {
      const emails = bulkForm.emails
        .split(/[\n,;]+/)
        .map((email) => email.trim())
        .filter(Boolean);

      if (!bulkForm.departmentId) {
        throw new Error("Select a department before onboarding staff.");
      }

      if (!emails.length) {
        throw new Error("Paste at least one staff email.");
      }

      const result = await bulkOnboardStaff(token, {
        departmentId: Number(bulkForm.departmentId),
        emails,
        role: bulkForm.role,
        managerId: bulkForm.managerId ? Number(bulkForm.managerId) : null
      });

      await onDirectoryRefresh();
      setBulkForm((current) => ({ ...current, emails: "" }));
      await refreshInvitations();
      const invitedCount = result.invited.length;
      const failedCount = result.failed.length;
      const skippedCount = result.skipped.length;
      const deliveryText = result.emailDeliveryConfigured
        ? "invitation email queued"
        : "invitation created. Email delivery is not configured, so setup links were logged by the server";
      setBulkStatus(
        `${invitedCount} ${invitedCount === 1 ? "account" : "accounts"} ${deliveryText}.${
          failedCount ? ` ${failedCount} email ${failedCount === 1 ? "delivery" : "deliveries"} failed.` : ""
        }${skippedCount ? ` ${skippedCount} skipped because they already exist.` : ""}`
      );
    } catch (onboardError) {
      setBulkError(onboardError instanceof Error ? onboardError.message : "Unable to complete bulk onboarding");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleInvitationResend = async (invitation: StaffInvitation) => {
    setInvitationActionId(invitation.id);
    setInvitationStatus("");
    setInvitationError("");

    try {
      await resendStaffInvitation(token, invitation.id);
      await refreshInvitations();
      setInvitationStatus(`Invitation resent to ${invitation.email}.`);
    } catch (error) {
      setInvitationError(error instanceof Error ? error.message : "Unable to resend invitation");
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleInvitationRevoke = async (invitation: StaffInvitation) => {
    const confirmed = window.confirm(`Revoke invitation for ${invitation.email}? The pending account will be deactivated.`);
    if (!confirmed) return;

    setInvitationActionId(invitation.id);
    setInvitationStatus("");
    setInvitationError("");

    try {
      await revokeStaffInvitation(token, invitation.id);
      await refreshInvitations();
      await onDirectoryRefresh();
      setInvitationStatus(`Invitation revoked for ${invitation.email}.`);
    } catch (error) {
      setInvitationError(error instanceof Error ? error.message : "Unable to revoke invitation");
    } finally {
      setInvitationActionId(null);
    }
  };

  const handleStaffStatusChange = async (member: StaffMember, status: "active" | "deactivated") => {
    setStaffStatus("");
    setStaffError("");

    try {
      await updateStaffStatus(token, member.id, status);
      await onDirectoryRefresh();
      setStaffStatus(`${getDisplayNameFromStaff(member)} ${status === "active" ? "activated" : "deactivated"}.`);
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Unable to update staff status");
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

  const pendingInvitationCount = invitations.filter((item) => item.status === "pending").length;

  return (
    <section className="space-y-6">
      {hasAdminAccess(user.role) ? (
        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">HR & People</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-950">People & teams</h1>
                <p className="mt-2 text-sm text-slate-500">
                  {staff.length} active directory record{staff.length === 1 ? "" : "s"} · {pendingInvitationCount} pending invite{pendingInvitationCount === 1 ? "" : "s"} · {departments.length} department{departments.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <a href="#staff-directory" className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                  Import CSV
                </a>
                <a href="#bulk-invite" className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                  Bulk Invite
                </a>
                <a href="#user-management" className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                  Invite by Email
                </a>
              </div>
            </div>
            <div className="mt-6 flex gap-6 border-b border-slate-200 text-sm font-semibold text-slate-500">
              <a href="#staff-directory" className="border-b-2 border-brand px-1 pb-3 text-brand">Directory</a>
              <a href="#pending-invites" className="px-1 pb-3 transition hover:text-slate-900">Pending Invites</a>
              <a href="#departments" className="px-1 pb-3 transition hover:text-slate-900">Departments</a>
            </div>
          </div>
          {user.role === "super_admin" && (
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Super Admin Control Center</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">Backend settings and maintenance</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    Configure the system, repair user records, manage access, and keep appraisal workflows healthy without touching the database directly.
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  <Workflow size={16} /> Settings mode
                </span>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {controlCenterItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-2xl border border-neutral-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand shadow-sm ring-1 ring-slate-200">
                        <Icon size={18} />
                      </div>
                      <h4 className="mt-4 font-semibold text-slate-900">{item.title}</h4>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="min-w-0 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900">Appraisal periods</h3>
                <p className="text-sm text-slate-500">Set the active review cycle so KPI creation and reporting stay aligned.</p>
              </div>
              <div className="break-words rounded-2xl bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">
                Active: {activeReviewPeriod?.name ?? "Not set"}
              </div>
            </div>
            <form className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleCreatePeriod}>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Period name</span>
                <input
                  value={periodForm.name}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                  placeholder="2027 Annual Review"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Starts on</span>
                <input
                  type="date"
                  value={periodForm.startsOn}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, startsOn: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Ends on</span>
                <input
                  type="date"
                  value={periodForm.endsOn}
                  onChange={(event) => setPeriodForm((current) => ({ ...current, endsOn: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
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
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-70 sm:w-auto"
                >
                  {periodSubmitting ? "Saving..." : "Create review period"}
                </button>
              </div>
            </form>
            {(periodStatus || periodError) && (
              <div
                className={`mt-4 min-w-0 break-words rounded-2xl px-4 py-3 text-sm ${
                  periodError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {periodError || periodStatus}
              </div>
            )}
            <div className="mt-6 space-y-3">
              {reviewPeriods.map((period) => (
                <div key={period.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-neutral-200 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{period.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {period.starts_on || "No start date"} to {period.ends_on || "No end date"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
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

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div id="departments" className="min-w-0 scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-brand ring-1 ring-slate-200">
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Department management</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">Create departments first, then onboard staff into the correct team.</p>
                </div>
              </div>
              <form className="mt-5 space-y-4" onSubmit={handleCreateDepartment}>
                <label className="block text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Department name</span>
                  <input
                    value={departmentForm.name}
                    onChange={(event) => setDepartmentForm({ name: event.target.value })}
                    className="w-full rounded-2xl border border-neutral-200 px-4 py-3"
                    placeholder="Newsroom Operations"
                  />
                </label>
                {(departmentStatus || departmentError) && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      departmentError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {departmentError || departmentStatus}
                  </div>
                )}
                <button
                  disabled={departmentSubmitting || departmentForm.name.trim().length < 2}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-70"
                >
                  <Building2 size={16} />
                  {departmentSubmitting ? "Saving..." : "Create department"}
                </button>
              </form>
              <div className="mt-6 grid grid-cols-1 gap-2">
                {departments.map((department) => (
                  <div key={department.id} className="relative flex items-center justify-between rounded-2xl border border-neutral-200 px-4 py-3">
                    <span className="font-semibold text-slate-900">{department.name}</span>
                    <button
                      type="button"
                      className="rounded-xl border border-neutral-200 bg-white p-2 text-slate-500 hover:text-slate-900"
                      onClick={() => setOpenDepartmentMenuId((current) => (current === department.id ? null : department.id))}
                      aria-label={`Open menu for ${department.name}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {openDepartmentMenuId === department.id && (
                      <div className="absolute right-3 top-12 z-20 w-40 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          onClick={() => void handleRenameDepartment(department)}
                        >
                          <Pencil size={14} /> Rename
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
                          onClick={() => void handleDeleteDepartment(department)}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div id="bulk-invite" className="min-w-0 scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-brand ring-1 ring-slate-200">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Batch staff onboarding</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">Paste staff emails, choose their department, and the system sends secure account setup invitations.</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Invitation links enabled</span>
              </div>
              <form className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleBulkOnboard}>
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Department</span>
                  <select
                    value={bulkForm.departmentId}
                    onChange={(event) => setBulkForm((current) => ({ ...current, departmentId: event.target.value }))}
                    className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                  >
                    <option value="">Select department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">Role</span>
                  <select
                    value={bulkForm.role}
                    onChange={(event) =>
                      setBulkForm((current) => ({
                        ...current,
                        role: event.target.value as BulkInviteRole,
                        managerId: event.target.value === "hr" ? "" : current.managerId
                      }))
                    }
                    className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    {user.role === "super_admin" && <option value="hr">HR</option>}
                  </select>
                </label>
                {(bulkForm.role === "employee" || bulkForm.role === "manager") && (
                  <label className="text-sm md:col-span-2">
                    <span className="mb-2 block font-medium text-slate-700">
                      {bulkForm.role === "manager" ? "Director / supervisor" : "Line manager"}
                    </span>
                    <select
                      value={bulkForm.managerId}
                      onChange={(event) => setBulkForm((current) => ({ ...current, managerId: event.target.value }))}
                      className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                    >
                      <option value="">{bulkForm.role === "manager" ? "Select director / supervisor" : "Select line manager"}</option>
                      {(bulkForm.role === "manager" ? staff.filter((member) => member.role !== "employee") : managers).map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {getDisplayNameFromStaff(manager)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-sm md:col-span-2">
                  <span className="mb-2 block font-medium text-slate-700">Staff emails</span>
                  <textarea
                    rows={6}
                    value={bulkForm.emails}
                    onChange={(event) => setBulkForm((current) => ({ ...current, emails: event.target.value }))}
                    className="min-h-40 w-full min-w-0 resize-y rounded-2xl border border-neutral-200 px-4 py-3"
                    placeholder="one@company.com, two@company.com&#10;three@company.com"
                  />
                </label>
                {(bulkStatus || bulkError) && (
                  <div
                    className={`min-w-0 break-words rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
                      bulkError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {bulkError || bulkStatus}
                  </div>
                )}
                <div className="md:col-span-2">
                  <button
                    disabled={bulkSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-70 sm:w-auto"
                  >
                    <Mail size={16} />
                    {bulkSubmitting ? "Sending invitations..." : "Send setup invitations"}
                  </button>
                </div>
              </form>
            </div>

            <div id="pending-invites" className="min-w-0 scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Invitation tracking</h3>
                  <p className="text-sm text-slate-500">Resend failed or expired setup links and revoke unused invitations.</p>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => void refreshInvitations()}
                >
                  Refresh
                </button>
              </div>
              {(invitationStatus || invitationError) && (
                <div
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                    invitationError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {invitationError || invitationStatus}
                </div>
              )}
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      {["Staff", "Role", "Department", "Status", "Expires", "Attempts", "Actions"].map((col) => (
                        <th key={col} className="px-4 py-3 font-semibold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.length ? (
                      invitations.map((invitation) => (
                        <tr key={invitation.id} className="border-t border-neutral-100">
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-900">{invitation.name}</p>
                            <p className="text-sm text-slate-500">{invitation.email}</p>
                            {invitation.last_error && <p className="mt-1 max-w-xs text-xs text-rose-600">{invitation.last_error}</p>}
                          </td>
                          <td className="px-4 py-4 text-slate-600 capitalize">{invitation.role}</td>
                          <td className="px-4 py-4 text-slate-600">{invitation.department ?? "Unassigned"}</td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getAccountStatusBadgeClass(invitation.status)}`}>
                              {invitation.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{new Date(invitation.expires_at).toLocaleString()}</td>
                          <td className="px-4 py-4 text-slate-600">{invitation.delivery_attempts}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={invitationActionId === invitation.id || invitation.account_status !== "pending"}
                                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-50"
                                onClick={() => void handleInvitationResend(invitation)}
                              >
                                Resend
                              </button>
                              <button
                                type="button"
                                disabled={invitationActionId === invitation.id || invitation.status === "accepted" || invitation.status === "revoked"}
                                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-rose-600 disabled:opacity-50"
                                onClick={() => void handleInvitationRevoke(invitation)}
                              >
                                Revoke
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-6 text-sm text-slate-500" colSpan={7}>
                          No invitations recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div id="user-management" className="min-w-0 scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900">User management</h3>
                <p className="text-sm text-slate-500">Use this for corrections and individual account maintenance after batch onboarding.</p>
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
            <form className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Full name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Email</span>
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
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
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  {user.role === "super_admin" && <option value="hr">HR</option>}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Department</span>
                <select
                  value={form.departmentId}
                  onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
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
                    className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                  />
                </label>
              )}
              {(form.role === "employee" || form.role === "manager") && (
                <label className="text-sm">
                  <span className="mb-2 block font-medium text-slate-700">
                    {form.role === "manager" ? "Director / supervisor" : "Line manager"}
                  </span>
                  <select
                    value={form.managerId}
                    onChange={(event) => setForm((current) => ({ ...current, managerId: event.target.value }))}
                    className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                  >
                    <option value="">{form.role === "manager" ? "Select director / supervisor" : "Select line manager"}</option>
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
                  className={`min-w-0 break-words rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
                    staffError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {staffError || staffStatus}
                </div>
              )}
              <div className="md:col-span-2">
                <button
                  disabled={submitting}
                  className="w-full rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-70 sm:w-auto"
                >
                  {submitting ? "Saving..." : editingId ? "Update staff" : "Create staff account"}
                </button>
              </div>
            </form>
          </div>

          <div className="min-w-0 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Change password</h3>
                <p className="text-sm text-slate-500">Let staff replace temporary or existing passwords with one they prefer.</p>
              </div>
            </div>
            <form className="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleChangePassword}>
              <label className="text-sm md:col-span-2">
                <span className="mb-2 block font-medium text-slate-700">Current password</span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">New password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              <label className="text-sm">
                <span className="mb-2 block font-medium text-slate-700">Confirm new password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  className="w-full min-w-0 rounded-2xl border border-neutral-200 px-4 py-3"
                />
              </label>
              {(passwordStatus || passwordError) && (
                <div
                  className={`min-w-0 break-words rounded-2xl px-4 py-3 text-sm md:col-span-2 ${
                    passwordError ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {passwordError || passwordStatus}
                </div>
              )}
              <div className="md:col-span-2">
                <button
                  disabled={passwordSubmitting}
                  className="w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-70 sm:w-auto"
                >
                  {passwordSubmitting ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>
          </div>

          <div id="staff-directory" className="min-w-0 scroll-mt-24 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h3 className="text-lg font-semibold text-slate-900">Staff directory</h3>
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
                  <tr>
                    {["Name", "Role", "Department", "Status", "Actions"].map((col) => (
                      <th key={col} className="px-4 py-3 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staff.length ? (
                    staff.map((member) => (
                      <tr key={member.id} className="border-t border-neutral-100">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                            {getDisplayNameFromStaff(member)
                              .split(" ")
                              .map((part) => part[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{getDisplayNameFromStaff(member)}</p>
                            <p className="text-xs text-slate-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getRoleBadgeClass(member.role)}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{member.department ?? "Unassigned"}</td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getAccountStatusBadgeClass(member.account_status ?? "active")}`}>
                          {member.account_status ?? "active"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            title="View profile"
                            aria-label={`View ${getDisplayNameFromStaff(member)}`}
                            className="rounded-xl border border-neutral-200 p-2 text-slate-600 hover:text-slate-900"
                            onClick={() => handleEdit(member)}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            title="Edit staff"
                            aria-label={`Edit ${getDisplayNameFromStaff(member)}`}
                            className="rounded-xl border border-neutral-200 p-2 text-brand hover:text-brand-700"
                            onClick={() => handleEdit(member)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            title={member.account_status === "deactivated" ? "Activate staff" : "Lock staff"}
                            aria-label={`${member.account_status === "deactivated" ? "Activate" : "Lock"} ${getDisplayNameFromStaff(member)}`}
                            className="rounded-xl border border-neutral-200 p-2 text-slate-600 hover:text-slate-900"
                            onClick={() => void handleStaffStatusChange(member, member.account_status === "deactivated" ? "active" : "deactivated")}
                          >
                            <Lock size={15} />
                          </button>
                          <button
                            type="button"
                            title="Reset password"
                            aria-label={`Reset password for ${getDisplayNameFromStaff(member)}`}
                            className="rounded-xl border border-neutral-200 p-2 text-slate-600 hover:text-slate-900"
                            onClick={() => handlePasswordReset(member)}
                          >
                            <Wrench size={15} />
                          </button>
                          <button
                            type="button"
                            title="Delete staff"
                            aria-label={`Delete ${getDisplayNameFromStaff(member)}`}
                            className="rounded-xl border border-neutral-200 p-2 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(member)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={5}>
                        <Users className="mx-auto mb-3 text-slate-300" size={28} />
                        No staff records yet. Use Invite by Email or Bulk Invite to start building the directory.
                      </td>
                    </tr>
                  )}
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
