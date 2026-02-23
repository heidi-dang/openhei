![Image 1: openhei-openai-codex-auth](assets/readme-hero.svg)
  
  
**Curated by [Numman Ali](https://x.com/nummanali)**
[![Twitter Follow](https://img.shields.io/twitter/follow/nummanali?style=social)](https://x.com/nummanali)
[![npm version](https://img.shields.io/npm/v/openhei-openai-codex-auth.svg)](https://www.npmjs.com/package/openhei-openai-codex-auth)
[![Tests](https://github.com/numman-ali/openhei-openai-codex-auth/actions/workflows/ci.yml/badge.svg)](https://github.com/numman-ali/openhei-openai-codex-auth/actions)
[![npm downloads](https://img.shields.io/npm/dm/openhei-openai-codex-auth.svg)](https://www.npmjs.com/package/openhei-openai-codex-auth)
**One install. Every Codex model.**
[Install](#-quick-start) · [Models](#-models) · [Configuration](#-configuration) · [Docs](#-docs)

---
## 💡 Philosophy
> **"One config. Every model."**
OpenHei should feel effortless. This plugin keeps the setup minimal while giving you full GPT‑5.x + Codex access via ChatGPT OAuth.
```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ChatGPT OAuth → Codex backend → OpenHei               │
│  One command install, full model presets, done.         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```
---
## 🚀 Quick Start
```bash
npx -y openhei-openai-codex-auth@latest
```
Then:
```bash
openhei auth login
openhei run "write hello world to test.txt" --model=openai/gpt-5.2 --variant=medium
```
Legacy OpenHei (v1.0.209 and below):
```bash
npx -y openhei-openai-codex-auth@latest --legacy
openhei run "write hello world to test.txt" --model=openai/gpt-5.2-medium
```
Uninstall:
```bash
npx -y openhei-openai-codex-auth@latest --uninstall
npx -y openhei-openai-codex-auth@latest --uninstall --all
```
---
## 📦 Models
- **gpt-5.2** (none/low/medium/high/xhigh)
- **gpt-5.2-codex** (low/medium/high/xhigh)
- **gpt-5.1-codex-max** (low/medium/high/xhigh)
- **gpt-5.1-codex** (low/medium/high)
- **gpt-5.1-codex-mini** (medium/high)
- **gpt-5.1** (none/low/medium/high)
---
## 🧩 Configuration
- Modern (OpenHei v1.0.210+): `config/openhei-modern.json`
- Legacy (OpenHei v1.0.209 and below): `config/openhei-legacy.json`

Minimal configs are not supported for GPT‑5.x; use the full configs above.
---
## ✅ Features
- ChatGPT Plus/Pro OAuth authentication (official flow)
- 22 model presets across GPT‑5.2 / GPT‑5.2 Codex / GPT‑5.1 families
- Variant system support (v1.0.210+) + legacy presets
- Multimodal input enabled for all models
- Usage‑aware errors + automatic token refresh
---
## 📚 Docs
- Getting Started: `docs/getting-started.md`
- Configuration: `docs/configuration.md`
- Troubleshooting: `docs/troubleshooting.md`
- Architecture: `docs/development/ARCHITECTURE.md`
---
## ⚠️ Usage Notice
This plugin is for **personal development use** with your own ChatGPT Plus/Pro subscription.
For production or multi‑user applications, use the OpenAI Platform API.

**Built for developers who value simplicity.**
