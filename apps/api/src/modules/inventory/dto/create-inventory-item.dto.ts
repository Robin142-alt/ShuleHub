import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  item_name!: string;

  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsString()
  unit!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsString()
  supplier_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorder_level!: number;

  @IsOptional()
  @IsString()
  storage_location?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  item_name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorder_level?: number;

  @IsOptional()
  @IsString()
  supplier_id?: string;

  @IsOptional()
  @IsString()
  storage_location?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;
}

export class AdjustStockDto {
  @IsString()
  movement_type!: 'stock_in' | 'stock_out' | 'adjustment';

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
