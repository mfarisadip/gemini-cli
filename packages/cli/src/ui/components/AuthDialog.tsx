/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { AuthType } from '@google/gemini-cli-core';
import { validateAuthMethodAsync } from '../../config/auth.js';
import { AnthropicOAuthFlow } from './AnthropicOAuthFlow.js';
import { clearOAuthSession } from '../../config/anthropicAuth.js';


interface AuthDialogProps {
  onSelect: (authMethod: string | undefined, scope: SettingScope) => void;
  onHighlight: (authMethod: string | undefined) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

export function AuthDialog({
  onSelect,
  onHighlight,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [showAnthropicOAuth, setShowAnthropicOAuth] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const items = [
    {
      label: 'Login with Google',
      value: AuthType.LOGIN_WITH_GOOGLE_PERSONAL,
    },
    { label: 'Gemini API Key (AI Studio)', value: AuthType.USE_GEMINI },
    { label: 'Vertex AI', value: AuthType.USE_VERTEX_AI },
    { label: 'Anthropic Claude', value: AuthType.USE_ANTHROPIC_CLAUDE },
  ];

  let initialAuthIndex = items.findIndex(
    (item) => item.value === settings.merged.selectedAuthType,
  );

  if (initialAuthIndex === -1) {
    initialAuthIndex = 0;
  }

  const handleAuthSelect = async (authMethod: string) => {
    console.log(`🎯 AuthDialog: handleAuthSelect called with authMethod=${authMethod}`);
    
    // Prevent multiple OAuth triggers
    if (isProcessing || showAnthropicOAuth) {
      console.log(`🚫 AuthDialog: Blocked auth select - isProcessing=${isProcessing}, showAnthropicOAuth=${showAnthropicOAuth}`);
      return;
    }

    // Handle Anthropic OAuth flow
    if (authMethod === AuthType.USE_ANTHROPIC_CLAUDE) {
      console.log(`🔐 AuthDialog: Handling Anthropic Claude authentication`);
      setIsProcessing(true);
      setErrorMessage(null);
      
      // Check if already authenticated first
      console.log(`🔍 AuthDialog: Validating auth method...`);
      const error = await validateAuthMethodAsync(authMethod);
      if (!error) {
        // Already authenticated, proceed
        console.log(`✅ AuthDialog: Already authenticated, proceeding`);
        setIsProcessing(false);
        onSelect(authMethod, SettingScope.User);
        return;
      }
      
      if (error === 'anthropic_oauth_required') {
        // Start OAuth flow
        console.log(`🚀 AuthDialog: OAuth required, showing AnthropicOAuthFlow component`);
        setShowAnthropicOAuth(true);
        setIsProcessing(false);
      } else {
        // Other error
        console.log(`❌ AuthDialog: Auth validation error:`, error);
        setErrorMessage(error);
        setIsProcessing(false);
      }
      return;
    }

    // Handle other auth methods
    setIsProcessing(true);
    const error = await validateAuthMethodAsync(authMethod);
    if (error) {
      setErrorMessage(error);
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
    setIsProcessing(false);
  };

  const handleOAuthComplete = () => {
    setShowAnthropicOAuth(false);
    setErrorMessage(null);
    onSelect(AuthType.USE_ANTHROPIC_CLAUDE, SettingScope.User);
  };

  const handleOAuthCancel = () => {
    clearOAuthSession(); // Clear the OAuth session
    setShowAnthropicOAuth(false);
    setErrorMessage(null);
    setIsProcessing(false);
  };

  useInput((_input, key) => {
    if (key.escape) {
      if (settings.merged.selectedAuthType === undefined) {
        // Prevent exiting if no auth method is set
        setErrorMessage(
          'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
        );
        return;
      }
      onSelect(undefined, SettingScope.User);
    }
  });

  // Show OAuth flow if needed
  if (showAnthropicOAuth) {
    console.log(`🎭 AuthDialog: Rendering AnthropicOAuthFlow component`);
    return (
      <AnthropicOAuthFlow
        onComplete={handleOAuthComplete}
        onCancel={handleOAuthCancel}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Auth Method</Text>
      <RadioButtonSelect
        items={items}
        initialIndex={initialAuthIndex}
        onSelect={handleAuthSelect}
        onHighlight={onHighlight}
        isFocused={true}
      />
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.Gray}>(Use Enter to select)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Gemini CLI</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {
            'https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md'
          }
        </Text>
      </Box>
    </Box>
  );
}
