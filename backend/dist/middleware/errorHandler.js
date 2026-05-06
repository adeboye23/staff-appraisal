import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
export function notFound(_req, _res, next) {
    next(new ApiError(404, "Route not found"));
}
export function errorHandler(error, _req, res, _next) {
    if (error instanceof ZodError) {
        return res.status(400).json({
            message: "Validation failed",
            errors: error.flatten()
        });
    }
    if (error instanceof ApiError) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
}
