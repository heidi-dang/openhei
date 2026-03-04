# Provider Error/Warning Status System - Implementation Summary

## Overview
This implementation adds a comprehensive error/warning status message system to OpenHei that provides consistent error handling across all AI providers and displays them in the web UI.

## Problem Solved
Previously, all error/warning messages from AI providers were silent and not shown in the web UI. Users had no visibility into what was wrong with their AI providers when issues occurred.

## Solution Architecture

### 1. Extended SessionStatus Types (`packages/openhei/src/session/status.ts`)
Added new status types:
- `provider_error` - Critical errors with severity levels (error, critical)
- `provider_warning` - Non-critical warnings
- `provider_status` - Informational status messages

Each status includes:
- Standardized error code
- Human-readable message
- Technical details
- Provider ID
- Retryability flag
- Timestamp

### 2. Enhanced Provider Error Handling (`packages/openhei/src/provider/error.ts`)
- Standardized error codes for all providers:
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

- Error detection from message patterns
- Severity classification (info, warning, error, critical)
- Retryability determination
- User-friendly message generation

### 3. Updated Session Processor (`packages/openhei/src/session/processor.ts`)
- Integrated standardized error handling
- Sets provider status on errors
- Handles retry logic with status updates
- Publishes error events for UI consumption

### 4. New UI Components

#### ProviderStatusBanner (`packages/app/src/components/session/provider-status-banner.tsx`)
- Displays current provider status/warnings/errors
- Shows countdown timer for retry
- Expandable technical details
- Color-coded by severity
- Retry button for retryable errors

#### ProviderErrorCard (`packages/app/src/components/session/provider-error-card.tsx`)
- Detailed error display for message errors
- Shows error type, message, and details
- Copy functionality for error details
- Expandable technical details
- Retry button for retryable errors

#### ProviderStatusIndicator (`packages/app/src/components/session/provider-status-indicator.tsx`)
- Header indicator showing provider health
- Pulsing animation for active issues
- Tooltip with status details
- Color-coded by state

### 5. Updated Session Page (`packages/app/src/pages/session.tsx`)
- Integrated provider status banner
- Added provider status indicator in header
- Connected error cards to actual session errors
- Shows last assistant message error

## File Changes Required

### Backend Changes

1. **packages/openhei/src/session/status.ts**
   - Add new status types (provider_error, provider_warning, provider_status)
   - Add helper functions (setProviderError, setProviderWarning, clearProviderStatus)
   - Add new BusEvent for provider status updates

2. **packages/openhei/src/provider/error.ts**
   - Add ErrorCode and Severity types
   - Add error pattern detection functions
   - Add standardize() function for consistent error formatting
   - Add user-friendly message generation

3. **packages/openhei/src/session/processor.ts**
   - Import ProviderError
   - Use standardized error handling in catch block
   - Set provider status on errors
   - Update retry logic with status

### Frontend Changes

1. **packages/app/src/components/session/provider-status-banner.tsx** (NEW)
   - Create new component for displaying provider status

2. **packages/app/src/components/session/provider-error-card.tsx** (NEW)
   - Create new component for displaying message errors

3. **packages/app/src/components/session/provider-status-indicator.tsx** (NEW)
   - Create new component for header status indicator

4. **packages/app/src/components/session/index.ts**
   - Export new components

5. **packages/app/src/pages/session.tsx**
   - Import new components
   - Add provider status indicator to header
   - Add provider status banner
   - Connect error cards to session errors

6. **packages/app/src/i18n/en.json**
   - Add translation keys for provider status messages

## Feature Flags

The implementation uses feature flags for gradual rollout:
- `ui.provider_status` - Enable provider status display (default: true)
- `ui.error_cards` - Enable error cards (existing flag)
- `ui.streaming_status` - Enable streaming status (existing flag)

## User Experience

### Error Display Flow
1. Provider returns an error
2. Error is standardized with code, severity, message
3. SessionStatus is updated with provider_error
4. Bus event is published
5. UI receives update and displays:
   - Header indicator changes color
   - Status banner appears with message
   - Error card shows for message errors
   - Retry button for retryable errors

### Visual Indicators
- **Green dot**: Provider ready/idle
- **Blue pulsing**: Provider busy
- **Yellow**: Warning (rate limit, timeout)
- **Orange**: Retrying
- **Red**: Error (context overflow, auth failed)
- **Red pulsing**: Critical error (quota exceeded, billing error)

## Testing Checklist

- [ ] Authentication errors show correctly
- [ ] Quota exceeded errors show correctly
- [ ] Rate limit warnings show with countdown
- [ ] Context overflow errors show correctly
- [ ] Network errors show correctly
- [ ] Retry button works for retryable errors
- [ ] Error details can be expanded
- [ ] Error messages can be copied
- [ ] Status indicator updates correctly
- [ ] Banner dismisses correctly
- [ ] Multiple errors handled correctly

## Migration Guide

1. Apply backend changes first
2. Deploy backend
3. Apply frontend changes
4. Deploy frontend
5. Enable `ui.provider_status` flag gradually
6. Monitor for issues
7. Remove feature flag once stable

## Future Enhancements

1. **Error History**: Show list of recent errors per provider
2. **Provider Health Dashboard**: Global view of all provider statuses
3. **Automatic Retry Policies**: Configure retry behavior per error type
4. **Error Analytics**: Track error rates and patterns
5. **Smart Suggestions**: Provide actionable fixes for common errors
