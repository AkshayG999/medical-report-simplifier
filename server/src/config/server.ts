import './env.js';

export const serverConfig = {
  port: Number(process.env.PORT || 3001),
  allowedOrigins: new Set(
    (process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:3000,http://127.0.0.1:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  ),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
};
