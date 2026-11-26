import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CreateWebhookDto } from './dto';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestWebhook(@Body() createWebhookDto: CreateWebhookDto) {
    return this.webhooksService.ingestWebhook(createWebhookDto);
  }
}
