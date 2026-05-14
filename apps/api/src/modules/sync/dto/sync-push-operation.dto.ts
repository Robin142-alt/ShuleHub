import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { SYNC_SUPPORTED_ENTITIES } from '../sync.constants';
import type { SyncEntity } from '../sync.types';

export class SyncPushOperationDto {
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)
  op_id!: string;

  @IsString()
  @IsIn([...SYNC_SUPPORTED_ENTITIES])
  entity!: SyncEntity;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsObject()
  payload!: Record<string, unknown>;
}
