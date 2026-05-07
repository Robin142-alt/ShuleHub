import { BaseEntity } from '../../../database/entities/base.entity';
import { SyncEntity } from '../sync.types';

export class SyncOperationLogEntity extends BaseEntity {
  op_id!: string;
  device_id!: string;
  entity!: SyncEntity;
  payload!: Record<string, unknown>;
  version!: string;
}
