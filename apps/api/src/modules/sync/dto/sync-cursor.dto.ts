import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches } from 'class-validator';

import { SYNC_SUPPORTED_ENTITIES } from '../sync.constants';
import type { SyncEntity } from '../sync.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SyncCursorDto {
  @Transform(trim)
  @IsString()
  @IsIn([...SYNC_SUPPORTED_ENTITIES])
  entity!: SyncEntity;

  @Transform(trim)
  @IsString()
  @Matches(/^\d+$/)
  last_version!: string;
}
