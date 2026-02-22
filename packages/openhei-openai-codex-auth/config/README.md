# Configuration

This directory contains the official openhei configuration files for the OpenAI Codex OAuth plugin.

## ⚠️ REQUIRED: Choose the Right Configuration

**Two configuration files are available based on your OpenHei version:**

| File | OpenHei Version | Description |
|------|------------------|-------------|
| [`openhei-modern.json`](./openhei-modern.json) | **v1.0.210+ (Jan 2026+)** | Compact config using variants system - 6 models with built-in reasoning level variants |
| [`openhei-legacy.json`](./openhei-legacy.json) | **v1.0.209 and below** | Extended config with separate model entries for each reasoning level - 20+ individual model definitions |

### Which one should I use?

**If you have OpenHei v1.0.210 or newer** (check with `openhei --version`):
```bash
cp config/openhei-modern.json ~/.config/openhei/openhei.jsonc
```

**If you have OpenHei v1.0.209 or older**:
```bash
cp config/openhei-legacy.json ~/.config/openhei/openhei.jsonc
```

### Why two configs?

OpenHei v1.0.210+ introduced a **variants system** that allows defining reasoning effort levels as variants under a single model. This reduces config size from 572 lines to ~150 lines while maintaining the same functionality.

**What you get:**

| Config File | Model Families | Reasoning Variants | Total Models |
|------------|----------------|-------------------|--------------|
| `openhei-modern.json` | 6 | Built-in variants (low/medium/high/xhigh) | 6 base models with 19 total variants |
| `openhei-legacy.json` | 6 | Separate model entries | 20 individual model definitions |

Both configs provide:
- ✅ All supported GPT 5.2/5.1 variants: gpt-5.2, gpt-5.2-codex, gpt-5.1, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.1-codex-mini
- ✅ Proper reasoning effort settings for each variant (including `xhigh` for Codex Max/5.2)
- ✅ Context limits (272k context / 128k output for all Codex families)
- ✅ Required options: `store: false`, `include: ["reasoning.encrypted_content"]`
- ✅ Image input support for all models
- ✅ All required metadata for OpenHei features

### Modern Config Benefits (v1.0.210+)

- **74% smaller**: 150 lines vs 572 lines
- **DRY**: Common options defined once at provider level
- **Variant cycling**: Built-in support for `Ctrl+T` to switch reasoning levels
- **Easier maintenance**: Add new variants without copying model definitions

## Usage

1. **Check your OpenHei version**:
   ```bash
   openhei --version
   ```

2. **Copy the appropriate config** based on your version:
   ```bash
   # For v1.0.210+ (recommended):
   cp config/openhei-modern.json ~/.config/openhei/openhei.jsonc

   # For older versions:
   cp config/openhei-legacy.json ~/.config/openhei/openhei.jsonc
   ```

3. **Run openhei**:
   ```bash
   # Modern config (v1.0.210+):
   openhei run "task" --model=openai/gpt-5.2 --variant=medium
   openhei run "task" --model=openai/gpt-5.2 --variant=high

   # Legacy config:
   openhei run "task" --model=openai/gpt-5.2-medium
   openhei run "task" --model=openai/gpt-5.2-high
   ```

> **⚠️ Important**: Use the config file appropriate for your OpenHei version. Using the modern config with an older OpenHei version (v1.0.209 or below) will not work correctly.

> **Note**: The config templates use an **unversioned** plugin entry (`openhei-openai-codex-auth`) so the installer can always pull the latest release. If you need reproducibility, pin a specific version manually.

## Available Models

Both configs provide access to the same model families:

- **gpt-5.2** (none/low/medium/high/xhigh) - Latest GPT 5.2 model with full reasoning support
- **gpt-5.2-codex** (low/medium/high/xhigh) - GPT 5.2 Codex presets
- **gpt-5.1-codex-max** (low/medium/high/xhigh) - Codex Max presets
- **gpt-5.1-codex** (low/medium/high) - Codex model presets
- **gpt-5.1-codex-mini** (medium/high) - Codex mini tier presets
- **gpt-5.1** (none/low/medium/high) - General-purpose reasoning presets

All appear in the openhei model selector as "GPT 5.1 Codex Low (OAuth)", "GPT 5.1 High (OAuth)", etc.

## Configuration Options

See the main [README.md](../README.md#configuration) for detailed documentation of all configuration options.

## Version History

- **January 2026 (v1.0.210+)**: Introduced variant system support. Use `openhei-modern.json`
- **December 2025 and earlier**: Use `openhei-legacy.json`
