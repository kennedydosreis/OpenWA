import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HookManager } from '../../core/hooks';
import { AiIntegrationService } from '../../modules/ai-integration/ai-integration.service';
import { MessageService } from '../../modules/message/message.service';
import type { HookContext, HookHandler } from '../../core/hooks/hook.interfaces';

export interface MessageReceivedData {
  id?: string;
  from?: string;
  to?: string;
  chatId?: string;
  body?: string;
  type?: string;
  timestamp?: number;
  fromMe?: boolean;
  isGroup?: boolean;
  media?: {
    mimetype: string;
    filename?: string;
    data?: string;
  };
  quotedMessage?: {
    id: string;
    body: string;
  };
  pushName?: string;
  [key: string]: unknown;
}

/**
 * Plugin that hooks into `message:received` to route messages through the AI.
 *
 * Registers at priority 100 (late — after built-in hooks but before webhooks).
 * When it returns { continue: false }, webhooks are blocked — this is used
 * for human-attendance mode (attendant sends messages directly, AI is bypassed).
 */
@Injectable()
export class AiIntegrationPlugin implements OnModuleInit {
  private readonly logger = new Logger(AiIntegrationPlugin.name);

  constructor(
    private readonly hookManager: HookManager,
    private readonly aiService: AiIntegrationService,
    private readonly messageService: MessageService,
  ) {}

  async onModuleInit(): Promise<void> {
    const handler = async (ctx: HookContext<MessageReceivedData>) => {
      const data = ctx.data;

      this.logger.debug(
        `[AI Plugin] message:received hook fired — sessionId=${ctx.sessionId}, fromMe=${data.fromMe}, chatId=${data.chatId ?? data.from}`,
      );

      // Ignore outgoing messages
      if (data.fromMe) {
        this.logger.debug('[AI Plugin] Skipping — message is fromMe');
        return { continue: true };
      }

      const chatId = data.chatId ?? data.from ?? '';
      if (!chatId) {
        this.logger.warn('[AI Plugin] Skipping — no chatId or from');
        return { continue: true };
      }

      // Normalize chat key — strip domain suffix (@lid, @c.us, @g.us) so the
      // same contact always maps to one cached session regardless of how
      // WhatsApp Web represents the JID on each message.
      const normalizedChatId = chatId.split('@')[0] ?? chatId;

      // Extract text (body from whatsapp-web.js; fallback to media caption)
      let text = data.body ?? '';
      if (!text.trim() && data.media) {
        text = data.media.filename ?? '';
      }

      // Skip if no text
      if (!text.trim()) {
        this.logger.debug('[AI Plugin] Skipping — empty text');
        return { continue: true };
      }

      const pushName = data.pushName ?? '';
      const timestamp = data.timestamp ?? Math.floor(Date.now() / 1000);

      const sessionId = ctx.sessionId;
      if (!sessionId) {
        this.logger.warn('[AI Plugin] Skipping — no sessionId in context');
        return { continue: true };
      }

      try {
        this.logger.debug(
          `[AI Plugin] Calling AI service — sessionId=${sessionId}, chatId=${chatId}, normalizedChatId=${normalizedChatId}, body="${text.slice(0, 60)}"`,
        );

        // Persist incoming message so the attendant can see full conversation history
        await this.messageService.saveIncomingMessage(sessionId, {
          chatId,
          from: chatId,
          to: data.to ?? 'me',
          body: text,
          type: data.type ?? 'text',
          timestamp: timestamp,
          waMessageId: data.id,
        });

        const handled = await this.aiService.handleIncomingMessage({
          sessionId,
          chatId,
          normalizedChatId,
          messageId: data.id ?? '',
          pushName,
          body: text,
          messageTimestamp: timestamp,
        });
        this.logger.debug(`[AI Plugin] AI handled=${handled} — sessionId=${sessionId}`);
        return { continue: !handled };
      } catch (error: unknown) {
        this.logger.error(
          `[AI Plugin] Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return { continue: true };
      }
    };

    this.hookManager.register('ai-integration', 'message:received', handler as HookHandler, 100);

    this.logger.log('Registered ai-integration plugin — listening for message:received');
  }
}
