import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TicketPriority {
  BAIXA = 'baixa',
  MEDIA = 'media',
  ALTA = 'alta',
  URGENTE = 'urgente',
}

export enum TicketQueue {
  EMPRESTIMO = 'emprestimo',
  CAB_GERAL = 'cab-geral',
}

export enum TicketStatus {
  WAITING = 'waiting',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
}

@Entity('attendance_tickets')
export class AttendanceTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** sessionId from the AI provider (Customer Service) */
  @Column({ type: 'varchar', length: 255 })
  csSessionId: string;

  /** WhatsApp JID (e.g., 5511999999999@c.us) */
  @Column({ type: 'varchar', length: 255 })
  chatId: string;

  /** Session ID from OpenWA that received the message */
  @Column({ type: 'varchar', length: 36 })
  sessionId: string;

  /** Customer phone number (extracted from chatId) */
  @Column({ type: 'varchar', length: 30 })
  customerPhone: string;

  /** Customer display name from WhatsApp */
  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string;

  /** Ticket priority derived from AI response */
  @Column({ type: 'varchar', length: 20, default: TicketPriority.MEDIA })
  priority: TicketPriority;

  /** Queue for routing */
  @Column({ type: 'varchar', length: 20, default: TicketQueue.CAB_GERAL })
  queue: TicketQueue;

  /** Current ticket status */
  @Column({ type: 'varchar', length: 20, default: TicketStatus.WAITING })
  status: TicketStatus;

  /** Username or ID of the assigned attendant */
  @Column({ type: 'varchar', length: 255, nullable: true })
  assignedTo: string | null;

  /** Preview of the last message from the customer */
  @Column({ type: 'text', nullable: true })
  lastMessage: string;

  /**
   * Full AI provider payload stored as JSON.
   * Contains customer data (clientId, clientName, cpf, etc.)
   */
  @Column({ type: 'simple-json', nullable: true })
  csPayload: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  resolvedAt: Date | null;
}