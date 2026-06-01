import { NavItem } from "./types";

export const navItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "appraisals", label: "My Appraisals" },
  { key: "kpis", label: "KPI Management" },
  { key: "reviews", label: "Reviews / Feedback" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" }
];

export const reportTrend = [
  { month: "Q1", performance: 0 },
  { month: "Q2", performance: 0 },
  { month: "Q3", performance: 0 },
  { month: "Q4", performance: 0 }
];
