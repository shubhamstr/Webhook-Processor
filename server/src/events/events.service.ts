import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { GetEventsQueryDto } from './dto';

export interface DashboardStatsResponse {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  permanentlyFailed: number;
  completelyFailed: number;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: GetEventsQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const conditions: Prisma.WebhookEventWhereInput[] = [];

    // Filter by status (case-insensitive)
    if (query.status) {
      conditions.push({
        status: {
          equals: query.status,
          mode: 'insensitive',
        },
      });
    }

    // Filter by event type (support eventType or type)
    const eventType = query.eventType || query.type;
    if (eventType) {
      conditions.push({
        eventType: {
          equals: eventType,
          mode: 'insensitive',
        },
      });
    }

    // Filter by order ID in JSON payload or processed order relation
    if (query.orderId) {
      conditions.push({
        OR: [
          {
            payload: {
              path: ['orderId'],
              string_contains: query.orderId,
            },
          },
          {
            processedOrder: {
              orderId: {
                contains: query.orderId,
                mode: 'insensitive',
              },
            },
          },
        ],
      });
    }

    // Filter by customer ID in JSON payload
    if (query.customerId) {
      conditions.push({
        payload: {
          path: ['customerId'],
          string_contains: query.customerId,
        },
      });
    }

    // General text search across eventId, eventType, or lastError
    if (query.search) {
      conditions.push({
        OR: [
          { eventId: { contains: query.search, mode: 'insensitive' } },
          { eventType: { contains: query.search, mode: 'insensitive' } },
          { lastError: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    // Date range filter
    const start = query.startDate || query.from;
    const end = query.endDate || query.to;
    if (start || end) {
      conditions.push({
        receivedAt: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        },
      });
    }

    const where: Prisma.WebhookEventWhereInput =
      conditions.length > 0 ? { AND: conditions } : {};

    const sortBy = query.sortBy || 'receivedAt';
    const sortOrder = (query.sortOrder || 'desc').toLowerCase() as
      'asc' | 'desc';

    const [total, events] = await Promise.all([
      this.prisma.webhookEvent.count({ where }),
      this.prisma.webhookEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          processingAttempts: {
            orderBy: {
              attemptNumber: 'asc',
            },
          },
          processedOrder: true,
        },
      }),
    ]);

    // Deduplicate processing attempts if any duplicate records exist
    events.forEach((event) => {
      if (event.processingAttempts && event.processingAttempts.length > 0) {
        const seenIds = new Set<string>();
        const seenAttemptKeys = new Set<string>();
        event.processingAttempts = event.processingAttempts.filter((att) => {
          if (seenIds.has(att.id)) return false;
          seenIds.add(att.id);

          const attemptKey = `${att.retryCycle}_${att.attemptNumber}`;
          if (seenAttemptKeys.has(attemptKey)) return false;
          seenAttemptKeys.add(attemptKey);

          return true;
        });
      }
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: events,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    const event = await this.prisma.webhookEvent.findFirst({
      where: isUuid
        ? {
            OR: [{ id }, { eventId: id }],
          }
        : { eventId: id },
      include: {
        processingAttempts: {
          orderBy: {
            attemptNumber: 'asc',
          },
        },
        processedOrder: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${id}' not found`);
    }

    // Deduplicate processingAttempts if any duplicate records exist
    if (event.processingAttempts && event.processingAttempts.length > 0) {
      const seenIds = new Set<string>();
      const seenAttemptKeys = new Set<string>();
      event.processingAttempts = event.processingAttempts.filter((att) => {
        if (seenIds.has(att.id)) return false;
        seenIds.add(att.id);

        const attemptKey = `${att.retryCycle}_${att.attemptNumber}`;
        if (seenAttemptKeys.has(attemptKey)) return false;
        seenAttemptKeys.add(attemptKey);

        return true;
      });
    }

    return event;
  }

  async findAttempts(id: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    const event = await this.prisma.webhookEvent.findFirst({
      where: isUuid
        ? {
            OR: [{ id }, { eventId: id }],
          }
        : { eventId: id },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${id}' not found`);
    }

    const attempts = await this.prisma.processingAttempt.findMany({
      where: { eventId: event.id },
      orderBy: [
        { attemptNumber: 'asc' },
        { startedAt: 'asc' },
      ],
    });

    // Deduplicate attempts by id and (retryCycle, attemptNumber) to prevent any duplicate data
    const seenIds = new Set<string>();
    const seenAttemptKeys = new Set<string>();
    return attempts.filter((att) => {
      if (seenIds.has(att.id)) return false;
      seenIds.add(att.id);

      const attemptKey = `${att.retryCycle}_${att.attemptNumber}`;
      if (seenAttemptKeys.has(attemptKey)) return false;
      seenAttemptKeys.add(attemptKey);

      return true;
    });
  }

  async retry(id: string) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      );

    const event = await this.prisma.webhookEvent.findFirst({
      where: isUuid
        ? {
            OR: [{ id }, { eventId: id }],
          }
        : { eventId: id },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${id}' not found`);
    }

    const normStatus = (event.status || '').toLowerCase().replace(/_/g, ' ').trim();
    if (normStatus !== 'failed' && normStatus !== 'permanently failed') {
      throw new BadRequestException(
        `Only permanently failed events can be retried (current status: '${event.status}')`,
      );
    }

    const updated = await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'pending',
        cycleAttempts: 0,
        nextAttemptAt: new Date(),
        leaseOwner: null,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      },
      include: {
        processingAttempts: {
          orderBy: {
            attemptNumber: 'asc',
          },
        },
        processedOrder: true,
      },
    });

    this.logger.log(`Event '${event.eventId}' reset to 'pending' for retry`);
    return updated;
  }

  async getStats(): Promise<DashboardStatsResponse> {
    const [total, pending, processing, completed, failed] = await Promise.all([
      this.prisma.webhookEvent.count(),
      this.prisma.webhookEvent.count({
        where: { status: { equals: 'pending', mode: 'insensitive' } },
      }),
      this.prisma.webhookEvent.count({
        where: { status: { equals: 'processing', mode: 'insensitive' } },
      }),
      this.prisma.webhookEvent.count({
        where: { status: { equals: 'completed', mode: 'insensitive' } },
      }),
      this.prisma.webhookEvent.count({
        where: {
          OR: [
            { status: { equals: 'failed', mode: 'insensitive' } },
            { status: { equals: 'permanently failed', mode: 'insensitive' } },
            { status: { contains: 'fail', mode: 'insensitive' } },
          ],
        },
      }),
    ]);

    return {
      total,
      pending,
      processing,
      completed,
      failed,
      permanentlyFailed: failed,
      completelyFailed: failed,
    };
  }
}
