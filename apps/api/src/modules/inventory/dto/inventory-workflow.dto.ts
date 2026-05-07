import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class InventoryLineDto {
  @IsString()
  item_id!: string;

  @IsString()
  item_name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unit_price!: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplier_id!: string;

  @IsOptional()
  @IsString()
  expected_delivery_date?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  lines!: InventoryLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWorkflowStatusDto {
  @IsString()
  @IsIn(['draft', 'pending', 'approved', 'received', 'cancelled', 'fulfilled', 'in_transit', 'completed'])
  status!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateInventoryRequestDto {
  @IsString()
  department!: string;

  @IsString()
  requested_by!: string;

  @IsOptional()
  @IsString()
  needed_by?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  lines!: InventoryLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateTransferDto {
  @IsString()
  from_location!: string;

  @IsString()
  to_location!: string;

  @IsString()
  requested_by!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  lines!: InventoryLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateIncidentDto {
  @IsString()
  item_id!: string;

  @IsString()
  @IsIn(['broken', 'lost', 'expired'])
  incident_type!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  reason!: string;

  @IsString()
  responsible_department!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost_impact!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
