# Phase 5 Feature Flags Verification Guide

This document contains verification steps for enabling and testing each Phase 5 feature flag.

**Important:** All flags are currently disabled by default (`false`). To test them, you must manually edit the local settings via browser developer tools, or wait for a future Settings UI to expose these toggles.

## Current Feature Flags

| Flag                  | Default | Description                                                         |
| --------------------- | ------- | ------------------------------------------------------------------- |
| `ui.send_options`     | false   | Show send option selector (default, no_reply, priority) in composer |
| `ui.composer_palette` | false   | Enable `/` command palette with keyboard navigation                 |
| `ui.draft_persist`    | false   | Persist draft to localStorage and show restore banner               |
| `ui.thinking_drawer`  | false   | Show reasoning/thinking drawer for assistant messages               |
| `ui.density_modes`    | false   | Enable compact/comfortable density modes                            |

## How to Enable Flags

Currently, flags must be toggled manually via browser developer tools:

1. Open the app in a browser
2. Open Developer Tools (F12 or right-click → Inspect)
3. Go to Console tab
4. Run:

```javascript
// Get current settings
const settings = JSON.parse(localStorage.getItem("settings.v3") || "{}")

// Enable a flag (pick one)
settings.flags = settings.flags || {}
settings.flags["ui.send_options"] = true
settings.flags["ui.composer_palette"] = true
settings.flags["ui.draft_persist"] = true
settings.flags["ui.thinking_drawer"] = true
settings.flags["ui.density_modes"] = true

// Save back to localStorage
localStorage.setItem("settings.v3", JSON.stringify(settings))

// Reload the page
location.reload()
```

## Verification Steps by Flag

### ui.send_options

1. Enable the flag as described above
2. Reload the page
3. Open a session (or create a new one)
4. Look for a dropdown button next to the Send button in the composer bar
5. Click it and verify options: "default", "no_reply", "priority"
6. Select an option - it should show as selected
7. Type a message and send - verify the option is passed in the request

### ui.composer_palette

1. Enable the flag as described above
2. Reload the page
3. Focus on the composer input
4. Type `/` at the start of the input
5. Verify a palette appears with commands: `/plan`, `/act`, `/explain`, `/search`
6. Use arrow keys to navigate (up/down)
7. Press Enter or Tab to select a command
8. Verify the command prefix is stripped from the text
9. Press Escape to close the palette
10. Mobile: Tap a command to select it

### ui.draft_persist

1. Enable the flag as described above
2. Reload the page
3. Open a session
4. Type some text in the composer (don't send)
5. Refresh the page (or close and reopen the session)
6. Verify a "Restore draft?" banner appears above the composer
7. Click "Restore" - verify the text is restored
8. Click "Discard" - verify the text is cleared

### ui.thinking_drawer

1. Enable the flag as described above
2. Reload the page
3. Send a prompt that triggers a reasoning/thinking response
4. Verify a drawer expands below the message showing thinking/reasoning
5. Verify it can be collapsed/expanded

### ui.density_modes

1. Enable the flag as described above
2. Reload the page
3. Look for a density toggle in the UI (likely in Settings or toolbar)
4. Switch between compact and comfortable modes
5. Verify the UI layout adjusts accordingly

## Manual Mobile Checks (iPhone Safari)

These checks are for the mobile UX fixes in Phase 5-3:

1. **No horizontal scroll:**
   - Open app on iPhone Safari
   - Run in console: `document.documentElement.scrollWidth === window.innerWidth`
   - Should return `true`

2. **Palette overlay (if enabled):**
   - Type `/` to open palette
   - Verify palette appears under composer, not shifting page layout
   - Tap an item to select
   - Verify text is cleaned and Send button remains visible

3. **Touch targets:**
   - Verify all interactive elements are at least 44px tall
   - Palette items, Send button, Attach button should all be easily tappable

## Reverting Flags

To disable a flag:

```javascript
const settings = JSON.parse(localStorage.getItem("settings.v3") || "{}")
settings.flags["ui.send_options"] = false // or any other flag
localStorage.setItem("settings.v3", JSON.stringify(settings))
location.reload()
```

## Future: Settings UI

A future update will expose these flags in the Settings UI, eliminating the need for manual localStorage editing.
