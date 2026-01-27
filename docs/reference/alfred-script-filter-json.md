# Alfred Script Filter JSON Reference

Complete JSON schema for Alfred Script Filter output.

Source: [Alfred Script Filter JSON Format](https://www.alfredapp.com/help/workflows/inputs/script-filter/json/)

---

## Root Level

```json
{
  "items": [],
  "variables": {},
  "rerun": 0.5,
  "cache": {},
  "skipknowledge": false
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | array | Yes | Array of result items |
| `variables` | object | No | Session variables for downstream actions |
| `rerun` | number | No | Re-run script after N seconds (0.1-5.0) |
| `cache` | object | No | Caching configuration |
| `skipknowledge` | boolean | No | Skip Alfred's knowledge/learning |

---

## Item Object

```json
{
  "title": "Required title",
  "subtitle": "Optional subtitle",
  "arg": "value-passed-to-action",
  "uid": "unique-id-for-frecency",
  "icon": { "path": "icon.png" },
  "valid": true,
  "match": "custom search terms",
  "autocomplete": "text for tab completion",
  "type": "default",
  "mods": {},
  "action": {},
  "text": {},
  "quicklookurl": "https://example.com",
  "variables": {}
}
```

### All Item Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `title` | string | **Yes** | — | Main text displayed |
| `subtitle` | string | No | — | Secondary text below title |
| `arg` | string/array | Recommended | — | Value passed to actions on Enter |
| `uid` | string | No | — | Unique ID for Alfred's frecency learning |
| `icon` | object | No | — | Custom icon (see Icon section) |
| `valid` | boolean | No | `true` | Whether item can be actioned |
| `match` | string | No | `title` | Custom text for "Alfred Filters Results" mode |
| `autocomplete` | string | No | — | Text populated on Tab |
| `type` | string | No | `"default"` | `"default"`, `"file"`, or `"file:skipcheck"` |
| `mods` | object | No | — | Modifier key behaviors |
| `action` | string/array/object | No | — | Universal Action items |
| `text` | object | No | — | Custom copy/largetype text |
| `quicklookurl` | string | No | — | URL for Quick Look (Shift) |
| `variables` | object | No | — | Item-specific variables |

---

## Icon Object

```json
{
  "icon": {
    "path": "icon.png"
  }
}
```

Or with type:

```json
{
  "icon": {
    "type": "fileicon",
    "path": "/Applications/Safari.app"
  }
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `path` | string | — | Path to icon file or application |
| `type` | string | `"fileicon"`, `"filetype"` | Use file's icon or file type icon |

---

## Modifier Keys (mods)

```json
{
  "mods": {
    "cmd": {
      "valid": true,
      "arg": "alternate-value",
      "subtitle": "Cmd: Do alternate action",
      "icon": { "path": "icon2.png" },
      "variables": { "mode": "alternate" }
    },
    "alt": { ... },
    "ctrl": { ... },
    "shift": { ... },
    "fn": { ... },
    "cmd+alt": { ... },
    "cmd+ctrl": { ... }
  }
}
```

Available modifier keys:
- `cmd` - Command key
- `alt` - Option key
- `ctrl` - Control key
- `shift` - Shift key
- `fn` - Function key
- Combinations: `cmd+alt`, `cmd+ctrl`, `alt+ctrl`, etc.

Each modifier can override:
- `valid` - Whether actionable with this modifier
- `arg` - Different value for this modifier
- `subtitle` - Different subtitle shown when holding modifier
- `icon` - Different icon
- `variables` - Different variables

---

## Text Object

Custom text for copy (Cmd+C) and Large Type (Cmd+L):

```json
{
  "text": {
    "copy": "Text copied to clipboard",
    "largetype": "Text shown in large type"
  }
}
```

---

## Cache Object

```json
{
  "cache": {
    "seconds": 60,
    "loosereload": true
  }
}
```

| Property | Type | Range | Description |
|----------|------|-------|-------------|
| `seconds` | number | 5-86400 | Cache duration in seconds |
| `loosereload` | boolean | — | If true, show cached results immediately while fetching fresh |

**Best practice:** Use `loosereload: true` for API calls to show instant results while refreshing.

---

## Complete Example

```json
{
  "items": [
    {
      "title": "Search Result Title",
      "subtitle": "example.com · Description of the result...",
      "arg": "https://example.com/page",
      "quicklookurl": "https://example.com/page",
      "match": "search result title example description",
      "mods": {
        "cmd": {
          "arg": "https://example.com/page",
          "subtitle": "Cmd: Copy URL",
          "variables": { "action": "copy" }
        },
        "alt": {
          "arg": "https://searxng.example.com/search?q=query",
          "subtitle": "Alt: View in SearXNG"
        }
      }
    },
    {
      "title": "Search \"query\" in browser",
      "subtitle": "Open SearXNG web interface",
      "arg": "https://searxng.example.com/search?q=query",
      "icon": { "path": "search-icon.png" }
    }
  ],
  "cache": {
    "seconds": 60,
    "loosereload": true
  }
}
```

---

## Placeholder/Error Items

When showing non-actionable items (errors, placeholders):

```json
{
  "title": "No results found",
  "subtitle": "Try different search terms",
  "valid": false,
  "mods": {
    "cmd": { "valid": false, "subtitle": "" },
    "alt": { "valid": false, "subtitle": "" },
    "ctrl": { "valid": false, "subtitle": "" },
    "shift": { "valid": false, "subtitle": "" }
  }
}
```

Set `valid: false` to prevent accidental activation, and disable all mods.

---

## Variables Flow

1. **Root-level variables** persist for the entire session
2. **Item-level variables** override root variables when that item is selected
3. **Mod-level variables** override item variables when that modifier is held
4. Variables are accessible in downstream workflow actions via `{var:name}` or `$name`

```json
{
  "variables": { "action": "open" },
  "items": [
    {
      "title": "Item",
      "arg": "https://example.com",
      "variables": { "action": "open" },
      "mods": {
        "cmd": {
          "variables": { "action": "copy" }
        }
      }
    }
  ]
}
```

---

## Performance Tips

1. **Use `match` field** with "Alfred Filters Results" to let Alfred filter client-side (faster than re-running script)
2. **Use `cache`** with `loosereload: true` for API-backed results
3. **Use `rerun`** sparingly (0.5-1.0s) for live-updating results
4. **Limit items** to ~50 for best performance
5. **Use `uid`** for Alfred to learn user preferences over time
