import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, ValidateNested } from 'class-validator';

import { RegisterDeviceDto } from './register-device.dto';
import { SyncCursorDto } from './sync-cursor.dto';
import { SyncPushOperationDto } from './sync-push-operation.dto';

export class SyncPushDto extends RegisterDeviceDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SyncCursorDto)
  cursors?: SyncCursorDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SyncPushOperationDto)
  operations!: SyncPushOperationDto[];
}
