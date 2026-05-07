import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListInvoicesQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsIn(['draft', 'open', 'pending_payment', 'paid', 'void', 'uncollectible'])
  status?: string;
}
