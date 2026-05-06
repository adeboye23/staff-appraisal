import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(backendRoot, "..");
dotenv.config({ path: path.join(workspaceRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env"), override: true });
function normalizeDatabaseUrl(value) {
    if (!value)
        return value;
    try {
        const url = new URL(value);
        // Neon pooled connections are more stable here without strict channel binding.
        if (url.searchParams.get("channel_binding") === "require") {
            url.searchParams.set("channel_binding", "prefer");
        }
        return url.toString();
    }
    catch {
        return value;
    }
}
export const config = {
    port: Number(process.env.PORT || 4000),
    databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL || ""),
    jwtSecret: process.env.JWT_SECRET || "change_me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
    clientUrl: process.env.CLIENT_URL || "http://localhost:5173"
};
