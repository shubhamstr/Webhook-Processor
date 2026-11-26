import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { GetEventsQueryDto } from './dto';

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
      | 'asc'
      | 'desc';

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

    return event;
  }
}
