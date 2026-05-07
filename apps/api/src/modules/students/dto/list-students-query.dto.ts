import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListStudentsQueryDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  search?: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive', 'graduated', 'transferred'])
  status?: 'active' | 'inactive' | 'graduated' | 'transferred';

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
