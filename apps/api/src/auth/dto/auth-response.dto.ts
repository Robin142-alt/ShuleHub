export class AuthTokensDto {
  access_token!: string;
  refresh_token!: string;
  token_type!: 'Bearer';
  access_expires_in!: number;
  refresh_expires_in!: number;
  access_expires_at!: string;
  refresh_expires_at!: string;
}

export class AuthenticatedUserDto {
  user_id!: string;
  tenant_id!: string | null;
  role!: string;
  audience!: 'superadmin' | 'school' | 'portal';
  email!: string;
  display_name!: string;
  permissions!: string[];
  session_id!: string;
}

export class AuthResponseDto {
  tokens!: AuthTokensDto;
  user!: AuthenticatedUserDto;
}
