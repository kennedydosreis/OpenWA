import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { AiProviderConfig } from './entities/ai-provider-config.entity';
import { AiProviderConfigDto } from './dto/ai-provider-config.dto';
import { SessionManagerService } from './session-manager.service';
import { AttendanceService, CreateTicketInput } from '../attendance/attendance.service';
import { MessageService } from '../message/message.service';
import { EventsGateway } from '../events/events.gateway';

interface ChatCompletionResponse {
  /** Direct answer text if returned outside of choices */
  answer?: string;
  /** Structured payload from the customer-service backend */
  payload?: {
    sessionStatus?: string;
    clientId?: string;
    clientName?: string;
    cpf?: string;
    messageId?: string;
    priority?: string;
    fila?: string;
    [key: string]: unknown;
  };
  /** Standard OpenAI-compatible format (customer-service wraps extras inside message.customer_service) */
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string;
      /** Customer-service-specific extra fields */
      customer_service?: {
        payload?: {
          sessionStatus?: string;
          clientId?: string;
          clientName?: string;
          cpf?: string;
          messageId?: string;
          priority?: string;
          fila?: string;
          [key: string]: unknown;
        };
      };
      [key: string]: unknown;
    };
  }>;
  [key: string]: unknown;
}

@Injectable()
export class AiIntegrationService {
  private readonly logger = new Logger(AiIntegrationService.name);
  private readonly configRepo: Repository<AiProviderConfig>;

  constructor(
    @InjectDataSource('data')
    private readonly dataSource: DataSource,
    private readonly sessionManager: SessionManagerService,
    private readonly attendanceService: AttendanceService,
    private readonly messageService: MessageService,
    private readonly configService: ConfigService,
    private readonly eventsGateway: EventsGateway,
  ) {
    this.configRepo = this.dataSource.getRepository(AiProviderConfig);
  }

  // ── Config CRUD ──────────────────────────────────────────────────────

  async createConfig(sessionId: string, dto: AiProviderConfigDto): Promise<AiProviderConfig> {
    const existing = await this.configRepo.findOne({ where: { sessionId } });
    if (existing) {
      Object.assign(existing, dto);
      return this.configRepo.save(existing);
    }
    const config = this.configRepo.create({ ...dto, sessionId });
    return this.configRepo.save(config);
  }

  async getConfig(sessionId: string): Promise<AiProviderConfig | null> {
    return this.configRepo.findOne({ where: { sessionId } });
  }

  async deleteConfig(sessionId: string): Promise<void> {
    await this.configRepo.delete({ sessionId });
  }

  async getConfigById(id: string): Promise<AiProviderConfig | null> {
    return this.configRepo.findOne({ where: { id } });
  }

