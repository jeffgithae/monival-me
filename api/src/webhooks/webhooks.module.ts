import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Webhook, WebhookSchema } from './schemas/webhook.schema';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Webhook.name, schema: WebhookSchema }]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}