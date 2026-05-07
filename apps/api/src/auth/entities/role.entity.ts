import { BaseEntity } from '../../database/entities/base.entity';

export class RoleEntity extends BaseEntity {
  code!: string;
  name!: string;
  description!: string | null;
  is_system!: boolean;
}

