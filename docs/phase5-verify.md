## Send Options (ui.send_options)

1. Enable flag: Settings > General > Experimental: enable `Send options`, then reload.
2. Desktop: open a session, pick a non-default option (e.g. "Plan" or "No reply") and send a message — verify the outgoing request parts include `metadata.send_option` with the chosen value. Switch back to "Default" and send — verify `metadata.send_option` is absent.
3. iPhone Safari: confirm dropdown touch target is >=44px tall, no horizontal scroll (`document.documentElement.scrollWidth === window.innerWidth`), and selection persists after reload.

## What's New Banner (dismissedWhatsNewPhase5)

1. Fresh user (or after `settings.v3` cleared): verify the "What's New" banner appears at the top of the app after login, pointing to Settings → General → Experimental.
2. Click "Open Settings": navigate to the Settings page. Verify the banner disappears immediately.
3. Reload the page: confirm the banner does NOT reappear (dismissal persisted via settings store).
