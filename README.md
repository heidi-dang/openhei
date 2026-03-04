# OpenHei Provider Error/Warning Status System

This implementation adds comprehensive error/warning status message consistency across all AI providers and displays them in the web UI.

## Problem
Previously, all error/warning messages from AI providers were silent and not shown in the web UI. Users had no visibility into what was wrong with their AI providers.

## Solution
A complete error handling system that:
1. Standardizes errors from all providers into consistent formats
2. Adds new SessionStatus types for provider errors/warnings
3. Creates UI components to display status messages
4. Provides visual indicators in the header for quick status checks

## Files Included

### Documentation
- `PROVIDER_STATUS_SYSTEM.md` - Architecture and design overview
- `IMPLEMENTATION_SUMMARY.md` - Detailed implementation guide
- `QUICK_START.md` - Step-by-step setup instructions
- `ERROR_FLOW.md` - Visual diagrams of error handling flow

### Backend Files (packages/openhei/src/)
- `session/status.ts` - Extended SessionStatus with provider error types
- `provider/error.ts` - Enhanced error handling with standardization
- `session/processor.ts` - Updated processor with status integration

### Frontend Files (packages/app/src/)
- `components/session/provider-status-banner.tsx` - Status banner component
- `components/session/provider-error-card.tsx` - Error card component
- `components/session/provider-status-indicator.tsx` - Header indicator component
- `components/session/index.ts` - Updated exports
- `pages/session.tsx` - Updated session page with status integration
- `i18n/en.json` - Translation keys

## Key Features

### Standardized Error Codes
- `AUTH_FAILED` - Authentication failures
- `QUOTA_EXCEEDED` - Usage quota exceeded
- `RATE_LIMITED` - Rate limit hit
- `CONTEXT_OVERFLOW` - Token limit exceeded
- `MODEL_UNAVAILABLE` - Model not available
- `NETWORK_ERROR` - Connection issues
- `TIMEOUT` - Request timeout
- `SERVER_ERROR` - Provider server error
- `TOOL_NOT_SUPPORTED` - Tool use not supported
- `UNKNOWN_ERROR` - Unclassified errors

### UI Components

#### ProviderStatusBanner
- Shows current provider status/warnings/errors
- Color-coded by severity (info/warning/error/critical)
- Expandable technical details
- Retry button for retryable errors
- Countdown timer for automatic retries

#### ProviderErrorCard
- Detailed error display for message errors
- Copy functionality for error details
- Expandable technical details
- Shows HTTP status codes
- Retry button for retryable errors

#### ProviderStatusIndicator
- Header dot indicator showing provider health
- Pulsing animation for active issues
- Tooltip with status details
- Shows provider name

### Visual Indicators
- **Green dot**: Provider ready/idle
- **Blue pulsing**: Provider busy
- **Yellow**: Warning (rate limit, timeout)
- **Orange**: Retrying
- **Red**: Error (context overflow, auth failed)
- **Red pulsing**: Critical error (quota exceeded, billing error)

## Quick Setup

1. **Backup existing files:**
```bash
cp packages/openhei/src/session/status.ts packages/openhei/src/session/status.ts.backup
cp packages/openhei/src/provider/error.ts packages/openhei/src/provider/error.ts.backup
cp packages/openhei/src/session/processor.ts packages/openhei/src/session/processor.ts.backup
cp packages/app/src/pages/session.tsx packages/app/src/pages/session.tsx.backup
```

2. **Copy new files:**
```bash
cp -r packages/openhei/src/* /path/to/openhei/packages/openhei/src/
cp -r packages/app/src/* /path/to/openhei/packages/app/src/
```

3. **Build and test:**
```bash
cd packages/openhei && bun run build
cd packages/app && npm run build
```

4. **Start development:**
```bash
cd packages/openhei && bun run serve --port 4096
cd packages/app && npm run dev
```

## Testing

Test various error scenarios:
1. **Authentication Error**: Use invalid API key
2. **Rate Limit**: Send many messages quickly
3. **Context Overflow**: Send very long message
4. **Network Error**: Disconnect internet
5. **Model Unavailable**: Use non-existent model

## Feature Flags

- `ui.provider_status` - Enable provider status display (default: true)
- `ui.error_cards` - Enable error cards
- `ui.streaming_status` - Enable streaming status

## Architecture

```
Provider Error → Standardize → SessionStatus → Bus Event → UI Update
```

1. Provider returns error
2. Error is standardized with code, severity, message
3. SessionStatus is updated
4. Bus event is published
5. UI receives update and displays status

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

MIT - Same as OpenHei project
