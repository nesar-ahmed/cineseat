import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from '../database/entities';
import { PaymentsModule } from '../payments/payments.module';
import { MockGatewayController } from './mock-gateway.controller';
import { MockGatewayService } from './mock-gateway.service';
import { MockWebhookSender } from './mock-webhook.sender';

/**
 * TEST MODE: a pretend payment provider — hosted payment page API, test cards,
 * signed webhooks — so checkout works end to end without real money. It only
 * reads payments; the API learns the outcome through its webhook like it would
 * from a real provider.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment]), PaymentsModule],
  controllers: [MockGatewayController],
  providers: [MockGatewayService, MockWebhookSender],
})
export class MockGatewayModule {}
