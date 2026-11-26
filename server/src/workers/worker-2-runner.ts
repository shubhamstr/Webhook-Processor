process.env.STANDALONE_WORKER = 'worker-2';
process.env.WORKERS_AUTO_START = 'false';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Worker2Service } from './worker-2.service';

/**
 * Standalone Worker 2 runner script.
 * Usage: npm run worker:2
 */
async function bootstrapWorker2() {
  console.log('====================================================');
  console.log(' Starting Standalone Webhook Worker 2 (CMD Process) ');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const worker2Service = app.get(Worker2Service);

  console.log(`[Worker 2] Initialized with ID: '${worker2Service.workerId}'`);
  console.log(`[Worker 2] Polling and processing events... Press Ctrl+C to stop.`);
  worker2Service.start();

  const shutdown = async () => {
    console.log('\n--- Shutting down Standalone Worker 2 ---');
    worker2Service.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrapWorker2();
