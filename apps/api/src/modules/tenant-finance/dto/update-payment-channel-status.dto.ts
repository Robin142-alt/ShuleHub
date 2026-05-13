import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdatePaymentChannelStatusDto {
  @Transform(trim)
  @IsIn(['active', 'inactive', 'testing'])
  status!: 'active' | 'inactive' | 'testing';
}
