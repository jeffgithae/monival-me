import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StakeholderFeedback, StakeholderFeedbackSchema } from './schemas/stakeholder-feedback.schema';
import { StakeholderFeedbackService } from './stakeholder-feedback.service';
import { StakeholderFeedbackController } from './stakeholder-feedback.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StakeholderFeedback.name, schema: StakeholderFeedbackSchema },
    ]),
  ],
  controllers: [StakeholderFeedbackController],
  providers: [StakeholderFeedbackService],
  exports: [StakeholderFeedbackService],
})
export class StakeholderFeedbackModule {}
