import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { DonorsController } from './donors.controller';
import { DonorsService } from './donors.service';
import { Donor, DonorSchema } from './schemas/donor.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Donor.name, schema: DonorSchema },
      { name: Organization.name, schema: OrganizationSchema },
    ]),
  ],
  controllers: [DonorsController],
  providers: [DonorsService],
})
export class DonorsModule {}
