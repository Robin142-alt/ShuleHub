import { Injectable } from '@nestjs/common';

import { PaymentScenario } from '../../modules/seeder/seeder.types';

@Injectable()
export class PaymentFactory {
  buildScenario(input: {
    invoice_number: string;
    total_amount_minor: string;
    due_at: string;
    payment_phone_seed: string;
    ordinal: number;
  }): PaymentScenario {
    const totalMinor = BigInt(input.total_amount_minor);
    const selector = input.ordinal % 5;

    if (selector === 0 || selector === 1) {
      return {
        invoice_number: input.invoice_number,
        total_amount_minor: input.total_amount_minor,
        paid_amount_minor: totalMinor.toString(),
        status: 'paid',
        payment_reference: `seed:payment:${input.invoice_number}:full`,
        payment_description: `Full settlement for ${input.invoice_number}`,
        paid_at: new Date(new Date(input.due_at).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        receipt_reference: `RCP${String(410000 + input.ordinal).padStart(6, '0')}`,
      };
    }

    if (selector === 2 || selector === 3) {
      const paidAmount = (totalMinor * 65n) / 100n;
      return {
        invoice_number: input.invoice_number,
        total_amount_minor: input.total_amount_minor,
        paid_amount_minor: paidAmount.toString(),
        status: 'pending_payment',
        payment_reference: `seed:payment:${input.invoice_number}:partial`,
        payment_description: `Partial settlement for ${input.invoice_number}`,
        paid_at: new Date(new Date(input.due_at).getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        receipt_reference: `RCP${String(510000 + input.ordinal).padStart(6, '0')}`,
      };
    }

    return {
      invoice_number: input.invoice_number,
      total_amount_minor: input.total_amount_minor,
      paid_amount_minor: '0',
      status: 'open',
      payment_reference: null,
      payment_description: null,
      paid_at: null,
      receipt_reference: null,
    };
  }
}
