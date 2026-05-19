import { Request } from "express";

export type Role = "employee" | "manager" | "hr";

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
