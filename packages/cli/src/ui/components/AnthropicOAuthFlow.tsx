/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { 
  startAnthropicOAuthFlow, 
  completeAnthropicOAuthWithCode 
} from '../../config/anthropicAuth.js';

interface AnthropicOAuthFlowProps {
  onComplete: () => void;
  onCancel: () => void;
}

enum OAuthState {
  STARTING = 'starting',
  WAITING_FOR_CODE = 'waiting_for_code',
  PROCESSING_CODE = 'processing_code',
  SUCCESS = 'success',
  ERROR = 'error'
}

export function AnthropicOAuthFlow({ onComplete, onCancel }: AnthropicOAuthFlowProps): React.JSX.Element {
  const [state, setState] = useState<OAuthState>(OAuthState.STARTING);
  const [message, setMessage] = useState<string>('');
  const [_oauthUrl, setOauthUrl] = useState<string>('');
  const [codeInput, setCodeInput] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // Use ref to maintain latest onComplete callback
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  
  // Component instance identifier for debugging
  const componentId = useRef(Math.random().toString(36).substr(2, 9));
  
  console.log(`🎭 [${componentId.current}] AnthropicOAuthFlow component rendered`);

  // Start OAuth flow on mount
  useEffect(() => {
    const currentComponentId = componentId.current; // Copy to variable for cleanup
    console.log(`🚀 [${currentComponentId}] useEffect triggered - starting OAuth initialization`);
    let mounted = true;
    
    const initOAuth = async () => {
      try {
        console.log(`📞 [${componentId.current}] Calling startAnthropicOAuthFlow...`);
        const result = await startAnthropicOAuthFlow();
        
        if (!mounted) {
          console.log(`💀 [${componentId.current}] Component unmounted, ignoring OAuth result`);
          return; // Component unmounted
        }
        
        console.log(`📦 [${componentId.current}] OAuth result received:`, { hasUrl: !!result.url });
        
        if (result.url) {
          console.log(`🔗 [${componentId.current}] Setting OAuth URL and waiting for code`);
          setOauthUrl(result.url);
          setMessage(result.message);
          setState(OAuthState.WAITING_FOR_CODE);
        } else {
          // Already authenticated
          console.log(`✅ [${componentId.current}] Already authenticated, completing flow`);
          setMessage(result.message);
          setState(OAuthState.SUCCESS);
          setTimeout(() => {
            if (mounted) {
              console.log(`🎯 [${componentId.current}] Calling onComplete callback`);
              onCompleteRef.current();
            }
          }, 1500);
        }
      } catch (err) {
        if (!mounted) {
          console.log(`💀 [${componentId.current}] Component unmounted, ignoring OAuth error`);
          return;
        }
        console.error(`❌ [${componentId.current}] OAuth initialization failed:`, err);
        setError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
        setState(OAuthState.ERROR);
      }
    };

    initOAuth();
    
    return () => {
      console.log(`🧹 [${currentComponentId}] Component cleanup - setting mounted=false`);
      mounted = false;
    };
  }, []); // Remove onComplete dependency to prevent re-triggering OAuth flow

  // Handle user input
  useInput((input, key) => {
    if (state === OAuthState.WAITING_FOR_CODE) {
      if (key.return) {
        // Submit the code
        handleCodeSubmit();
      } else if (key.backspace || key.delete) {
        // Remove last character
        setCodeInput(prev => prev.slice(0, -1));
      } else if (key.escape) {
        // Cancel
        onCancel();
      } else if (input && !key.ctrl && !key.meta) {
        // Add character to input
        setCodeInput(prev => prev + input);
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) {
      setError('Please enter the authorization code');
      return;
    }

    // Prevent multiple submissions
    if (state !== OAuthState.WAITING_FOR_CODE) {
      return;
    }

    setState(OAuthState.PROCESSING_CODE);
    setError('');
    
    // Clear any previous error state when starting new submission
    if (error) {
      setError('');
    }

    try {
      await completeAnthropicOAuthWithCode(codeInput.trim());
      setState(OAuthState.SUCCESS);
      setMessage('✅ Authentication completed successfully!');
      setTimeout(() => onCompleteRef.current(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete authentication');
      setCodeInput(''); // Clear the input on error to prevent looping
      setState(OAuthState.WAITING_FOR_CODE);
    }
  };

  const renderContent = () => {
    switch (state) {
      case OAuthState.STARTING:
        return (
          <Box flexDirection="column">
            <Text>🔐 Starting Anthropic OAuth authentication...</Text>
          </Box>
        );

      case OAuthState.WAITING_FOR_CODE:
        return (
          <Box flexDirection="column">
            <Text bold color={Colors.AccentBlue}>Anthropic OAuth Authentication</Text>
            <Box marginTop={1}>
              <Text>{message}</Text>
            </Box>
            
            <Box marginTop={1}>
              <Text bold>Enter authorization code:</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>💡 Tip: If pasting, press Ctrl+Shift+V or right-click → Paste</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={Colors.AccentGreen}>Code: {codeInput}</Text>
              <Text color={Colors.Gray}>_</Text>
            </Box>
            
            {error && (
              <Box marginTop={1}>
                <Text color={Colors.AccentRed}>Error: {error}</Text>
              </Box>
            )}
            
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                Press Enter to submit • Escape to cancel
              </Text>
            </Box>
          </Box>
        );

      case OAuthState.PROCESSING_CODE:
        return (
          <Box flexDirection="column">
            <Text>🔄 Processing authorization code...</Text>
          </Box>
        );

      case OAuthState.SUCCESS:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentGreen}>{message}</Text>
          </Box>
        );

      case OAuthState.ERROR:
        return (
          <Box flexDirection="column">
            <Text color={Colors.AccentRed}>Authentication failed: {error}</Text>
            <Box marginTop={1}>
              <Text color={Colors.Gray}>Press Escape to go back</Text>
            </Box>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {renderContent()}
    </Box>
  );
}