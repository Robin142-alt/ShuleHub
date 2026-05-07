import { BaseEntity } from '../../database/entities/base.entity';

export class PermissionEntity extends BaseEntity {
  resource!: string;
  action!: string;
  description!: string | null;
}

