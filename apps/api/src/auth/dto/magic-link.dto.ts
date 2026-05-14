import { IsString, MinLength } from 'class-validator';

export class ConsumeMagicLinkDto {
  @IsString()
  @MinLength(16)
  token!: string;
}
