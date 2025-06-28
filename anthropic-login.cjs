#!/usr/bin/env node

/**
 * Anthropic OAuth Login Tool
 *
 * This script helps you authenticate with Anthropic using OAuth flow:
 * 1. Opens the TOKEN_URL for authentication
 * 2. Gets the callback code from user input
 * 3. Exchanges the code for access token
 * 4. Saves the credentials for use with the CLI
 */

const { createInterface } = require('readline');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');
const https = require('https');

// Anthropic OAuth Configuration
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTHORIZATION_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPES = 'org:create_api_key user:profile user:inference';

// Credential storage
const ANTHROPIC_DIR = '.anthropic';
const CREDENTIAL_FILENAME = 'auth_creds.json';

/**
 * Generate a random string for PKCE code verifier
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Generate a random state parameter
 */
function generateState() {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Get the path to store credentials
 */
function getCredentialPath() {
  return path.join(os.homedir(), ANTHROPIC_DIR, CREDENTIAL_FILENAME);
}

/**
 * Save credentials to file
 */
async function saveCredentials(credentials) {
  const filePath = getCredentialPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(credentials, null, 2));
}

/**
 * Open URL in default browser
 */
function openBrowser(url) {
  const platform = process.platform;
  let command;

  if (platform === 'darwin') {
    command = 'open';
  } else if (platform === 'win32') {
    command = 'start';
  } else {
    command = 'xdg-open';
  }

  spawn(command, [url], { detached: true, stdio: 'ignore' });
}

/**
 * Make HTTPS request
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Main authentication flow
 */
async function main() {
  console.log('🔐 Anthropic OAuth Authentication Tool');
  console.log('=====================================\n');

  try {
    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Build authorization URL
    const authUrl = new URL(AUTHORIZATION_URL);
    authUrl.searchParams.set('code', 'true');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    console.log('🌐 Opening browser for authentication...');
    console.log('📋 Authorization URL:', authUrl.toString());
    console.log();

    // Open browser
    try {
      openBrowser(authUrl.toString());
    } catch (error) {
      console.log(
        '⚠️  Could not open browser automatically. Please copy the URL above.',
      );
    }

    // Create readline interface
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log(
        'After authorizing in your browser, you will be redirected to a callback URL.',
      );
      console.log('The callback URL will look like:');
      console.log(
        'https://console.anthropic.com/oauth/code/callback?code=AUTH_CODE&state=STATE',
      );
      console.log();

      const input = await new Promise((resolve) => {
        rl.question(
          'Enter the authorization code or full callback URL: ',
          resolve,
        );
      });

      if (!input.trim()) {
        console.log('❌ No input provided. Exiting.');
        return;
      }

      // Parse the authorization code
      let authCode = input.trim();
      let returnedState = '';

      if (authCode.includes('?code=')) {
        const url = new URL(authCode);
        authCode = url.searchParams.get('code') || '';
        returnedState = url.searchParams.get('state') || '';
      }

      if (!authCode) {
        console.log('❌ No authorization code found in input.');
        return;
      }

      // Verify state if provided
      if (returnedState && returnedState !== state) {
        console.log('❌ Invalid state parameter - possible CSRF attack');
        return;
      }

      console.log('🔄 Exchanging authorization code for access token...');

      // Prepare token exchange request
      const tokenData = JSON.stringify({
        code: authCode,
        state: state,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      });

      // Exchange code for token
      const response = await makeRequest(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(tokenData),
        },
        body: tokenData,
      });

      if (response.status !== 200) {
        console.log(`❌ Token exchange failed: ${response.status}`);
        console.log('Error details:', response.data);
        return;
      }

      const tokenResponse = JSON.parse(response.data);

      // Save credentials
      const credentials = {
        type: 'oauth',
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      };

      await saveCredentials(credentials);

      console.log('✅ Successfully authenticated with Anthropic!');
      console.log('🎉 Credentials saved to:', getCredentialPath());
      console.log();
      console.log('You can now use Anthropic Claude in the Gemini CLI.');
      console.log();
      console.log('💡 Important Notes:');
      console.log(
        '- If you still get "ANTHROPIC_API_KEY required" errors, this means',
      );
      console.log('  the CLI requires direct API access instead of OAuth.');
      console.log(
        '- To get an API key, visit: https://console.anthropic.com/settings/keys',
      );
      console.log('- Set it as: export ANTHROPIC_API_KEY=your_api_key_here');
    } finally {
      rl.close();
    }
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);
