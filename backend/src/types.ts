import { Request } from "express";

export type Role = "employee" | "manager" | "hr" | "super_admin";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  departmentId: number | null;
};

export type AuthedRequest = Request & {
  user?: AuthUser;
};
