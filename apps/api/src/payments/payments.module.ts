import { Module } from '@nestjs/common';
import { AdminPaymentsController } from './admin-payments.controller';
import { AdminPaymentsService } from './admin-payments.service';
import { MockPaymentProvider } from './mock-payment-provider';
import { PaymentEventsService } from './payment-events.service';
import { PaymentsWebhookController } from './payments-webhook.controller';

/**
 * The (mock) payment provider, the webhook through which it reports payment
 * results, and every payment attempt for the admin panel (`/admin/payments`, read-only).
 */
@Module({
  controllers: [PaymentsWebhookController, AdminPaymentsController],
  providers: [MockPaymentProvider, PaymentEventsService, AdminPaymentsService],
  exports: [MockPaymentProvider, PaymentEventsService],
})
export class PaymentsModule {}
