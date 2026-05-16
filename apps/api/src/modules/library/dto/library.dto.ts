import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class IssueLibraryCopyDto {
  @IsString()
  copy_id!: string;

  @IsString()
  borrower_id!: string;

  @IsString()
  due_on!: string;
}

export class ReserveLibraryCopyDto {
  @IsString()
  catalog_item_id!: string;

  @IsString()
  borrower_id!: string;
}

export class ReturnLibraryCopyDto {
  @IsString()
  loan_id!: string;

  @IsString()
  returned_on!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  daily_fine_minor?: number;
}

export class IssueLibraryByScanDto {
  @IsString()
  borrower_scan_code!: string;

  @IsString()
  book_scan_code!: string;

  @IsString()
  due_on!: string;
}

export class ReturnLibraryByScanDto {
  @IsString()
  book_scan_code!: string;

  @IsString()
  returned_on!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  daily_fine_minor?: number;
}
