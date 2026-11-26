import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  ValidateNested,
} from 'class-validator';
import { WebhookDataDto } from './webhook-data.dto';

export class CreateWebhookDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => WebhookDataDto)
  data: WebhookDataDto;
}
