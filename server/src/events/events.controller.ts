import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetEventsQueryDto } from './dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async findAll(@Query() query: GetEventsQueryDto) {
    return this.eventsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }
}
