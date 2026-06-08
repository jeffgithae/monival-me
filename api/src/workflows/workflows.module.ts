import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { WorkflowsController } from './workflows.controller';
import { WorkflowService } from './workflows.service';
import {
  WorkflowDefinition, WorkflowDefinitionSchema,
  WorkflowInstance, WorkflowInstanceSchema,
} from './schemas/workflow.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: WorkflowInstance.name,  schema: WorkflowInstanceSchema  },
    ]),
    NotificationsModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowsModule {}
