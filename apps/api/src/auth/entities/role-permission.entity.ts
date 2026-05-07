import { BaseEntity } from '../../database/entities/base.entity';

export class RolePermissionEntity extends BaseEntity {
  role_id!: string;
  permission_id!: string;
}

