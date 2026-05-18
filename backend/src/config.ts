import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(backendRoot, "..");

dotenv.config({ path: path.join(workspaceRoot, ".env") });
dotenv.config({ path: path.join(backendRoot, ".env"), override: true });

function normalizeDatabaseUrl(value: string) {
  if (!value) return value;

  try {
    const url = new URL(value);

    // Neon pooled connections are more stable here without strict channel binding.
    if (url.searchParams.get("channel_binding") === "require") {
      url.searchParams.set("channel_binding", "prefer");
    }

    return url.toString();
  } catch {
    return value;
  }
}

function parseClientUrls(value: string | undefined) {
  const rawValue = value?.trim();

  if (!rawValue) {
    return ["http://localhost:5173"];
  }

  return rawValue
    .split(/[\r\n,]+/)
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .filter((entry) => {
      try {
        const url = new URL(entry);
        return /^https?:$/.test(url.protocol);
      } catch {
        return false;
      }
    });
}

const clientUrls = parseClientUrls(process.env.CLIENT_URL);
const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

function validateConfig() {
  const issues: string[] = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change_me") {
    issues.push("JWT_SECRET must be set to a strong non-default value.");
  }

  if (!process.env.DATABASE_URL?.trim()) {
    issues.push("DATABASE_URL must be set.");
  }

  if (clientUrls.length === 0) {
    issues.push("CLIENT_URL must include at least one valid frontend origin.");
  }

  if (isProduction) {
    if (clientUrls.some((url) => url.startsWith("http://"))) {
      issues.push("CLIENT_URL must use HTTPS origins in production.");
    }
  }

  if (issues.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${issues.join("\n- ")}`);
  }
}

validateConfig();

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 4000),
  databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL || ""),
  jwtSecret: process.env.JWT_SECRET || "change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  clientUrl: clientUrls[0] || "http://localhost:5173",
  clientUrls
};
