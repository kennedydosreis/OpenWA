import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AttendanceTicket, TicketPriority, TicketQueue, TicketStatus } from './entities/attendance-ticket.entity';
import { SessionManagerService } from '../ai-integration/session-manager.service';

export interface CreateTicketInput {
  csSessionId: string;
  chatId: string;
  sessionId: string;
  customerPhone: string;
  customerName?: string;
  priority?: 'baixa' | 'media' | 'alta' | 'urgente';
  queue?: 'emprestimo' | 'cab-geral';
  lastMessage?: string;
  csPayload?: Record<string, unknown>;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private readonly ticketRepo: Repository<AttendanceTicket>;

  constructor(
    @InjectDataSource('data')
    private readonly dataSource: DataSource,
    private readonly sessionManager: SessionManagerService,
  ) {
    this.ticketRepo = this.dataSource.getRepository(AttendanceTicket);
    this.logger.log('AttendanceService initialized with DataSource injection');
  }

  async createTicket(input: CreateTicketInput): Promise<AttendanceTicket> {
    const ticket = new AttendanceTicket();
    ticket.csSessionId = input.csSessionId;
    ticket.chatId = input.chatId;
    ticket.sessionId = input.sessionId;
    ticket.customerPhone = input.customerPhone;
    ticket.customerName = input.customerName ?? '';
    ticket.priority = (input.priority ?? 'media') as TicketPriority;
    ticket.queue = (input.queue ?? 'cab-geral') as TicketQueue;
    ticket.status = TicketStatus.WAITING;
    ticket.lastMessage = input.lastMessage ?? '';
    ticket.csPayload = input.csPayload ?? null;
    return this.ticketRepo.save(ticket);
  }

  async findAll(filters?: {
    queue?: string;
    status?: string;
    priority?: string;
  }): Promise<AttendanceTicket[]> {
    const qb = this.ticketRepo.createQueryBuilder('ticket');

    if (filters?.queue) {
      qb.andWhere('ticket.queue = :queue', { queue: filters.queue });
    }
    if (filters?.status) {
      qb.andWhere('ticket.status = :status', { status: filters.status });
    }
    if (filters?.priority) {
      qb.andWhere('ticket.priority = :priority', { priority: filters.priority });
    }

    // Order by priority (urgent first) then FIFO
    qb.orderBy(
      `CASE ticket.priority
        WHEN 'urgente' THEN 0
        WHEN 'alta' THEN 1
        WHEN 'media' THEN 2
        WHEN 'baixa' THEN 3
        ELSE 4 END`,
      'ASC',
    ).addOrderBy('ticket.createdAt', 'ASC');

    return qb.getMany();
  }

  async findOne(id: string): Promise<AttendanceTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
    return ticket;
  }

  async assign(id: string, assignedTo: string): Promise<AttendanceTicket> {
    const ticket = await this.findOne(id);
    if (ticket.status !== TicketStatus.WAITING) {
      throw new Error(`Ticket ${id} is not waiting (current: ${ticket.status})`);
    }
    ticket.status = TicketStatus.IN_PROGRESS;
    ticket.assignedTo = assignedTo;
    this.logger.log(`Ticket ${id} assigned to ${assignedTo}`);
    return this.ticketRepo.save(ticket);
  }

  async resolve(id: string): Promise<AttendanceTicket> {
    const ticket = await this.findOne(id);
    ticket.status = TicketStatus.RESOLVED;
    ticket.resolvedAt = new Date();
    this.logger.log(`Ticket ${id} resolved`);
    const saved = await this.ticketRepo.save(ticket);
    if (ticket.chatId) {
      this.sessionManager.unlock(ticket.chatId);
      this.logger.log(`Session unlocked after ticket resolution: chatId=${ticket.chatId}`);
    }
    return saved;
  }

  async updateLastMessage(csSessionId: string, message: string): Promise<void> {
    const ticket = await this.ticketRepo.findOne({
      where: { csSessionId },
      order: { createdAt: 'DESC' },
    });
    if (ticket) {
      ticket.lastMessage = message.slice(0, 500);
      await this.ticketRepo.save(ticket);
    }
  }

  async findByCsSessionId(csSessionId: string): Promise<AttendanceTicket | null> {
    return this.ticketRepo.findOne({
      where: { csSessionId },
      order: { createdAt: 'DESC' },
    });
  }
}