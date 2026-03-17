import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import { PORT, CORS_ORIGINS } from "./config";
import { requestContextMiddleware } from "./middleware/requestContext";
import authRouter from "./routes/auth";
import sendRouter from "./routes/send";
import claimRouter from "./routes/claim";
import transactionRouter from "./routes/transaction";
import exchangeRateRouter from "./routes/exchangeRate";
import webhooksRouter from "./routes/webhooks";
import { logError } from "./utils/logging";

dotenv.config();

const app = express();

function isAllowedOrigin(origin: string) {
  const normalizedOrigin = origin.replace(/\/$/, "");

  return CORS_ORIGINS.some((allowed) => {
    if (allowed === normalizedOrigin) {
      return true;
    }

    // Supports wildcard patterns like https://*.vercel.app
    if (allowed.includes("*")) {
      try {
        const originUrl = new URL(normalizedOrigin);
        const allowedUrl = new URL(allowed.replace("*", "placeholder"));
        const allowedHostSuffix = allowedUrl.hostname.replace("placeholder", "");
        const protocolMatches = originUrl.protocol === allowedUrl.protocol;
        const hostMatches =
          allowedHostSuffix.length > 0 &&
          originUrl.hostname.endsWith(allowedHostSuffix);
        return protocolMatches && hostMatches;
      } catch {
        return false;
      }
    }

    return false;
  });
}

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      console.warn("Blocked by CORS:", origin);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    credentials: true,
  })
);

// Handle preflight
app.options("*", cors());

// Rate limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

// Body parsing
app.use(
  express.json({
    limit: "10kb",
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(requestContextMiddleware);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "BitExpress API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/auth", authRouter);
app.use("/api/send", sendRouter);
app.use("/api/claim", claimRouter);
app.use("/api/transaction", transactionRouter);
app.use("/api/exchange-rate", exchangeRateRouter);
app.use("/api/webhooks", webhooksRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logError("http.request.unhandled_error", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Internal server error" });
  }
);

// Start server only when not in test mode
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`BitExpress API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

export default app;
