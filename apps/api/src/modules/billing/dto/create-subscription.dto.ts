import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsInt,
} from 'class-validator';

import { BILLING_SUPPORTED_PLAN_CODES } from '../billing.constants';
import { SubscriptionStatus } from '../billing.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSubscriptionDto {
  @Transform(trim)
  @IsString()
  @IsIn(BILLING_SUPPORTED_PLAN_CODES)
  plan_code!: (typeof BILLING_SUPPORTED_PLAN_CODES)[number];

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsIn(['trialing', 'active', 'past_due', 'restricted', 'suspended', 'canceled', 'expired'])
  status?: SubscriptionStatus;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(32)
  billing_phone_number?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats_allocated?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
