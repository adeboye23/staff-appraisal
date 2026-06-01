import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { ApiError } from "../utils/ApiError.js";
export function requireAuth(req, _res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return next(new ApiError(401, "Authentication token is required"));
    }
    const token = header.replace("Bearer ", "");
    try {
        const payload = jwt.verify(token, config.jwtSecret);
        req.user = payload;
        next();
    }
    catch {
        next(new ApiError(401, "Invalid or expired token"));
    }
}
export function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new ApiError(401, "Authentication required"));
        }
        if (req.user.role !== "super_admin" && !roles.includes(req.user.role)) {
            return next(new ApiError(403, "You do not have permission for this action"));
        }
        next();
    };
}
