import {
  Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AiIntegrationService } from './ai-integration.service';
import { AiProviderConfigDto } from './dto/ai-provider-config.dto';
import { SessionService } from '../session/session.service';

@ApiTags('AI Integration')
@Controller('ai-integration')
export class AiIntegrationController {
  private readonly logger = new Logger(AiIntegrationController.name);

  constructor(
    private readonly aiService: AiIntegrationService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Resolve session identifier (name or UUID) to UUID.
   */
  private async resolveSessionId(sessionId: string): Promise<string> {
    // If it looks like a UUID, try direct lookup first
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      try {
        const session = await this.sessionService.findOne(sessionId);
        return session.id;
      } catch {
        // Not a valid UUID in DB, fall through to name lookup
      }
    }
    // Try resolving by name
    try {
      const session = await this.sessionService.findByName(sessionId);
      return session.id;
    } catch {
      // If name lookup also fails, return original and let downstream handle the error
      return sessionId;
    }
  }

  @Get('configs')
  @ApiOperation({ summary: 'List all AI provider configurations' })
  @ApiResponse({ status: 200, description: 'List of configurations' })
  async listConfigs() {
    return this.aiService.listConfigs();
  }

  @Get(':sessionId/config')
  @ApiOperation({ summary: 'Get AI provider config for a session' })
  @ApiParam({ name: 'sessionId', description: 'OpenWA session ID or name' })
  @ApiResponse({ status: 200, description: 'Config found' })
  @ApiResponse({ status: 404, description: 'No config for this session' })
  async getConfig(@Param('sessionId') sessionId: string) {
    const resolvedId = await this.resolveSessionId(sessionId);
    const config = await this.aiService.getConfig(resolvedId);
    if (!config) {
      return null; // Frontend shows "not configured"
    }
    return config;
  }

  @Put(':sessionId/config')
  @ApiOperation({ summary: 'Create or update AI provider config for a session' })
  @ApiParam({ name: 'sessionId', description: 'OpenWA session ID or name' })
  @ApiBody({ type: AiProviderConfigDto })
  async upsertConfig(
    @Param('sessionId') sessionId: string,
    @Body() dto: AiProviderConfigDto,
  ) {
    const resolvedId = await this.resolveSessionId(sessionId);
    const config = await this.aiService.createConfig(resolvedId, dto);
    this.logger.log(`AI config saved for session ${sessionId} (resolved: ${resolvedId})`);
    return config;
  }

  @Delete(':sessionId/config')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove AI provider config for a session' })
  @ApiParam({ name: 'sessionId', description: 'OpenWA session ID or name' })
  async deleteConfig(@Param('sessionId') sessionId: string) {
    const resolvedId = await this.resolveSessionId(sessionId);
    await this.aiService.deleteConfig(resolvedId);
    this.logger.log(`AI config removed for session ${sessionId} (resolved: ${resolvedId})`);
  }

  @Post(':sessionId/test')
  @ApiOperation({ summary: 'Test the AI provider connection with a ping message' })
  @ApiParam({ name: 'sessionId', description: 'OpenWA session ID or name' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async testConnection(@Param('sessionId') sessionId: string) {
    const resolvedId = await this.resolveSessionId(sessionId);
    const config = await this.aiService.getConfig(resolvedId);
    if (!config) {
      return { success: false, error: 'No AI provider configured for this session' };
    }

    try {
      const start = Date.now();

      const body: Record<string, unknown> = {
        model: config.model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
      };

      const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs || 15000),
      });

      const elapsed = Date.now() - start;
      const json = await response.json().catch(() => null);

      return {
        success: response.ok,
        statusCode: response.status,
        elapsedMs: elapsed,
        hasContent: !!(json?.choices?.[0]?.message?.content),
        contentPreview: String(json?.choices?.[0]?.message?.content ?? '').slice(0, 200),
        errorBody: response.ok ? undefined : JSON.stringify(json).slice(0, 500),
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}