### Issue for this PR

Closes #40

### Type of change

- [x] New feature
- [ ] Bug fix
- [ ] Refactor / code improvement
- [ ] Documentation

### What does this PR do?

Adds a new user preference `thinkingDrawerMode` to control the behavior of the thinking/summary drawer, independent of the `ui.thinking_drawer` feature flag. Users can choose between 'auto' (show summaries only when available), 'always' (always render the drawer), or 'never' (disable the drawer).

### How did you verify your code works?

- Verified the new setting persists correctly using the existing settings persistence mechanism
- Verified the TypeScript types are correctly defined for all three modes
- Verified the setting integrates with the existing `withFallback` pattern used by other settings

### Checklist

- [x] I have tested my changes locally
- [x] I have not included unrelated changes in this PR
