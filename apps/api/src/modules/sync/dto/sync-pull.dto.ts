import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { SYNC_DEFAULT_PULL_LIMIT, SYNC_MAX_PULL_LIMIT, SYNC_SUPPORTED_ENTITIES } from '../sync.constants';
import { RegisterDeviceDto } from './register-device.dto';
import { SyncCursorDto } from './sync-cursor.dto';

export class SyncPullDto extends RegisterDeviceDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncCursorDto)
  cursors?: SyncCursorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn([...SYNC_SUPPORTED_ENTITIES], { each: true })
  entities?: Array<(typeof SYNC_SUPPORTED_ENTITIES)[number]>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_MAX_PULL_LIMIT)
  limit?: number = SYNC_DEFAULT_PULL_LIMIT;
}
