import { Request } from "express";

export type Role = "employee" | "manager" | "hr";

export type AuthUser = {
  id: number;
  email: string;
  role: Role;
  departmentId: number | null;
};

export type AuthedRequest = Request & {
  user?: AuthUser;
};
