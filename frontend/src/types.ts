export type NavItem = {
  label: string;
  key: string;
};

export type KPIStatus = "Draft" | "Submitted" | "Approved" | "Rejected";

export type Role = "employee" | "manager" | "hr";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  departmentId: number | null;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type Kpi = {
  id: number;
  appraisalId?: number;
  appraisalPeriod?: string;
  appraisalStatus?: "draft" | "in_review" | "completed";
  appraisalCreatedAt?: string;
  appraisalReviewDate?: string | null;
  appraisalEvaluationUnlockedByHr?: boolean;
  appraisalEvaluationUnlockedAt?: string | null;
  appraisalDirectorOverallRemark?: string | null;
  appraisalDirectorImprovementSuggestions?: string | null;
  appraisalDirectorTrainingRecommendations?: string | null;
  employeeSigned?: boolean;
  managerSigned?: boolean;
  employeeSignedAt?: string | null;
  managerSignedAt?: string | null;
  title: string;
  description?: string;
  weight: number;
  target: number;
  status: KPIStatus;
  actual?: number;
  targetSelfScore?: number;
  selfScore?: number;
  managerScore?: number;
  finalScore?: number;
};

export type PerformanceRow = {
  kpi_id: number;
  title: string;
  weight: number | string;
  target: number | string;
  actual: number | string | null;
  target_self_score: number | string | null;
  self_score: number | string | null;
  manager_score: number | string | null;
  final_score: number | string | null;
};

export type StaffMember = {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  manager_id?: number | null;
};

export type Department = {
  id: number;
  name: string;
};

export type NotificationItem = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  created_at: string;
  name: string;
  email: string;
};

export type TimelineItem = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  created_at: string;
  actor_name: string | null;
};

export type CommentHistoryItem = {
  id: number;
  kpi_id: number;
  comment: string;
  type: "employee" | "manager";
  created_at: string;
  kpi_title: string;
  author_name: string | null;
};

export type ReviewPeriod = {
  id: number;
  name: string;
  is_active: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

export type EmployeeDashboardSummary = {
  approved_kpis: string | number;
  submitted_kpis: string | number;
  total_kpis: string | number;
  self_appraised: string | number;
  average_final_score: string | number;
};

export type ManagerDashboardSummary = {
  team_members: string | number;
  pending_approvals: string | number;
  pending_scoring_tasks: string | number;
  team_average_score: string | number;
};

export type HrDashboardSummary = {
  departments: string | number;
  active_appraisals: string | number;
  completion_rate: string | number;
  organization_average_score: string | number;
};

export type DashboardResponse =
  | {
      role: "employee";
      summary: EmployeeDashboardSummary;
    }
  | {
      role: "manager";
      summary: ManagerDashboardSummary;
      team: Array<{
        id: number;
        name: string;
        department: string | null;
        pending_approvals: string | number;
        pending_scoring_tasks: string | number;
        average_score: string | number;
      }>;
    }
  | {
      role: "hr";
      summary: HrDashboardSummary;
      departments: Array<{
        id: number;
        name: string;
        employees: string | number;
        completion_rate: string | number;
        average_score: string | number;
      }>;
      distribution: {
        needs_support: string | number;
        steady: string | number;
        high_performing: string | number;
      };
    };

export type UserReportResponse = {
  summary: {
    appraisal_count: string | number;
    completed_appraisals: string | number;
    average_final_score: string | number;
    achievement_rate: string | number;
    score_variance: string | number;
  };
  periods: Array<{
    period: string;
    status: "draft" | "in_review" | "completed";
    employee_signed: boolean;
    manager_signed: boolean;
    kpi_count: string | number;
    average_score: string | number;
  }>;
  kpis: Array<{
    id: number;
    appraisal_id: number;
    period: string;
    title: string;
    description: string | null;
    status: "draft" | "submitted" | "approved" | "rejected";
    target: string | number;
    actual: string | number | null;
    target_self_score: string | number | null;
    self_score: string | number | null;
    manager_score: string | number | null;
    final_score: string | number | null;
    variance: string | number;
    employee_comment: string | null;
    manager_comment: string | null;
    director_overall_remark: string | null;
    director_improvement_suggestions: string | null;
    director_training_recommendations: string | null;
  }>;
};

export type DepartmentReportResponse = {
  summary: {
    department: string;
    employees: string | number;
    active_appraisals: string | number;
    completion_rate: string | number;
    average_score: string | number;
    achievement_rate: string | number;
    score_variance: string | number;
  } | null;
  periods: Array<{
    period: string;
    appraisals: string | number;
    completion_rate: string | number;
    average_score: string | number;
  }>;
  employees: Array<{
    id: number;
    name: string;
    period: string;
    status: "draft" | "in_review" | "completed";
    average_score: string | number;
    score_variance: string | number;
  }>;
};

export type EmployeeApproval = {
  name: string;
  role: string;
  department: string;
  appraisalsDue: number;
  kpis: Kpi[];
  comment: string;
};
