import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ImpactStoriesController } from './impact-stories.controller';
import { ImpactStoriesService } from './impact-stories.service';
import { ImpactStory, ImpactStorySchema } from './schemas/impact-story.schema';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImpactStory.name, schema: ImpactStorySchema },
    ]),
  ],
  controllers: [ImpactStoriesController],
  providers: [ImpactStoriesService],
  exports: [ImpactStoriesService],
})
export class ImpactStoriesModule {}