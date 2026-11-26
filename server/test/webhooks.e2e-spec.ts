import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma';

describe('WebhooksController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  const testEventId1 = `evt_test_ingestion_${Date.now()}`;
  const testEventId2 = `evt_test_duplicate_${Date.now()}`;

  afterAll(async () => {
    // Clean up created test events
    await prisma.webhookEvent.deleteMany({
      where: {
        eventId: {
          in: [testEventId1, testEventId2],
        },
      },
    });
  });

  describe('POST /webhooks', () => {
    it('should ingest valid webhook event and return 202 Accepted', async () => {
      const payload = {
        eventId: testEventId1,
        type: 'order.created',
        data: {
          orderId: 'ORD-1001',
          customerId: 'CUS-42',
          simulate: 'fail_then_succeed:2',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/webhooks')
        .send(payload)
        .expect(202);

      expect(response.body).toEqual({
        status: 'accepted',
        eventId: testEventId1,
      });

      // Verify event was saved to PostgreSQL
      const persisted = await prisma.webhookEvent.findUnique({
        where: { eventId: testEventId1 },
      });
      expect(persisted).toBeDefined();
      expect(persisted?.eventId).toBe(testEventId1);
      expect(persisted?.eventType).toBe('order.created');
      expect(persisted?.status).toBe('pending');
      expect(persisted?.payload).toEqual(payload.data);
    });

    it('should return 202 Accepted on duplicate delivery and keep original payload when payload differs', async () => {
      const originalPayload = {
        eventId: testEventId2,
        type: 'order.created',
        data: {
          orderId: 'ORD-ORIGINAL',
          customerId: 'CUS-ORIGINAL',
          simulate: 'fail_then_succeed:2',
        },
      };

      // First delivery
      await request(app.getHttpServer())
        .post('/webhooks')
        .send(originalPayload)
        .expect(202);

      // Verify original is in database
      const firstPersisted = await prisma.webhookEvent.findUnique({
        where: { eventId: testEventId2 },
      });
      expect(firstPersisted?.payload).toEqual(originalPayload.data);

      // Duplicate delivery with DIFFERENT payload
      const differentPayload = {
        eventId: testEventId2,
        type: 'order.created',
        data: {
          orderId: 'ORD-CHANGED',
          customerId: 'CUS-CHANGED',
        },
      };

      const duplicateResponse = await request(app.getHttpServer())
        .post('/webhooks')
        .send(differentPayload)
        .expect(202);

      expect(duplicateResponse.body).toEqual({
        status: 'accepted',
        eventId: testEventId2,
      });

      // Verify original payload was KEPT and the later one was ignored
      const afterDuplicate = await prisma.webhookEvent.findUnique({
        where: { eventId: testEventId2 },
      });
      expect(afterDuplicate?.payload).toEqual(originalPayload.data);
      expect((afterDuplicate?.payload as any)?.orderId).toBe('ORD-ORIGINAL');
    });

    it('should return 400 Bad Request when eventId is missing', async () => {
      const invalidPayload = {
        type: 'order.created',
        data: {
          orderId: 'ORD-1001',
          customerId: 'CUS-42',
        },
      };

      await request(app.getHttpServer())
        .post('/webhooks')
        .send(invalidPayload)
        .expect(400);
    });

    it('should return 400 Bad Request when type is missing', async () => {
      const invalidPayload = {
        eventId: 'evt_invalid_1',
        data: {
          orderId: 'ORD-1001',
          customerId: 'CUS-42',
        },
      };

      await request(app.getHttpServer())
        .post('/webhooks')
        .send(invalidPayload)
        .expect(400);
    });

    it('should return 400 Bad Request when data is missing', async () => {
      const invalidPayload = {
        eventId: 'evt_invalid_2',
        type: 'order.created',
      };

      await request(app.getHttpServer())
        .post('/webhooks')
        .send(invalidPayload)
        .expect(400);
    });

    it('should return 400 Bad Request when data.orderId is missing', async () => {
      const invalidPayload = {
        eventId: 'evt_invalid_3',
        type: 'order.created',
        data: {
          customerId: 'CUS-42',
        },
      };

      await request(app.getHttpServer())
        .post('/webhooks')
        .send(invalidPayload)
        .expect(400);
    });
  });
});
