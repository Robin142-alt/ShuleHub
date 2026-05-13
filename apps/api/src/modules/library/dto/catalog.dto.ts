import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ListLibraryBooksQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateLibraryCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateLibraryBookDto {
  @IsString()
  accession_number!: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsString()
  author!: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsString()
  shelf_location!: string;

  @IsInt()
  @Min(0)
  quantity_total!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_available?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_damaged?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_lost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unit_value?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateLibraryBookDto {
  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @IsString()
  shelf_location?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_total?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_available?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_damaged?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity_lost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unit_value?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
