import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from '../members/schemas/organization-member.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { MailerModule } from '../mailer/mailer.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Notification, NotificationSchema } from './schemas/notification.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MailerModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
