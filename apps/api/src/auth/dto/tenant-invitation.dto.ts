import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const TENANT_INVITABLE_ROLE_CODES = [
  'admin',
  'teacher',
  'accountant',
  'staff',
  'parent',
  'student',
  'storekeeper',
  'librarian',
  'member',
] as const;

export type TenantInvitableRoleCode = (typeof TENANT_INVITABLE_ROLE_CODES)[number];

export class CreateTenantInvitationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  display_name!: string;

  @IsString()
  @IsIn(TENANT_INVITABLE_ROLE_CODES)
  role_code!: string;
}

export class UpdateTenantMembershipStatusDto {
  @IsString()
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}

export class UpdateTenantMembershipRoleDto {
  @IsString()
  @IsIn(TENANT_INVITABLE_ROLE_CODES)
  role_code!: string;
}

export type TenantInvitationResponseDto = {
  id?: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role_code: TenantInvitableRoleCode;
  invitation_sent: true;
  expires_at: string;
};

export type TenantManagedUserStatus = 'active' | 'suspended' | 'invited' | 'expired';

export type TenantManagedUserDto = {
  id: string;
  kind: 'member' | 'invitation';
  display_name: string;
  email: string;
  role_code: string;
  role_name: string;
  status: TenantManagedUserStatus;
  expires_at: string | null;
  created_at: string;
};

export type TenantManagedUsersResponseDto = {
  users: TenantManagedUserDto[];
};

export type TenantInvitationActionResponseDto = {
  id: string;
  status?: 'revoked';
  invitation_sent?: true;
  expires_at?: string;
};
