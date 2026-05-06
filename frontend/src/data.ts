import { EmployeeApproval, Kpi, NavItem } from "./types";

export const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "appraisals", label: "My Appraisals" },
  { key: "kpis", label: "KPI Management" },
  { key: "reviews", label: "Reviews / Feedback" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" }
];

export const stats = [
  { label: "KPI Completion", value: "86%", delta: "+8.4%", tone: "brand" },
  { label: "Pending Approvals", value: "14", delta: "-3 today", tone: "amber" },
  { label: "Completed Reviews", value: "92", delta: "+11 this week", tone: "green" },
  { label: "Average Score", value: "78.5", delta: "+4.1 pts", tone: "slate" }
];

export const kpis: Kpi[] = [
  { id: 1, title: "Publishing speed", weight: 25, target: 20, status: "Approved", actual: 18, selfScore: 22.5, managerScore: 21.5, finalScore: 22 },
  { id: 2, title: "Story accuracy", weight: 25, target: 98, status: "Approved", actual: 99, selfScore: 25, managerScore: 24, finalScore: 24.5 },
  { id: 3, title: "Audience growth", weight: 30, target: 12, status: "Submitted", actual: 10, selfScore: 25, managerScore: 23, finalScore: 24 },
  { id: 4, title: "Editorial collaboration", weight: 20, target: 10, status: "Draft", actual: 9, selfScore: 18, managerScore: 17, finalScore: 17.5 }
];

export const approvals: EmployeeApproval[] = [
  {
    name: "Tolu Adebayo",
    role: "Senior Reporter",
    department: "Politics",
    appraisalsDue: 2,
    comment: "Strong reporting pace, but target discipline needs work.",
    kpis
  },
  {
    name: "Maya Cole",
    role: "Producer",
    department: "Digital",
    appraisalsDue: 1,
    comment: "Needs support on approval turnaround and campaign follow-through.",
    kpis: kpis.map((item) => ({ ...item, id: item.id + 10 }))
  }
];

export const reportBars = [
  { period: "Jan", score: 68, completion: 72 },
  { period: "Feb", score: 75, completion: 78 },
  { period: "Mar", score: 73, completion: 81 },
  { period: "Apr", score: 84, completion: 88 },
  { period: "May", score: 80, completion: 86 }
];

export const reportTrend = [
  { month: "Q1", performance: 72 },
  { month: "Q2", performance: 78 },
  { month: "Q3", performance: 81 },
  { month: "Q4", performance: 86 }
];
