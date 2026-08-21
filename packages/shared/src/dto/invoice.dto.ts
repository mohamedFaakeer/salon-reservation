import { IsEmail } from "class-validator";

/**
 * POST /invoices/:id/send — send this invoice to an address.
 *
 * The address is required rather than defaulting to the customer's, because
 * the commonest reason to resend is that the first one was wrong. Making the
 * operator type it means they have to look at it.
 */
export class SendInvoiceDto {
  @IsEmail()
  email!: string;
}
