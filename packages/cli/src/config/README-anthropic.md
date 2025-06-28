# Anthropic Claude Authentication

This guide explains how to set up authentication for Anthropic Claude in the Gemini CLI.

## Authentication Methods

### Method 1: API Key (Recommended for Development)

Set the `ANTHROPIC_API_KEY` environment variable:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

### Method 2: OAuth Authentication Code

For production applications or when you need OAuth flow:

1. **Set up OAuth application** in Anthropic Console:
   - Visit the Anthropic developer console
   - Create a new OAuth application
   - Note down your `client_id`, `client_secret`, and `redirect_uri`

2. **Set environment variables**:

   ```bash
   export ANTHROPIC_CLIENT_ID="your-client-id"
   export ANTHROPIC_CLIENT_SECRET="your-client-secret"
   export ANTHROPIC_REDIRECT_URI="http://localhost:8080/callback"
   ```

3. **Run the authentication command**:

   ```bash
   npx gemini-cli auth anthropic
   ```

4. **Follow the prompts** to enter your authentication code from the OAuth callback.

## CLI Commands

### Authenticate with Anthropic

```bash
npx gemini-cli auth anthropic
```

### Check authentication status

```bash
npx gemini-cli auth anthropic --status
```

### Clear cached credentials

```bash
npx gemini-cli auth anthropic --clear
```

## Usage

Once authenticated, you can use Anthropic Claude models:

```bash
# Use Claude with API key
ANTHROPIC_API_KEY="your-key" npx gemini-cli --model claude-sonnet-4-20250514 "Hello, Claude!"

# Use Claude with OAuth (after authentication)
npx gemini-cli --model claude-sonnet-4-20250514 "Hello, Claude!"
```

## Available Models

- `claude-sonnet-4-20250514` (default)
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`

## Environment Variables

| Variable                  | Description            | Required         |
| ------------------------- | ---------------------- | ---------------- |
| `ANTHROPIC_API_KEY`       | Your Anthropic API key | For API key auth |
| `ANTHROPIC_CLIENT_ID`     | OAuth client ID        | For OAuth auth   |
| `ANTHROPIC_CLIENT_SECRET` | OAuth client secret    | For OAuth auth   |
| `ANTHROPIC_REDIRECT_URI`  | OAuth redirect URI     | For OAuth auth   |

## Troubleshooting

### Authentication Failed

- Verify your API key or OAuth credentials are correct
- Check that environment variables are properly set
- Ensure your OAuth application is properly configured

### Token Expired

- Re-run the authentication command
- Check if your API key is still valid

### Network Issues

- Verify internet connectivity
- Check if corporate firewall is blocking requests to Anthropic API
