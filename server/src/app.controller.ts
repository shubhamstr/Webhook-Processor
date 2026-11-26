import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService, HealthCheckResponse } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthCheckResponse> {
    const health = await this.appService.getHealth();
    if (health.status !== 'ok') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return health;
  }
}
