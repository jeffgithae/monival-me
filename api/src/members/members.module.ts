import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MailerModule } from '../mailer/mailer.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { Invite, InviteSchema } from './schemas/invite.schema';
import { OrganizationMember, OrganizationMemberSchema } from './schemas/organization-member.schema';

@Module({
  imports: [
    OrganizationsModule,
    MailerModule,
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: Invite.name, schema: InviteSchema },
      { name: User.name, schema: UserSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