  async listConfigs(): Promise<AiProviderConfig[]> {
    return this.configRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ── Message Processing ───────────────────────────────────────────────

  async handleIncomingMessage(params: {
    sessionId: string;
    chatId: string;
    normalizedChatId: string;
    messageId: string;
    pushName: string;
    body: string;
    messageTimestamp: number;
  }): Promise<boolean> {
    const { sessionId, chatId, normalizedChatId, messageId, pushName, body } = params;

    const config = await this.getConfig(sessionId);
    if (!config || !config.enabled) {
      return false;
    }

    const cached = this.sessionManager.getByChatId(normalizedChatId);
    this.logger.debug(`handleIncomingMessage: cached=${cached ? 'HIT' : 'MISS'}, chatId=${normalizedChatId}`);

    if (cached?.humanAttendance) {
      await this.updateTicketLastMessage(cached.csSessionId, body);
      return true;
    }

    const csSessionId = cached?.csSessionId ?? uuidv4();
    this.logger.debug(`handleIncomingMessage: using csSessionId=${csSessionId} (${cached ? 'from cache' : 'new UUID'})`);

    try {
      const response = await this.callAiProvider(
        config,
        body,
        csSessionId,
        messageId,
        normalizedChatId,
        pushName,
      );

      // The customer-service backend returns a custom nested JSON shape:
      //   choices[0].message.content = "answer text"
      //   choices[0].message.customer_service.payload = { sessionStatus: "closed", clientId, ... }
      const msg = response?.choices?.[0]?.message;
      const csPayload = msg?.customer_service?.payload;

      const answer =
        response?.answer ??
        msg?.content ??
        '';

      const rawSessionStatus =
        csPayload?.sessionStatus ??
        response?.payload?.sessionStatus ??
        'open';
      const sessionStatus = String(rawSessionStatus).trim().toLowerCase();

      const needsHuman = sessionStatus === 'closed' || sessionStatus === 'transfer';

      this.logger.debug(
        `AI response parsed — answer="${answer.slice(0, 40)}...", sessionStatus=${sessionStatus}, needsHuman=${needsHuman}`,
      );

      if (answer) {
        await this.messageService.sendText(sessionId, { chatId, text: answer });
      }

      if (needsHuman) {
        this.logger.log(
          `Human handoff triggered — sessionStatus=${sessionStatus}, chatId=${normalizedChatId}, csSessionId=${csSessionId}`,
        );

        // Lock the session so future messages bypass AI and go to human
        this.sessionManager.lock(normalizedChatId);

        // Create attendance ticket with AI conversation context for the agent
        await this.attendanceService.createTicket({
          csSessionId,
          chatId,
          sessionId,
          customerPhone: normalizedChatId,
          customerName: csPayload?.clientName || pushName || undefined,
          priority: (csPayload?.priority ?? 'media') as 'baixa' | 'media' | 'alta' | 'urgente',
          queue: (csPayload?.fila ?? 'cab-geral') as 'emprestimo' | 'cab-geral',
          lastMessage: body.slice(0, 500),
          csPayload: {
            ...csPayload,
            aiResponse: answer,
            customerMessage: body,
            handoffReason: sessionStatus,
            handoffAt: new Date().toISOString(),
          },
        });

        return true;
      }

      // Normal AI flow — session stays open
      this.sessionManager.upsert({
        chatId: normalizedChatId,
        csSessionId,
        sessionStatus: 'open',
      });
      this.sessionManager.touch(normalizedChatId);

      return true;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`AI provider error for session ${sessionId}: ${errMsg}`);

      try {
        await this.messageService.sendText(sessionId, {
          chatId,
          text: 'Desculpe, estamos temporariamente indisponíveis. Um atendente entrará em contato em breve.',
        });
      } catch { /* best effort */ }

      const fallbackCsSessionId = cached?.csSessionId ?? uuidv4();
      this.sessionManager.lock(normalizedChatId);

      await this.attendanceService.createTicket({
        csSessionId: fallbackCsSessionId,
        chatId,
        sessionId,
        customerPhone: normalizedChatId,
        customerName: pushName || undefined,
        priority: 'alta',
        queue: 'cab-geral',
        lastMessage: body.slice(0, 500),
      });

      this.logger.log(`Error ticket created for session ${sessionId}`);

      return true;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async callAiProvider(
    config: AiProviderConfig,
    question: string,
    csSessionId: string,
    messageId: string,
    normalizedChatId: string,
    pushName: string,
  ): Promise<ChatCompletionResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(config.extraHeaders ?? {}),
    };

    // Build extra_body per the OpenAI SDK pattern used by the customer backend.
    // The OpenAI Python SDK merges extra_body fields at the ROOT level of the
    // JSON payload — NOT nested under an "extra_body" key.
    const extraBody: Record<string, unknown> = {
      sessionId: csSessionId,
      messageId: messageId || `${csSessionId}-${Date.now()}`,
      canal: config.canal ?? 'whatsapp',
      contatos: [
        {
          clientId: '',
          clientName: pushName || '',
          contato: normalizedChatId,
          cpf: '',
        },
      ],
      ...(config.extraBody ?? {}),
    };

    const body: Record<string, unknown> = {
      model: config.model,
      messages: [{ role: 'user', content: question }],
      stream: false,
      ...extraBody,   // MERGED at root level — matches OpenAI SDK behavior
    };

    const controller = new AbortController();
    const timeoutMs = Math.max(config.timeoutMs ?? 30000, 90000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`AI provider returned ${response.status}: ${text.slice(0, 200)}`);
      }

      const responseJson = (await response.json()) as ChatCompletionResponse;
      this.logger.debug(`callAiProvider raw response: ${JSON.stringify(responseJson).slice(0, 400)}`);
      return responseJson;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async updateTicketLastMessage(csSessionId: string, body: string): Promise<void> {
    try {
      await this.attendanceService.updateLastMessage(csSessionId, body);
    } catch (err: unknown) {
      this.logger.warn(`Failed to update ticket lastMessage: ${String(err)}`);
    }
  }
}