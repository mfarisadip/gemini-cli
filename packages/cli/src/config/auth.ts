/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, hasValidAnthropicTokens } from '@google/gemini-cli-core';
import { loadEnvironment } from './config.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (authMethod === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return 'GEMINI_API_KEY environment variable not found. Add that to your .env and try again, no reload needed!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        'Must specify GOOGLE_GENAI_USE_VERTEXAI=true and either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your .env and try again, no reload needed!'
      );
    }
    return null;
  }

  if (authMethod === AuthType.USE_ANTHROPIC_CLAUDE) {
    // Check if API key is available as fallback
    if (process.env.ANTHROPIC_API_KEY) {
      return null;
    }
    // Always require OAuth for Anthropic Claude authentication
    return 'anthropic_oauth_required';
  }

  return 'Invalid auth method selected.';
};

export const validateAuthMethodAsync = async (
  authMethod: string,
): Promise<string | null> => {
  // For Anthropic, check OAuth tokens first
  if (authMethod === AuthType.USE_ANTHROPIC_CLAUDE) {
    const hasTokens = await hasValidAnthropicTokens();
    if (hasTokens) {
      return null; // Valid OAuth authentication
    }
    return 'anthropic_oauth_required';
  }
  
  return validateAuthMethod(authMethod);
};
