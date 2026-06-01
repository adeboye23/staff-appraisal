import { Role } from "../types.js";

export function hasHrAccess(role?: Role | null) {
  return role === "hr" || role === "super_admin";
}
