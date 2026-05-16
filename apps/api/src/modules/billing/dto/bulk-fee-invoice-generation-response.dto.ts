import { InvoiceResponseDto } from './invoice-response.dto';

export class BulkFeeInvoiceSkippedStudentDto {
  student_id!: string;
  student_name!: string;
  reason!: string;
  invoice_id!: string | null;
}

export class BulkFeeInvoiceGenerationResponseDto {
  fee_structure_id!: string;
  idempotency_key!: string;
  generated_count!: number;
  skipped_count!: number;
  invoices!: InvoiceResponseDto[];
  skipped!: BulkFeeInvoiceSkippedStudentDto[];
}
