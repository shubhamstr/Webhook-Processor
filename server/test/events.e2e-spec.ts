import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma';

describe('EventsController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testEventId1 = `evt_e2e_events_1_${Date.now()}`;
  const testEventId2 = `evt_e2e_events_2_${Date.now()}`;
  const testEventId3 = `evt_e2e_events_3_${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);

    // Seed test events into database
    await prisma.webhookEvent.createMany({
      data: [
        {
          eventId: testEventId1,
          eventType: 'order.created',
          payload: { orderId: 'ORD-E2E-1', customerId: 'CUS-E2E-1' },
          status: 'pending',
        },
        {
          eventId: testEventId2,
          eventType: 'order.updated',
          payload: { orderId: 'ORD-E2E-2', customerId: 'CUS-E2E-2' },
          status: 'completed',
        },
        {
          eventId: testEventId3,
          eventType: 'payment.failed',
          payload: { orderId: 'ORD-E2E-3', customerId: 'CUS-E2E-3' },
          status: 'failed',
        },
      ],
    });

    const event3 = await prisma.webhookEvent.findUnique({
      where: { eventId: testEventId3 },
    });
    if (event3) {
      await prisma.processingAttempt.create({
        data: {
          eventId: event3.id,
          attemptNumber: 1,
          retryCycle: 1,
          workerId: 'worker-test',
          result: 'failure',
          error: 'Simulated payment processing error',
        },
      });
    }
  });

  afterAll(async () => {
    // Clean up created test events
    await prisma.webhookEvent.deleteMany({
      where: {
        eventId: {
          in: [testEventId1, testEventId2, testEventId3],
        },
      },
    });
    await app.close();
  });

  describe('GET /events', () => {
    it('should return paginated list of events with default pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/events')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
      });
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(3);
    });

    it('should support page and limit query parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?page=1&limit=2')
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should filter events by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?status=completed')
        .expect(200);

      const items = response.body.data;
      expect(items.length).toBeGreaterThanOrEqual(1);
      for (const item of items) {
        expect(item.status.toLowerCase()).toBe('completed');
      }
      expect(items.some((i: any) => i.eventId === testEventId2)).toBe(true);
    });

    it('should filter events by type / eventType', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?type=order.created')
        .expect(200);

      const items = response.body.data;
      expect(items.length).toBeGreaterThanOrEqual(1);
      for (const item of items) {
        expect(item.eventType).toBe('order.created');
      }
      expect(items.some((i: any) => i.eventId === testEventId1)).toBe(true);
    });

    it('should filter events by orderId', async () => {
      const response = await request(app.getHttpServer())
        .get('/events?orderId=ORD-E2E-3')
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].eventId).toBe(testEventId3);
    });

    it('should filter events by search term', async () => {
      const response = await request(app.getHttpServer())
        .get(`/events?search=${testEventId1}`)
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].eventId).toBe(testEventId1);
    });

    it('should reject invalid query parameters', async () => {
      await request(app.getHttpServer()).get('/events?limit=9999').expect(400);

      await request(app.getHttpServer()).get('/events?page=0').expect(400);
    });
  });
});
