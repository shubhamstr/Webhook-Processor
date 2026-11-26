process.env.STANDALONE_WORKER = 'worker-1';
process.env.WORKERS_AUTO_START = 'false';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Worker1Service } from './worker-1.service';

/**
 * Standalone Worker 1 runner script.
 * Usage: npm run worker:1
 */
async function bootstrapWorker1() {
  console.log('====================================================');
  console.log(' Starting Standalone Webhook Worker 1 (CMD Process) ');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const worker1Service = app.get(Worker1Service);

  console.log(`[Worker 1] Initialized with ID: '${worker1Service.workerId}'`);
  console.log(`[Worker 1] Polling and processing events... Press Ctrl+C to stop.`);
  worker1Service.start();

  const shutdown = async () => {
    console.log('\n--- Shutting down Standalone Worker 1 ---');
    worker1Service.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrapWorker1();
