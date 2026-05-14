import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateInventoryCategoryDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsString()
  storage_zones?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateInventoryCategoryDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  manager?: string;

  @IsOptional()
  @IsString()
  storage_zones?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateInventoryLocationDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class UpdateInventoryLocationDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class CreateInventorySupplierDto {
  @IsString()
  supplier_name!: string;

  @IsOptional()
  @IsString()
  contact_person?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'on_hold'])
  status?: 'active' | 'on_hold';
}

export class UpdateInventorySupplierDto {
  @IsOptional()
  @IsString()
  supplier_name?: string;

  @IsOptional()
  @IsString()
  contact_person?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'on_hold'])
  status?: 'active' | 'on_hold';
}
