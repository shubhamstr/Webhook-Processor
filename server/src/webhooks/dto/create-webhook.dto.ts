import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
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

  @IsOptional()
  @IsString()
  simulate?: string;

  @IsObject()
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => WebhookDataDto)
  data: WebhookDataDto;
}
