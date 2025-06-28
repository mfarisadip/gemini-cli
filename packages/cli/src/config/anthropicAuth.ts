/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { generatePKCE } from '@openauthjs/openauth/pkce';
import { storeTokens, getAnthropicAccessToken, hasValidAnthropicTokens } from '@google/gemini-cli-core';

const execAsync = promisify(exec);

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/**
 * Open URL in browser (cross-platform)
 */
async function openUrl(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "${url}"`;
      break;
    case 'linux':
      command = `xdg-open "${url}"`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  try {
    await execAsync(command);
  } catch (error) {
    console.warn('Failed to open browser automatically:', error);
    console.log(`Please open this URL manually: ${url}`);
  }
}

/**
 * Generate OAuth authorization URL with PKCE
 */
export async function generateAuthorizationUrl(): Promise<{ url: string; verifier: string }> {
  const pkce = await generatePKCE();
  const url = new URL("https://claude.ai/oauth/authorize");
  
  url.searchParams.set("code", "true");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", "https://console.anthropic.com/oauth/code/callback");
  url.searchParams.set("scope", "org:create_api_key user:profile user:inference");
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", pkce.verifier);

  return {
    url: url.toString(),
    verifier: pkce.verifier,
  };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string, verifier: string): Promise<void> {
  console.log('🔄 Exchanging authorization code for tokens...');
  
  // Parse authorization code - handle both formats:
  // 1. Just the code: "abc123"
  // 2. Full callback URL: "https://console.anthropic.com/oauth/code/callback?code=abc123&state=xyz"
  let authCode = code.trim();
  let receivedState = '';
  
  // Clean up terminal escape sequences that can occur during paste operations
  // Remove bracketed paste mode sequences like [200~ and trailing _
  const escChar = String.fromCharCode(27); // ESC character
  authCode = authCode
    .replace(/^\[200~/, '') // Remove start of bracketed paste mode
    .replace(/\[201~$/, '') // Remove end of bracketed paste mode  
    .replace(/_$/, '')      // Remove trailing underscore
    .replace(new RegExp(escChar + '\\[[0-9;]*[mGKHF]', 'g'), '') // Remove ANSI escape sequences
    .trim();
  
  console.log(`🧹 Cleaned authorization code: "${authCode}"`);
  
  if (authCode.includes('?code=')) {
    // Parse from full callback URL
    try {
      const url = new URL(authCode);
      authCode = url.searchParams.get('code') || '';
      receivedState = url.searchParams.get('state') || '';
    } catch (_error) {
      throw new Error('Invalid callback URL format');
    }
  } else if (authCode.includes('#')) {
    // Handle legacy format code#state
    const splits = authCode.split("#");
    authCode = splits[0];
    receivedState = splits[1] || '';
  }
  
  if (!authCode) {
    throw new Error('No authorization code found in input');
  }
  
  // Validate that the cleaned code looks reasonable
  if (authCode.length < 10) {
    throw new Error(`Authorization code seems too short: "${authCode}". Please check your input.`);
  }
  
  if (authCode.includes('[') || authCode.includes(escChar)) {
    console.warn('⚠️  Authorization code may still contain escape sequences. Please try pasting again.');
  }
  
  console.log(`📝 Parsed code: "${authCode}"`);
  console.log(`📝 Received state: "${receivedState || 'empty'}"`);
  console.log(`📝 Expected verifier: "${verifier}"`);
  
  // Note: In our implementation, state equals verifier (PKCE verifier used as state)
  // Use the received state if available, otherwise fall back to verifier
  // State is used for CSRF protection, verifier is used for PKCE
  
  const stateToUse = receivedState || verifier;
  
  const tokenRequest = {
    code: authCode,
    state: stateToUse, // Use actual received state or fallback to verifier
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    redirect_uri: "https://console.anthropic.com/oauth/code/callback",
    code_verifier: verifier,
  };
  
  const tokenRequestBody = JSON.stringify(tokenRequest);
  console.log('📤 Token request payload:', tokenRequestBody);
  
  const response = await fetch("https://console.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(tokenRequestBody).toString(),
    },
    body: tokenRequestBody,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error('❌ Token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      requestUrl: "https://console.anthropic.com/v1/oauth/token",
      requestHeaders: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(tokenRequestBody).toString(),
      },
      requestBody: tokenRequest
    });
    
    // Try to parse error response for more details
    try {
      const errorData = JSON.parse(errorText);
      console.error('📋 Parsed error response:', errorData);
    } catch {
      console.error('📋 Raw error response:', errorText);
    }
    
    throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const tokens = await response.json();
  
  await storeTokens({
    type: 'oauth',
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: Date.now() + tokens.expires_in * 1000,
  });
}

/**
 * Get valid access token (alias to shared function)
 */
export const getAccessToken = getAnthropicAccessToken;

/**
 * Check if user has valid OAuth tokens (alias to shared function)
 */
export const hasValidTokens = hasValidAnthropicTokens;

/**
 * Store OAuth session data temporarily
 */
let oauthSession: { verifier: string; url: string } | null = null;
let isOAuthInProgress = false;
let isCompletingOAuth = false;
let oauthLock = false; // Additional protection against race conditions

/**
 * Start OAuth flow and return session info for code input
 */
export async function startAnthropicOAuthFlow(): Promise<{ url: string; message: string }> {
  const callId = Math.random().toString(36).substr(2, 9);
  console.log(`🔐 [${callId}] Starting Anthropic Claude OAuth authentication...`);
  console.log(`🔍 [${callId}] Current state: isOAuthInProgress=${isOAuthInProgress}, isCompletingOAuth=${isCompletingOAuth}, oauthLock=${oauthLock}, hasSession=${!!oauthSession}`);
  
  // Double-lock protection against race conditions
  if (oauthLock) {
    console.log(`🔒 [${callId}] OAuth lock is active, waiting for current operation to complete...`);
    // Wait briefly and try again - this handles very fast successive calls
    await new Promise(resolve => setTimeout(resolve, 100));
    if (oauthSession) {
      console.log(`🔄 [${callId}] Returning existing session after lock wait`);
      return {
        url: oauthSession.url,
        message: '🔐 OAuth authentication already in progress!'
      };
    }
  }
  
  // Set lock immediately
  oauthLock = true;
  console.log(`🔒 [${callId}] OAuth lock acquired`);
  
  try {
    // Check if already authenticated
    if (await hasValidTokens()) {
      console.log(`✅ [${callId}] Already authenticated, skipping OAuth flow`);
      return {
        url: '',
        message: '✅ Already authenticated with Anthropic Claude'
      };
    }

    // Prevent multiple concurrent OAuth flows or during completion
    if ((isOAuthInProgress || isCompletingOAuth) && oauthSession) {
      console.log(`🔄 [${callId}] OAuth authentication already in progress, returning existing session...`);
      console.log(`📋 [${callId}] Existing session URL: ${oauthSession.url}`);
      return {
        url: oauthSession.url,
        message: `
🔐 OAuth authentication in progress!

📝 Steps to complete:
1. Complete authorization in your browser (if not done)
2. Copy the authorization code from the callback page
3. Paste the code when prompted

The callback page will show: "Paste this into Claude Code: [CODE]"
Note: You can paste either just the code or the full callback URL
`
      };
    }

    // Set OAuth in progress flag IMMEDIATELY to prevent race conditions
    console.log(`🔒 [${callId}] Setting OAuth in progress flag`);
    isOAuthInProgress = true;

    // Generate authorization URL
    console.log(`🔗 [${callId}] Generating new authorization URL...`);
    const { url, verifier } = await generateAuthorizationUrl();
    
    // Store session for later completion
    oauthSession = { verifier, url };
    console.log(`💾 [${callId}] Stored OAuth session with URL: ${url}`);
    
    console.log(`\n🌐 [${callId}] Opening browser for Anthropic OAuth authentication...`);
    
    // Open browser only once
    try {
      await openUrl(url);
      console.log(`✅ [${callId}] Browser opened successfully`);
    } catch (_error) {
      console.log(`⚠️  [${callId}] Failed to open browser, manual URL: ${url}`);
    }
    
    console.log(`🎯 [${callId}] OAuth flow setup complete, returning URL: ${url}`);
    
    return {
      url,
      message: `
🔐 OAuth authentication started!

📝 Steps to complete:
1. Authorize the application in your browser
2. Copy the authorization code from the callback page
3. Paste the code when prompted

The callback page will show: "Paste this into Claude Code: [CODE]"
Note: You can paste either just the code or the full callback URL
`
    };
  } finally {
    // Always release the lock
    oauthLock = false;
    console.log(`🔓 [${callId}] OAuth lock released`);
  }
}

/**
 * Complete OAuth flow with authorization code
 */
export async function completeAnthropicOAuthWithCode(code: string): Promise<void> {
  if (!oauthSession) {
    throw new Error('No active OAuth session. Please start the OAuth flow first.');
  }

  // Prevent multiple completion attempts
  if (isCompletingOAuth) {
    throw new Error('OAuth completion already in progress. Please wait...');
  }

  isCompletingOAuth = true;
  console.log('🔄 Completing OAuth authentication with authorization code...');

  try {
    await exchangeCodeForTokens(code, oauthSession.verifier);
    console.log('✅ Anthropic OAuth authentication completed successfully!');
    
    // Clear session and all progress flags
    oauthSession = null;
    isOAuthInProgress = false;
    isCompletingOAuth = false;
    oauthLock = false;
  } catch (error) {
    console.error('Failed to complete OAuth authentication:', error);
    // Clear all flags and session on error to allow fresh restart
    isCompletingOAuth = false;
    isOAuthInProgress = false;
    oauthSession = null;
    oauthLock = false;
    throw error;
  }
}


/**
 * Clear OAuth session
 */
export function clearOAuthSession(): void {
  console.log('🧹 Clearing OAuth session...');
  oauthSession = null;
  isOAuthInProgress = false;
  isCompletingOAuth = false;
  oauthLock = false;
}

