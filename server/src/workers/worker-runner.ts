import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { WorkersService } from './workers.service';

/**
 * Standalone worker runner script.
 * Usage: npm run worker
 */
async function bootstrapWorkers() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const workersService = app.get(WorkersService);

  console.log('--- Starting Standalone PostgreSQL Workers ---');
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
