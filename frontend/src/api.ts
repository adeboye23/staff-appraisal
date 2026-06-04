import {
  DashboardResponse,
  Department,
  DepartmentReportResponse,
  LoginResponse,
  NotificationItem,
  OrganizationReportRow,
  PerformanceRow,
  TimelineItem,
  CommentHistoryItem,
  ReviewPeriod,
  Role,
  StaffMember,
  UserReportResponse
} from "./types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload as T;
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function requestPasswordReset(email: string) {
  return request<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function completePasswordReset(email: string, token: string, newPassword: string) {
  return request<{ message: string }>("/auth/reset-password/complete", {
    method: "POST",
    body: JSON.stringify({ email, token, newPassword })
  });
}

export function changePassword(token: string, currentPassword: string, newPassword: string) {
  return request<{ message: string }>(
    "/auth/change-password",
    {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    },
    token
  );
}

export function getUserKpis(userId: number, token: string) {
  return request<{
    data: Array<{
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
    }>;
  }>(
    `/kpis/user/${userId}`,
    { method: "GET" },
    token
  );
}

export function getUserPerformance(userId: number, token: string) {
  return request<{ data: PerformanceRow[] }>(`/performance/${userId}`, { method: "GET" }, token);
}

export function getUserTimeline(userId: number, token: string) {
  return request<{ data: TimelineItem[] }>(`/performance/${userId}/timeline`, { method: "GET" }, token);
}

export function getUserComments(userId: number, token: string) {
  return request<{ data: CommentHistoryItem[] }>(`/performance/${userId}/comments`, { method: "GET" }, token);
}

export function savePerformanceActual(token: string, payload: { kpiId: number; actual: number }) {
  return request<{ performance: unknown }>(
    "/performance",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function submitSelfAppraisal(
  token: string,
  payload: { kpiId: number; selfScore: number; comment?: string }
) {
  return request<{ performance: unknown }>(
    "/performance/self-appraisal",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function submitManagerScore(
  token: string,
  payload: { kpiId: number; managerScore: number; comment?: string }
) {
  return request<{ performance: unknown }>(
    "/performance/manager-score",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function submitFinalScore(
  token: string,
  payload: { kpiId: number; finalScore: number; agree: boolean }
) {
  return request<{ performance: unknown }>(
    "/performance/final-score",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function submitDirectorReview(
  token: string,
  payload: {
    appraisalId: number;
    overallRemark: string;
    improvementSuggestions?: string;
    trainingRecommendations?: string;
  }
) {
  return request<{ appraisal: unknown }>(
    "/performance/director-review",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function unlockEvaluation(token: string, appraisalId: number, unlocked = true) {
  return request<{ appraisal: unknown }>(
    "/performance/unlock-evaluation",
    { method: "POST", body: JSON.stringify({ appraisalId, unlocked }) },
    token
  );
}

export function submitSignOff(
  token: string,
  payload: { appraisalId: number; actor: "employee" | "manager" }
) {
  return request<{ appraisal: unknown }>(
    "/performance/signoff",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function getDashboardSummary(token: string) {
  return request<DashboardResponse>("/dashboard/summary", { method: "GET" }, token);
}

export function getNotifications(token: string) {
  return request<{ data: NotificationItem[] }>("/dashboard/notifications", { method: "GET" }, token);
}

export function getUserReport(userId: number, token: string) {
  return request<UserReportResponse>(`/reports/user/${userId}`, { method: "GET" }, token);
}

export function getDepartmentReport(departmentId: number, token: string) {
  return request<DepartmentReportResponse>(`/reports/department/${departmentId}`, { method: "GET" }, token);
}

export function getOrganizationReport(token: string) {
  return request<{ rows: OrganizationReportRow[] }>("/reports/organization", { method: "GET" }, token);
}

export function getStaffDirectory(token: string, scope?: string) {
  const query = scope ? `?scope=${scope}` : "";
  return request<{ data: StaffMember[] }>(`/users${query}`, { method: "GET" }, token);
}

export function createKpi(
  token: string,
  payload: {
    userId: number;
    period?: string;
    title: string;
    description?: string;
    weight?: number;
    target?: number;
  }
) {
  return request<{ kpi: unknown }>("/kpis", { method: "POST", body: JSON.stringify(payload) }, token);
}

export function updateKpi(
  token: string,
  kpiId: number,
  payload: {
    title?: string;
    description?: string;
    weight?: number;
    target?: number;
    status?: "draft" | "submitted" | "approved" | "rejected";
  }
) {
  return request<{ kpi: unknown }>(`/kpis/${kpiId}`, { method: "PUT", body: JSON.stringify(payload) }, token);
}

export function deleteKpiById(token: string, kpiId: number) {
  return request<{}>(`/kpis/${kpiId}`, { method: "DELETE" }, token);
}

export function approveKpi(
  token: string,
  kpiId: number,
  payload: { status: "approved" | "rejected"; comment?: string }
) {
  return request<{ kpi: unknown }>(`/kpis/${kpiId}/approve`, { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function getDepartments(token: string) {
  return request<{ data: Department[] }>("/users/departments", { method: "GET" }, token);
}

export function createDepartment(token: string, name: string) {
  return request<{ department: Department }>(
    "/users/departments",
    { method: "POST", body: JSON.stringify({ name }) },
    token
  );
}

export function updateDepartment(token: string, departmentId: number, name: string) {
  return request<{ department: Department }>(
    `/users/departments/${departmentId}`,
    { method: "PUT", body: JSON.stringify({ name }) },
    token
  );
}

export function deleteDepartment(token: string, departmentId: number) {
  return request<{}>(`/users/departments/${departmentId}`, { method: "DELETE" }, token);
}

export function bulkOnboardStaff(
  token: string,
  payload: {
    departmentId: number;
    emails: string[];
    role?: "employee" | "manager";
    managerId?: number | null;
  }
) {
  return request<{
    created: Array<{ id: number; name: string; email: string; role: Role }>;
    skipped: Array<{ email: string; reason: string }>;
    emailDeliveryConfigured?: boolean;
  }>(
    "/users/bulk-onboard",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function getReviewPeriods(token: string) {
  return request<{ data: ReviewPeriod[]; active: ReviewPeriod | null }>("/review-periods", { method: "GET" }, token);
}

export function createReviewPeriod(
  token: string,
  payload: { name: string; startsOn?: string | null; endsOn?: string | null; isActive?: boolean }
) {
  return request<{ period: ReviewPeriod }>("/review-periods", { method: "POST", body: JSON.stringify(payload) }, token);
}

export function setActiveReviewPeriod(token: string, periodId: number) {
  return request<{ period: ReviewPeriod }>(
    "/review-periods/active",
    { method: "PATCH", body: JSON.stringify({ periodId }) },
    token
  );
}

export function createStaff(
  token: string,
  payload: {
    name: string;
    email: string;
    password: string;
    role: Role;
    departmentId?: number | null;
    managerId?: number | null;
  }
) {
  return request<{ user: { id: number; name: string; email: string; role: Role } }>(
    "/users",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export function updateStaff(
  token: string,
  userId: number,
  payload: {
    name?: string;
    email?: string;
    role?: Role;
    departmentId?: number | null;
    managerId?: number | null;
  }
) {
  return request<{ user: { id: number; name: string; email: string; role: Role } }>(
    `/users/${userId}`,
    { method: "PUT", body: JSON.stringify(payload) },
    token
  );
}

export function resetStaffPassword(token: string, userId: number, newPassword: string) {
  return request<{ message: string }>(
    `/users/${userId}/reset-password`,
    { method: "POST", body: JSON.stringify({ newPassword }) },
    token
  );
}

export function deleteStaff(token: string, userId: number) {
  return request<{}>(`/users/${userId}`, { method: "DELETE" }, token);
}
