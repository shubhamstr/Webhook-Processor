import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Server is running!');
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      database: {
        status: 'up',
      },
    });
    expect(typeof response.body.uptime).toBe('number');
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.database.latencyMs).toBe('number');
  });

  it('/stats (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/stats')
      .expect(200);

    expect(typeof response.body.total).toBe('number');
    expect(typeof response.body.pending).toBe('number');
    expect(typeof response.body.processing).toBe('number');
    expect(typeof response.body.completed).toBe('number');
    expect(typeof response.body.failed).toBe('number');
    expect(typeof response.body.permanentlyFailed).toBe('number');
  });

  afterEach(async () => {
    await app.close();
  });
});
