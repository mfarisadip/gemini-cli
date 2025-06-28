/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters as GenerateContentRequest,
  GenerateContentResponse,
  CountTokensParameters as CountTokensRequest,
  CountTokensResponse,
  EmbedContentParameters as EmbedContentRequest,
  EmbedContentResponse,
  FinishReason,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
import { getAnthropicAccessToken } from '../auth/anthropic.js';

/**
 * Anthropic API configuration
 */
export interface AnthropicConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

/**
 * Anthropic API response format
 */
interface AnthropicResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  id: string;
  model: string;
  role: string;
  stop_reason: string;
  stop_sequence: null;
  type: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Content generator implementation for Anthropic Claude
 */
export class AnthropicContentGenerator implements ContentGenerator {
  private config: AnthropicConfig;
  private baseUrl: string;

  constructor(config: AnthropicConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
  }

  /**
   * Generate content using Anthropic Claude API
   */
  async generateContent(
    request: GenerateContentRequest,
  ): Promise<GenerateContentResponse> {
    try {
      // Get authentication details
      const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
      const oauthToken = await getAnthropicAccessToken();

      // Check authentication options
      if (!apiKey && !oauthToken) {
        throw new Error(
          'No Anthropic authentication found. Please authenticate using OAuth or set ANTHROPIC_API_KEY environment variable.',
        );
      }

      // Convert Gemini format to Anthropic format
      const anthropicRequest = this.convertToAnthropicFormat(request);

      // Prepare headers based on authentication type
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      };

      if (oauthToken) {
        headers['Authorization'] = `Bearer ${oauthToken}`;
        headers['anthropic-beta'] = 'oauth-2025-04-20';
        console.debug('Using OAuth authentication for Anthropic');
      } else if (apiKey) {
        headers['x-api-key'] = apiKey;
        console.debug('Using API key authentication for Anthropic');
      }

      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(anthropicRequest),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(
          `Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const anthropicResponse: AnthropicResponse = await response.json();

      // Convert Anthropic response to Gemini format
      return this.convertToGeminiFormat(anthropicResponse);
    } catch (error) {
      throw new Error(`Failed to generate content with Anthropic: ${error}`);
    }
  }

  /**
   * Generate content stream using Anthropic Claude API
   */
  async generateContentStream(
    request: GenerateContentRequest,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.streamGenerator(request);
  }

  /**
   * Internal generator function for streaming content
   */
  private async *streamGenerator(
    request: GenerateContentRequest,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      // Get authentication details
      const apiKey = this.config.apiKey || process.env.ANTHROPIC_API_KEY;
      const oauthToken = await getAnthropicAccessToken();

      // Check authentication options
      if (!apiKey && !oauthToken) {
        throw new Error(
          'No Anthropic authentication found. Please authenticate using OAuth or set ANTHROPIC_API_KEY environment variable.',
        );
      }

      // Convert Gemini format to Anthropic format
      const anthropicRequest = {
        ...this.convertToAnthropicFormat(request),
        stream: true,
      };

      // Prepare headers based on authentication type
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      };

      if (oauthToken) {
        headers['Authorization'] = `Bearer ${oauthToken}`;
        headers['anthropic-beta'] = 'oauth-2025-04-20';
        console.debug('Using OAuth authentication for Anthropic');
      } else if (apiKey) {
        headers['x-api-key'] = apiKey;
        console.debug('Using API key authentication for Anthropic');
      }

      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(anthropicRequest),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(
          `Anthropic API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error('No response body received from Anthropic API');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim() === '') continue;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'message_start') {
                  totalInputTokens = parsed.message?.usage?.input_tokens || 0;
                } else if (parsed.type === 'content_block_delta') {
                  const text = parsed.delta?.text || '';
                  if (text) {
                    yield this.createStreamResponse(
                      text,
                      totalInputTokens,
                      totalOutputTokens,
                    );
                  }
                } else if (parsed.type === 'message_delta') {
                  totalOutputTokens = parsed.usage?.output_tokens || 0;
                } else if (parsed.type === 'message_stop') {
                  // Final message with complete usage stats
                  return;
                }
              } catch (parseError) {
                console.warn('Failed to parse streaming data:', parseError);
                continue;
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      throw new Error(
        `Failed to generate streaming content with Anthropic: ${error}`,
      );
    }
  }

  /**
   * Count tokens (simplified implementation)
   */
  async countTokens(request: CountTokensRequest): Promise<CountTokensResponse> {
    // Anthropic doesn't have a direct token counting API
    // This is a rough estimation based on character count
    const content = JSON.stringify(request.contents);
    const estimatedTokens = Math.ceil(content.length / 4); // Rough estimation

    return {
      totalTokens: estimatedTokens,
    };
  }

  /**
   * Embed content (not supported by Anthropic)
   */
  async embedContent(
    _request: EmbedContentRequest,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embedding is not supported by Anthropic Claude');
  }

  /**
   * Convert Gemini request format to Anthropic format
   */
  private convertToAnthropicFormat(request: GenerateContentRequest): {
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
    temperature: number;
  } {
    const messages = [];

    if (request.contents) {
      // Handle different content formats
      const contentArray = Array.isArray(request.contents)
        ? request.contents
        : [request.contents];

      for (const content of contentArray) {
        if (typeof content === 'string') {
          messages.push({
            role: 'user',
            content,
          });
        } else if (Array.isArray(content)) {
          // Handle Part[] format
          const text = content
            .filter((part) => 'text' in part)
            .map((part) => (part as { text: string }).text)
            .join('');
          if (text) {
            messages.push({
              role: 'user',
              content: text,
            });
          }
        } else if (
          content &&
          typeof content === 'object' &&
          'parts' in content
        ) {
          // Handle Content format
          const parts = Array.isArray(content.parts)
            ? content.parts
            : [content.parts];
          for (const part of parts) {
            if (part && 'text' in part && part.text) {
              messages.push({
                role: content.role === 'model' ? 'assistant' : 'user',
                content: part.text,
              });
            }
          }
        }
      }
    }

    return {
      model: this.config.model,
      max_tokens: request.config?.maxOutputTokens || 4096,
      messages,
      temperature: request.config?.temperature || 0.7,
    };
  }

  /**
   * Convert Anthropic response to Gemini format
   */
  private convertToGeminiFormat(
    response: AnthropicResponse,
  ): GenerateContentResponse {
    const text = response.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('');

    return {
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: 'model',
          },
          finishReason: this.mapFinishReason(response.stop_reason),
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: response.usage.input_tokens,
        candidatesTokenCount: response.usage.output_tokens,
        totalTokenCount:
          response.usage.input_tokens + response.usage.output_tokens,
      },
      // Additional properties required by GenerateContentResponse
      text,
      data: undefined,
      functionCalls: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as GenerateContentResponse;
  }

  /**
   * Map Anthropic finish reason to Gemini format
   */
  private mapFinishReason(stopReason: string): FinishReason {
    switch (stopReason) {
      case 'end_turn':
        return 'STOP' as FinishReason;
      case 'max_tokens':
        return 'MAX_TOKENS' as FinishReason;
      case 'stop_sequence':
        return 'STOP' as FinishReason;
      default:
        return 'OTHER' as FinishReason;
    }
  }

  /**
   * Create a streaming response chunk in Gemini format
   */
  private createStreamResponse(
    text: string,
    inputTokens: number,
    outputTokens: number,
  ): GenerateContentResponse {
    return {
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: 'model',
          },
          finishReason: undefined, // Not finished yet
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: inputTokens,
        candidatesTokenCount: outputTokens,
        totalTokenCount: inputTokens + outputTokens,
      },
      // Additional properties required by GenerateContentResponse
      text,
      data: undefined,
      functionCalls: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as GenerateContentResponse;
  }
}

/**
 * Create an Anthropic content generator
 */
export function createAnthropicContentGenerator(
  config: AnthropicConfig,
): ContentGenerator {
  return new AnthropicContentGenerator(config);
}
