import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class AiProviderConfigDto {
  @ApiProperty({ description: 'Display name' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Base URL (e.g. https://api.openai.com). /v1/chat/completions is appended automatically.',
  })
  @IsString()
  baseUrl: string;

  @ApiProperty({ description: 'API key / Bearer token' })
  @IsString()
  apiKey: string;

  @ApiProperty({ description: 'Model name to send in the request', example: 'gpt-4o' })
  @IsString()
  model: string;

  @ApiProperty({ description: 'Whether this integration is active', default: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Extra HTTP headers (JSON object)' })
  @IsOptional()
  extraHeaders?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Extra body fields merged into the request (JSON)' })
  @IsOptional()
  extraBody?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Canal/queue identifier for the backend (e.g. conta-bemol, whatsapp)', default: 'whatsapp' })
  @IsOptional()
  @IsString()
  canal?: string;

  @ApiPropertyOptional({ description: 'HTTP timeout in ms', default: 30000 })
  @IsOptional()
  @IsNumber()
  timeoutMs?: number;
}