import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { BrandingConfig, BrandingConfigSchema } from './schemas/branding-config.schema';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BrandingConfig.name, schema: BrandingConfigSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}