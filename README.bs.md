<p align="center">
  <a href="https://openhei.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenHei logo">
    </picture>
  </a>
</p>
<p align="center">OpenHei je open source AI agent za programiranje.</p>
<p align="center">
  <a href="https://openhei.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/openhei-ai"><img alt="npm" src="https://img.shields.io/npm/v/openhei-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/openhei/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/openhei/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a>
</p>

[![OpenHei Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://openhei.ai)

---

### Instalacija

```bash
# YOLO
curl -fsSL https://openhei.ai/install | bash

# Package manageri
npm i -g openhei-ai@latest        # ili bun/pnpm/yarn
scoop install openhei             # Windows
choco install openhei             # Windows
brew install anomalyco/tap/openhei # macOS i Linux (preporučeno, uvijek ažurno)
brew install openhei              # macOS i Linux (zvanična brew formula, rjeđe se ažurira)
sudo pacman -S openhei            # Arch Linux (Stable)
paru -S openhei-bin               # Arch Linux (Latest from AUR)
mise use -g openhei               # Bilo koji OS
nix run nixpkgs#openhei           # ili github:anomalyco/openhei za najnoviji dev branch
```

> [!TIP]
> Ukloni verzije starije od 0.1.x prije instalacije.

### Desktop aplikacija (BETA)

OpenHei je dostupan i kao desktop aplikacija. Preuzmi je direktno sa [stranice izdanja](https://github.com/anomalyco/openhei/releases) ili sa [openhei.ai/download](https://openhei.ai/download).

| Platforma             | Preuzimanje                           |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `openhei-desktop-darwin-aarch64.dmg` |
| macOS (Intel)         | `openhei-desktop-darwin-x64.dmg`     |
| Windows               | `openhei-desktop-windows-x64.exe`    |
| Linux                 | `.deb`, `.rpm`, ili AppImage          |

```bash
# macOS (Homebrew)
brew install --cask openhei-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/openhei-desktop
```

#### Instalacijski direktorij

Instalacijska skripta koristi sljedeći redoslijed prioriteta za putanju instalacije:

1. `$OPENHEI_INSTALL_DIR` - Prilagođeni instalacijski direktorij
2. `$XDG_BIN_DIR` - Putanja usklađena sa XDG Base Directory specifikacijom
3. `$HOME/bin` - Standardni korisnički bin direktorij (ako postoji ili se može kreirati)
4. `$HOME/.openhei/bin` - Podrazumijevana rezervna lokacija

```bash
# Primjeri
OPENHEI_INSTALL_DIR=/usr/local/bin curl -fsSL https://openhei.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://openhei.ai/install | bash
```

### Agenti

OpenHei uključuje dva ugrađena agenta između kojih možeš prebacivati tasterom `Tab`.

- **build** - Podrazumijevani agent sa punim pristupom za razvoj
- **plan** - Agent samo za čitanje za analizu i istraživanje koda
  - Podrazumijevano zabranjuje izmjene datoteka
  - Traži dozvolu prije pokretanja bash komandi
  - Idealan za istraživanje nepoznatih codebase-ova ili planiranje izmjena

Uključen je i **general** pod-agent za složene pretrage i višekoračne zadatke.
Koristi se interno i može se pozvati pomoću `@general` u porukama.

Saznaj više o [agentima](https://openhei.ai/docs/agents).

### Dokumentacija

Za više informacija o konfiguraciji OpenHei-a, [**pogledaj dokumentaciju**](https://openhei.ai/docs).

### Doprinosi

Ako želiš doprinositi OpenHei-u, pročitaj [upute za doprinošenje](./CONTRIBUTING.md) prije slanja pull requesta.

### Gradnja na OpenHei-u

Ako radiš na projektu koji je povezan s OpenHei-om i koristi "openhei" kao dio naziva, npr. "openhei-dashboard" ili "openhei-mobile", dodaj napomenu u svoj README da projekat nije napravio OpenHei tim i da nije povezan s nama.

### FAQ

#### Po čemu se razlikuje od Claude Code-a?

Po mogućnostima je vrlo sličan Claude Code-u. Ključne razlike su:

- 100% open source
- Nije vezan za jednog provajdera. Iako preporučujemo modele koje nudimo kroz [OpenHei Zen](https://openhei.ai/zen), OpenHei možeš koristiti s Claude, OpenAI, Google ili čak lokalnim modelima. Kako modeli napreduju, razlike među njima će se smanjivati, a cijene padati, zato je nezavisnost od provajdera važna.
- LSP podrška odmah po instalaciji
- Fokus na TUI. OpenHei grade neovim korisnici i kreatori [terminal.shop](https://terminal.shop); pomjeraćemo granice onoga što je moguće u terminalu.
- Klijent/server arhitektura. To, recimo, omogućava da OpenHei radi na tvom računaru dok ga daljinski koristiš iz mobilne aplikacije, što znači da je TUI frontend samo jedan od mogućih klijenata.

---

**Pridruži se našoj zajednici** [Discord](https://discord.gg/openhei) | [X.com](https://x.com/openhei)
