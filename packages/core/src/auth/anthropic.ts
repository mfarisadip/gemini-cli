/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

interface OAuthTokens {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number;
}

/**
 * Get the path to the auth storage file
 */
function getAuthStoragePath(): string {
  const configDir = path.join(os.homedir(), '.config', 'gemini-cli');
  return path.join(configDir, 'anthropic-auth.json');
}

/**
 * Get stored OAuth tokens
 */
async function getStoredTokens(): Promise<OAuthTokens | null> {
  const authPath = getAuthStoragePath();
  
  try {
    const data = await fs.readFile(authPath, 'utf-8');
    const tokens = JSON.parse(data) as OAuthTokens;
    return tokens;
  } catch (_error) {
    return null;
  }
}

/**
 * Store OAuth tokens securely
 */
export async function storeTokens(tokens: OAuthTokens): Promise<void> {
  const authPath = getAuthStoragePath();
  const configDir = path.dirname(authPath);
  
  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(authPath, JSON.stringify(tokens, null, 2));
  } catch (_error) {
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getAnthropicAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens || tokens.type !== 'oauth') return null;

  // Return existing token if still valid
  if (tokens.access && tokens.expires > Date.now()) {
    return tokens.access;
  }

  // Refresh the token
  try {
    const response = await fetch("https://console.anthropic.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const newTokens = await response.json();
    
    await storeTokens({
      type: 'oauth',
      access: newTokens.access_token,
      refresh: newTokens.refresh_token,
      expires: Date.now() + newTokens.expires_in * 1000,
    });

    return newTokens.access_token;
  } catch (_error) {
    return null;
  }
}

/**
 * Check if user has valid OAuth tokens
 */
export async function hasValidAnthropicTokens(): Promise<boolean> {
  const token = await getAnthropicAccessToken();
  return !!token;
}