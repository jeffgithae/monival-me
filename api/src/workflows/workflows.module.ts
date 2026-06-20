import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { WorkflowsController } from './workflows.controller';
import { WorkflowService } from './workflows.service';
import {
  WorkflowDefinition, WorkflowDefinitionSchema,
  WorkflowInstance, WorkflowInstanceSchema,
} from './schemas/workflow.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkflowDefinition.name, schema: WorkflowDefinitionSchema },
      { name: WorkflowInstance.name,  schema: WorkflowInstanceSchema  },
      { name: User.name,              schema: UserSchema             },
    ]),
    NotificationsModule,
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowsModule {}