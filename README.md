# Alfred SearXNG Workflow

[![GitHub Downloads](https://img.shields.io/github/downloads/ggfevans/Alfred-SearXNG-Workflow/total?style=flat-square&logo=github)](https://github.com/ggfevans/Alfred-SearXNG-Workflow/releases)
[![Latest Release](https://img.shields.io/github/v/release/ggfevans/Alfred-SearXNG-Workflow?style=flat-square)](https://github.com/ggfevans/Alfred-SearXNG-Workflow/releases/latest)
[![License](https://img.shields.io/github/license/ggfevans/Alfred-SearXNG-Workflow?style=flat-square)](LICENSE)

Search your personal [SearXNG](https://docs.searxng.org/) instance directly from Alfred with inline results.

## Features

- **Inline results** - Search results appear directly in Alfred
- **Website favicons** - See site icons next to results (optional)
- **Fallback search** - Use as your default web search instead of Google
- **Quick actions** - Open, copy URL, or view in SearXNG web UI

## Installation

1. Download the latest `.alfredworkflow` from [Releases](https://github.com/ggfevans/Alfred-SearXNG-Workflow/releases/latest)
2. Double-click to install in Alfred
3. Configure your SearXNG URL in the workflow settings

## Usage

Type `sx` followed by your search query:

| Key | Action |
|-----|--------|
| <kbd>Return</kbd> | Open result in browser |
| <kbd>Cmd</kbd>+<kbd>Return</kbd> | Copy URL to clipboard |
| <kbd>Option</kbd>+<kbd>Return</kbd> | Open in SearXNG web interface |
| <kbd>Shift</kbd> | Quick Look preview |

### Use as Default Web Search

You can replace Google as your fallback search:

1. Open Alfred Preferences → Features → Default Results
2. Click "Setup fallback results" at the bottom
3. Click + and add "Search SearXNG"
4. Drag it above Google (or remove Google)

Now typing anything and pressing Enter searches SearXNG.

## Configuration

Configure in Alfred Preferences → Workflows → SearXNG → Configure Workflow:

| Setting | Required | Description |
|---------|----------|-------------|
| SearXNG URL | Yes | Your instance URL (e.g., `https://search.example.com`) |
| Timeout (ms) | No | Request timeout, default 5000 |
| Secret Key | No | For favicon support (see below) |

### SearXNG Instance Setup

Your SearXNG instance needs JSON format enabled in `settings.yml`:

```yaml
search:
  formats:
    - html
    - json
```

### Favicons (Optional)

To display website favicons in results:

1. Enable favicon resolver in your SearXNG `settings.yml`:
   ```yaml
   search:
     favicon_resolver: "duckduckgo"
   ```

2. Copy the `secret_key` from your SearXNG `settings.yml` into the workflow configuration

Favicons are fetched through your SearXNG instance's proxy, preserving privacy.

## Requirements

- macOS with [Alfred 5+](https://www.alfredapp.com/) and Powerpack
- A SearXNG instance with JSON format enabled

## License

[MIT](LICENSE)
