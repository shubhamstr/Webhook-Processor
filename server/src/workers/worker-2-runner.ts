process.env.STANDALONE_WORKER = 'worker-2';
process.env.WORKERS_AUTO_START = 'false';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module';
import { Worker2Service } from './worker-2.service';

/**
 * Standalone Worker 2 runner script.
 * Usage: npm run worker:2
 */
async function bootstrapWorker2() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const worker2Service = app.get(Worker2Service);
  logger.log(
    `Starting Standalone Webhook Worker 2 [${worker2Service.workerId}]`,
    'Worker2Runner',
  );
  logger.log(
    'Polling and processing events... Press Ctrl+C to stop.',
    'Worker2Runner',
  );
  worker2Service.start();

  const shutdown = async () => {
    logger.log('Shutting down Standalone Worker 2...', 'Worker2Runner');
    worker2Service.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrapWorker2();
