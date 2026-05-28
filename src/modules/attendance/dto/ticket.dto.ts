import { IsString, IsOptional, IsIn, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority, TicketQueue, TicketStatus } from '../entities/attendance-ticket.entity';

export class CreateTicketDto {
  @ApiProperty({ description: 'Session ID from the AI provider' })
  @IsString()
  csSessionId: string;

  @ApiProperty({ description: 'WhatsApp JID (e.g., 5511999999999@c.us)' })
  @IsString()
  chatId: string;

  @ApiProperty({ description: 'OpenWA session ID' })
  @IsString()
  sessionId: string;

  @ApiProperty({ description: 'Customer phone number' })
  @IsString()
  customerPhone: string;

  @ApiPropertyOptional({ description: 'Customer display name' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({
    enum: TicketPriority,
    default: TicketPriority.MEDIA,
    description: 'Ticket priority',
  })
  @IsOptional()
  @IsIn(Object.values(TicketPriority))
  priority?: TicketPriority;

  @ApiPropertyOptional({
    enum: TicketQueue,
    default: TicketQueue.CAB_GERAL,
    description: 'Routing queue',
  })
  @IsOptional()
  @IsIn(Object.values(TicketQueue))
  queue?: TicketQueue;

  @ApiPropertyOptional({ description: 'Last message preview' })
  @IsOptional()
  @IsString()
  lastMessage?: string;

  @ApiPropertyOptional({ description: 'Full AI provider response payload' })
  @IsOptional()
  @IsObject()
  csPayload?: Record<string, unknown>;
}

export class AssignTicketDto {
  @ApiProperty({ description: 'Username or ID of the attendant' })
  @IsString()
  assignedTo: string;
}

export class TicketQueryDto {
  @ApiPropertyOptional({ enum: TicketQueue, description: 'Filter by queue' })
  @IsOptional()
  @IsIn(Object.values(TicketQueue))
  queue?: TicketQueue;

  @ApiPropertyOptional({ enum: TicketStatus, description: 'Filter by status' })
  @IsOptional()
  @IsIn(Object.values(TicketStatus))
  status?: TicketStatus;

  @ApiPropertyOptional({
    enum: TicketPriority,
    description: 'Filter by priority',
  })
  @IsOptional()
  @IsIn(Object.values(TicketPriority))
  priority?: TicketPriority;
}

export class TicketResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  csSessionId: string;

  @ApiProperty()
  chatId: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  customerPhone: string;

  @ApiPropertyOptional()
  customerName?: string;

  @ApiProperty({ enum: TicketPriority })
  priority: TicketPriority;

  @ApiProperty({ enum: TicketQueue })
  queue: TicketQueue;

  @ApiProperty({ enum: TicketStatus })
  status: TicketStatus;

  @ApiPropertyOptional()
  assignedTo?: string | null;

  @ApiPropertyOptional()
  lastMessage?: string;

  @ApiPropertyOptional()
  csPayload?: Record<string, unknown> | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiPropertyOptional()
  resolvedAt?: string | null;
}