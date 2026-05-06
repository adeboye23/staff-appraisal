import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { AuthedRequest, AuthUser, Role } from "../types.js";
import { ApiError } from "../utils/ApiError.js";

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new ApiError(401, "Authentication token is required"));
  }

  const token = header.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = payload;
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have permission for this action"));
    }

    next();
  };
}
