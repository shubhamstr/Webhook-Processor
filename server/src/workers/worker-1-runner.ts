process.env.STANDALONE_WORKER = 'worker-1';
process.env.WORKERS_AUTO_START = 'false';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module';
import { Worker1Service } from './worker-1.service';

/**
 * Standalone Worker 1 runner script.
 * Usage: npm run worker:1
 */
async function bootstrapWorker1() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const worker1Service = app.get(Worker1Service);
  logger.log(
    `Starting Standalone Webhook Worker 1 [${worker1Service.workerId}]`,
    'Worker1Runner',
  );
  logger.log(
    'Polling and processing events... Press Ctrl+C to stop.',
    'Worker1Runner',
  );
  worker1Service.start();

  const shutdown = async () => {
    logger.log('Shutting down Standalone Worker 1...', 'Worker1Runner');
    worker1Service.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrapWorker1();
