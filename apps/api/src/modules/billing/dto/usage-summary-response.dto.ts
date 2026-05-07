export class UsageSummaryItemDto {
  feature_key!: string;
  total_quantity!: string;
}

export class UsageSummaryResponseDto {
  subscription_id!: string | null;
  period_start!: string | null;
  period_end!: string | null;
  usage!: UsageSummaryItemDto[];
}
