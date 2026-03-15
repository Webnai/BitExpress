import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import { PORT, CORS_ORIGIN } from "./config";
import { requestContextMiddleware } from "./middleware/requestContext";
import authRouter from "./routes/auth";
import sendRouter from "./routes/send";
import claimRouter from "./routes/claim";
import transactionRouter from "./routes/transaction";
import exchangeRateRouter from "./routes/exchangeRate";
import { logError } from "./utils/logging";

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  })
);

// Rate limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: "10kb" }));
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
