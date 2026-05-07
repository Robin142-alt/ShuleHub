export class MpesaCallbackResponseDto {
  accepted!: boolean;
  duplicate!: boolean;
  callback_log_id!: string;
  checkout_request_id!: string | null;
}
