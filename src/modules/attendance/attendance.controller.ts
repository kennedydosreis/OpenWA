import {
  Controller, Get, Post, Param, Body, Query, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { TicketQueryDto, AssignTicketDto } from './dto/ticket.dto';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(
    private readonly attendanceService: AttendanceService,
  ) {}

  @Get('tickets')
  @ApiOperation({ summary: 'List attendance tickets with optional filters' })
  @ApiQuery({ name: 'queue', required: false, enum: ['emprestimo', 'cab-geral'] })
  @ApiQuery({ name: 'status', required: false, enum: ['waiting', 'in_progress', 'resolved'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['baixa', 'media', 'alta', 'urgente'] })
  async listTickets(@Query() query: TicketQueryDto) {
    return this.attendanceService.findAll({
      queue: query.queue,
      status: query.status,
      priority: query.priority,
    });
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a single ticket by ID' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  async getTicket(@Param('id') id: string) {
    return this.attendanceService.findOne(id);
  }

  @Post('tickets/:id/assign')
  @ApiOperation({ summary: 'Assign a ticket to an attendant' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  async assignTicket(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    const ticket = await this.attendanceService.assign(id, dto.assignedTo);
    this.logger.log(`Ticket ${id} assigned to ${dto.assignedTo}`);
    return ticket;
  }

  @Post('tickets/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve/close a ticket' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  async resolveTicket(@Param('id') id: string) {
    const ticket = await this.attendanceService.resolve(id);
    this.logger.log(`Ticket ${id} resolved`);
    return ticket;
  }

  @Get('tickets/:id/messages')
  @ApiOperation({ summary: 'Get WhatsApp messages for the ticket conversation' })
  @ApiParam({ name: 'id', description: 'Ticket ID' })
  async getTicketMessages(@Param('id') id: string) {
    const ticket = await this.attendanceService.findOne(id);
    return {
      ticketId: ticket.id,
      csSessionId: ticket.csSessionId,
      chatId: ticket.chatId,
      sessionId: ticket.sessionId,
    };
  }
}