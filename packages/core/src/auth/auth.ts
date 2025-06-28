/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface OAuthTokens {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number;
}

interface ApiKey {
  type: 'api';
  key: string;
}

type AuthInfo = OAuthTokens | ApiKey;

/**
 * Auth storage system compatible with OpenCode
 */
export namespace Auth {
  function getAuthDir(): string {
    return path.join(os.homedir(), '.config', 'gemini-cli');
  }

  function getAuthPath(provider: string): string {
    return path.join(getAuthDir(), `${provider}-auth.json`);
  }

  export async function get(provider: string): Promise<AuthInfo | null> {
    try {
      const authPath = getAuthPath(provider);
      const data = await fs.readFile(authPath, 'utf-8');
      return JSON.parse(data) as AuthInfo;
    } catch (_error) {
      return null;
    }
  }

  export async function set(provider: string, info: AuthInfo): Promise<void> {
    try {
      const authPath = getAuthPath(provider);
      const authDir = path.dirname(authPath);
      await fs.mkdir(authDir, { recursive: true });
      await fs.writeFile(authPath, JSON.stringify(info, null, 2));
    } catch (_error) {
      throw new Error(`Failed to store authentication for ${provider}`);
    }
  }

  export async function all(): Promise<Record<string, AuthInfo>> {
    try {
      const authDir = getAuthDir();
      const files = await fs.readdir(authDir);
      const auths: Record<string, AuthInfo> = {};
      
      for (const file of files) {
        if (file.endsWith('-auth.json')) {
          const provider = file.replace('-auth.json', '');
          const info = await get(provider);
          if (info) {
            auths[provider] = info;
          }
        }
      }
      
      return auths;
    } catch (_error) {
      return {};
    }
  }

  export async function remove(provider: string): Promise<void> {
    try {
      const authPath = getAuthPath(provider);
      await fs.unlink(authPath);
    } catch (_error) {
      // Ignore errors if file doesn't exist
    }
  }
}