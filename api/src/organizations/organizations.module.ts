import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Indicator, IndicatorSchema } from '../indicators/schemas/indicator.schema';
import { OrganizationMember, OrganizationMemberSchema } from '../members/schemas/organization-member.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { EntitlementsService } from './entitlements.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { TenantService } from './tenant.service';
import { Organization, OrganizationSchema } from './schemas/organization.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Indicator.name, schema: IndicatorSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, EntitlementsService, TenantService],
  exports: [OrganizationsService, EntitlementsService, TenantService],
})
export class OrganizationsModule {}
