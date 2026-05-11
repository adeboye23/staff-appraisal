import cors from "cors";
import express from "express";
import authRoutes from "./routes/authRoutes.js";
import kpiRoutes from "./routes/kpiRoutes.js";
import performanceRoutes from "./routes/performanceRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import reviewPeriodRoutes from "./routes/reviewPeriodRoutes.js";
import { config } from "./config.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export const app = express();

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (config.clientUrls.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    }
  })
);
app.use(express.json());
app.use(apiLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", name: "News Central API" });
});

app.use("/api/auth", authRoutes);
app.use("/api/kpis", kpiRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/review-periods", reviewPeriodRoutes);

app.use(notFound);
app.use(errorHandler);
