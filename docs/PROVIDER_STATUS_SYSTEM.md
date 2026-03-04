# Provider Status Message System - Implementation Guide

## Problem Statement
Currently, all error/warning messages from AI providers are silent and not shown in the web UI. Users have no visibility into what's wrong with their AI providers.

## Solution Overview
Implement a consistent error/warning status message system across all providers and display them in the web UI.

## Architecture

### 1. Extended SessionStatus Types
Add new status types for errors and warnings:
- `provider_error` - Critical errors that stop processing
- `provider_warning` - Non-critical warnings that allow continuation
- `provider_status` - Informational status messages

### 2. Provider Error Normalization
All provider errors are normalized to a consistent format with:
- `type`: 'error' | 'warning' | 'status'
- `code`: Machine-readable error code
- `message`: Human-readable message
- `details`: Additional technical details
- `providerID`: Source provider
- `retryable`: Whether the error can be retried
- `timestamp`: When the error occurred

### 3. UI Components
- `ProviderStatusBanner` - Shows current provider status/warnings/errors
- `ProviderErrorCard` - Detailed error display with retry options
- `ProviderStatusIndicator` - Dot indicator in header showing provider health

### 4. Event Flow
```
Provider Error → ProviderError.parse() → SessionStatus.set() → Bus Event → UI Update
```

## Files to Modify

### Backend (packages/openhei/src/)
1. `session/status.ts` - Add new status types
2. `provider/error.ts` - Enhance error parsing with status types
3. `session/processor.ts` - Update error handling to set status
4. `session/message-v2.ts` - Add status message types

### Frontend (packages/app/src/)
1. `components/session/provider-status-banner.tsx` - New component
2. `components/session/provider-error-card.tsx` - Enhanced error card
3. `pages/session.tsx` - Integrate status display
4. `context/sync.tsx` - Add status to sync data

## Implementation Details

### Error Severity Levels
- **CRITICAL**: Authentication errors, quota exceeded - Show immediately, stop processing
- **WARNING**: Rate limits, temporary issues - Show but allow retry/continue
- **INFO**: Status updates, connection info - Show subtly

### Provider Error Codes (Standardized)
- `AUTH_FAILED` - Authentication failure
- `QUOTA_EXCEEDED` - Usage quota exceeded
- `RATE_LIMITED` - Rate limit hit
- `CONTEXT_OVERFLOW` - Token limit exceeded
- `MODEL_UNAVAILABLE` - Model not available
- `NETWORK_ERROR` - Connection issues
- `TIMEOUT` - Request timeout
- `INVALID_REQUEST` - Bad request parameters
- `SERVER_ERROR` - Provider server error
- `UNKNOWN_ERROR` - Unclassified error
