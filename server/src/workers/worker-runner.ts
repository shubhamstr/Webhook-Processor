process.env.STANDALONE_WORKER = 'all';
process.env.WORKERS_AUTO_START = 'false';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Worker1Service } from './worker-1.service';
import { Worker2Service } from './worker-2.service';
import { WorkersService } from './workers.service';

/**
 * Standalone worker runner script supporting running worker 1, worker 2, or both.
 * Usage:
 *   npm run worker          (runs both workers)
 *   npm run worker -- 1     (runs worker 1)
 *   npm run worker -- 2     (runs worker 2)
 */
async function bootstrapWorkers() {
  const args = process.argv.slice(2);
  const runOnly1 = args.includes('1') || args.includes('--worker=1');
  const runOnly2 = args.includes('2') || args.includes('--worker=2');

  const app = await NestFactory.createApplicationContext(AppModule);

  if (runOnly1) {
    const worker1 = app.get(Worker1Service);
    console.log('====================================================');
    console.log(` Starting Standalone Worker 1 [${worker1.workerId}]`);
    console.log('====================================================');
    worker1.start();

    const shutdown = async () => {
      console.log('\n--- Shutting down Worker 1 ---');
      worker1.stop();
      await app.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  if (runOnly2) {
    const worker2 = app.get(Worker2Service);
    console.log('====================================================');
    console.log(` Starting Standalone Worker 2 [${worker2.workerId}]`);
    console.log('====================================================');
    worker2.start();

    const shutdown = async () => {
      console.log('\n--- Shutting down Worker 2 ---');
      worker2.stop();
      await app.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  // Default: run both workers
  const workersService = app.get(WorkersService);
  console.log('====================================================');
  console.log(' Starting Standalone PostgreSQL Workers (Both 1 & 2)');
  console.log('====================================================');
  workersService.startWorkers();

  const shutdown = async () => {
    console.log('\n--- Shutting down Standalone PostgreSQL Workers ---');
    workersService.stopWorkers();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrapWorkers();
