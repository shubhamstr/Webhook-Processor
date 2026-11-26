import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { CreateWebhookDto } from './dto';
import { getISTDate } from '../common/time.utils';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestWebhook(dto: CreateWebhookDto) {
    // Check if an event with this eventId already exists (idempotency check)
    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventId: dto.eventId },
    });

    if (existing) {
      this.logger.log(
        `Duplicate delivery received for eventId '${dto.eventId}'. Keeping existing record and ignoring the incoming payload.`,
      );
      return {
        status: 'accepted',
        eventId: dto.eventId,
      };
    }

    try {
      const payloadData: Record<string, unknown> = {
        ...dto.data,
      };
      if (dto.simulate && !dto.data?.simulate) {
        payloadData.simulate = dto.simulate;
      }

      const istNow = getISTDate();
      const created = await this.prisma.webhookEvent.create({
        data: {
          eventId: dto.eventId,
          eventType: dto.type,
          payload: payloadData as unknown as Prisma.InputJsonValue,
          status: 'pending',
          receivedAt: istNow,
          updatedAt: istNow,
        },
      });

      this.logger.log(`Ingested eventId '${created.eventId}' successfully.`);
      return {
        status: 'accepted',
        eventId: created.eventId,
      };
    } catch (error) {
      // Handle concurrent insert race condition (P2002: unique constraint failed on event_id)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.log(
          `Concurrent duplicate delivery received for eventId '${dto.eventId}'. Keeping existing record and ignoring the incoming payload.`,
        );
        return {
          status: 'accepted',
          eventId: dto.eventId,
        };
      }
      this.logger.error(
        `Failed to persist webhook event '${dto.eventId}': ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
