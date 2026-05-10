import app from './app.js';
import { serverConfig } from './config/server.js';
import { initializeDatabase } from './services/report.service.js';
import { logger } from './utils/logger.js';

async function start() {
  await initializeDatabase();

  app.listen(serverConfig.port, () => {
    logger.info('server.started', {
      port: serverConfig.port,
      allowedOrigins: Array.from(serverConfig.allowedOrigins),
      rateLimitWindowMs: serverConfig.rateLimitWindowMs,
      rateLimitMax: serverConfig.rateLimitMax,
    });
  });
}

start().catch((err) => {
  logger.error('server.start_failed', { error: err });
  process.exit(1);
});
