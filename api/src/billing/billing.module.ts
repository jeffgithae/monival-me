import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MailerModule } from '../mailer/mailer.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [
    OrganizationsModule,
    MailerModule,
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
