import { Module, forwardRef } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { MessageModule } from '../message/message.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { EventsModule } from '../events/events.module';
import { AiIntegrationService } from './ai-integration.service';
import { AiIntegrationController } from './ai-integration.controller';
import { SessionManagerService } from './session-manager.service';
import { AiIntegrationPlugin } from '../../plugins/ai-integration/ai-integration.plugin';

@Module({
  imports: [SessionModule, MessageModule, forwardRef(() => AttendanceModule), EventsModule],
  controllers: [AiIntegrationController],
  providers: [AiIntegrationService, SessionManagerService, AiIntegrationPlugin],
  exports: [AiIntegrationService, SessionManagerService],
})
export class AiIntegrationModule {}