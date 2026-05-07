import { BaseEntity } from '../../database/entities/base.entity';

export class TenantMembershipEntity extends BaseEntity {
  user_id!: string;
  role_id!: string;
  role_code!: string;
  role_name!: string;
  status!: string;
}

