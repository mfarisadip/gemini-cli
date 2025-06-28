/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface AnthropicPrivacyNoticeProps {
  onExit: () => void;
}

export const AnthropicPrivacyNotice = ({
  onExit,
}: AnthropicPrivacyNoticeProps) => {
  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        Anthropic Claude API Notice
      </Text>
      <Newline />
      <Text>
        By using the Anthropic Claude API
        <Text color={Colors.AccentBlue}>[1]</Text>, you are agreeing to
        Anthropic&apos;s Terms of Service
        <Text color={Colors.AccentGreen}>[2]</Text> and Privacy Policy
        <Text color={Colors.AccentRed}>[3]</Text>.
      </Text>
      <Newline />
      <Text>
        Please note that when using Anthropic Claude, your data is processed by
        Anthropic&apos;s services according to their privacy policy. This is a
        third-party service not operated by Google.
      </Text>
      <Newline />
      <Text>
        <Text color={Colors.AccentBlue}>[1]</Text>{' '}
        https://docs.anthropic.com/claude/reference/getting-started-with-the-api
      </Text>
      <Text>
        <Text color={Colors.AccentGreen}>[2]</Text>{' '}
        https://www.anthropic.com/terms
      </Text>
      <Text>
        <Text color={Colors.AccentRed}>[3]</Text>{' '}
        https://www.anthropic.com/privacy
      </Text>
      <Newline />
      <Text color={Colors.Gray}>Press Esc to exit.</Text>
    </Box>
  );
};
