import { Module, forwardRef } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AiIntegrationModule } from '../ai-integration/ai-integration.module';

@Module({
  imports: [forwardRef(() => AiIntegrationModule)],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}