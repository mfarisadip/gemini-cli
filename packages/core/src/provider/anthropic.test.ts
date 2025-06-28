/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from 'vitest';
import { createAnthropicContentGenerator } from './anthropic.js';
import type {
  GenerateContentParameters as GenerateContentRequest,
  CountTokensParameters as CountTokensRequest,
} from '@google/genai';

// Mock fetch
global.fetch = vi.fn();

describe('AnthropicContentGenerator', () => {
  let generator: ReturnType<typeof createAnthropicContentGenerator>;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = createAnthropicContentGenerator({
      apiKey: 'test-api-key',
      model: 'claude-sonnet-4-20250514',
    });
  });

  describe('generateContent', () => {
    it('should generate content successfully', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'Hello! This is a test response from Claude.',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 15,
        },
      };

      (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const request: GenerateContentRequest = {
        model: 'claude-sonnet-4-20250514',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, Claude!' }],
          },
        ],
      };

      const result = await generator.generateContent(request);

      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(
        'Hello! This is a test response from Claude.',
      );
      expect(result.usageMetadata?.promptTokenCount).toBe(10);
      expect(result.usageMetadata?.candidatesTokenCount).toBe(15);
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
        new Response('Invalid API key', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      const request: GenerateContentRequest = {
        model: 'claude-sonnet-4-20250514',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, Claude!' }],
          },
        ],
      };

      await expect(generator.generateContent(request)).rejects.toThrow(
        'Anthropic API error: 401 Unauthorized',
      );
    });

    it('should convert Gemini format to Anthropic format correctly with API Key', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'Converted response',
          },
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 8,
        },
      };

      (global.fetch as MockedFunction<typeof fetch>).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const request: GenerateContentRequest = {
        model: 'claude-sonnet-4-20250514',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Test message' }],
          },
        ],
        config: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      };

      await generator.generateContent(request);

      // Verify the fetch was called with correct Anthropic format and API Key header
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
          }),
          body: expect.stringContaining(
            '"messages":[{"role":"user","content":"Test message"}]',
          ),
        }),
      );
    });
  });

  describe('countTokens', () => {
    it('should return estimated token count', async () => {
      const request: CountTokensRequest = {
        model: 'claude-sonnet-4-20250514',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, how are you?' }],
          },
        ],
      };

      const result = await generator.countTokens(request);

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(typeof result.totalTokens).toBe('number');
    });
  });

  describe('createAnthropicContentGenerator', () => {
    it('should create generator with default model', () => {
      const gen = createAnthropicContentGenerator({ model: 'claude-sonnet-4-20250514' });
      expect(gen).toBeInstanceOf(Object);
      expect(gen.generateContent).toBeDefined();
      expect(gen.countTokens).toBeDefined();
    });

    it('should create generator with custom model', () => {
      const gen = createAnthropicContentGenerator({
        model: 'claude-3-opus-20240229',
      });
      expect(gen).toBeInstanceOf(Object);
      expect(gen.generateContent).toBeDefined();
      expect(gen.countTokens).toBeDefined();
    });
  });
});
