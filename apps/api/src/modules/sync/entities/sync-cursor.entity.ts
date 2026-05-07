import { BaseEntity } from '../../../database/entities/base.entity';
import { SyncEntity } from '../sync.types';

export class SyncCursorEntity extends BaseEntity {
  device_id!: string;
  entity!: SyncEntity;
  last_version!: string;
}
