import { BaseEntity } from '../../database/entities/base.entity';

export class UserEntity extends BaseEntity {
  email!: string;
  password_hash!: string;
  display_name!: string;
  status!: string;
}

