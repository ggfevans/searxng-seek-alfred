# SearXNG API Reference

API documentation for integrating with a SearXNG instance.

---

## Prerequisites

Your SearXNG instance must have JSON format enabled in `settings.yml`:

```yaml
search:
  formats:
    - html
    - json  # Required for this workflow
  autocomplete: 'duckduckgo'  # Or another backend for suggestions
```

---

## Search Endpoint

### Request

```
GET /search?q={query}&format=json
```

Or:

```
POST /search
Content-Type: application/x-www-form-urlencoded

q={query}&format=json
```

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `q` | Yes | — | Search query string |
| `format` | Yes | `html` | Must be `json` for API use |
| `categories` | No | From settings | Comma-separated: `general`, `images`, `news`, `videos`, `files`, `it`, `science`, `music`, `maps` |
| `engines` | No | All enabled | Comma-separated engine names |
| `language` | No | From settings | Language code (e.g., `en`, `de`, `fr`) |
| `pageno` | No | `1` | Page number for pagination |
| `time_range` | No | — | `day`, `month`, or `year` |
| `safesearch` | No | From settings | `0` (off), `1` (moderate), `2` (strict) |

### Example Request

```bash
curl 'https://search.example.com/search?q=hello+world&format=json'
```

### Response Structure

```json
{
  "query": "hello world",
  "number_of_results": 12345,
  "results": [
    {
      "title": "Page Title",
      "url": "https://example.com/page",
      "content": "Snippet of the page content...",
      "engine": "google",
      "category": "general"
    }
  ],
  "answers": [],
  "corrections": [],
  "infoboxes": [],
  "suggestions": ["related search 1", "related search 2"],
  "unresponsive_engines": []
}
```

### Result Object Fields

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `title` | string | Yes | Page title |
| `url` | string | Yes | Full URL of the result |
| `content` | string | Usually | Snippet/description text |
| `engine` | string | Yes | Which search engine returned this |
| `category` | string | Yes | Result category |
| `publishedDate` | string | Sometimes | ISO date for news results |
| `thumbnail` | string | Sometimes | Thumbnail URL for image/video results |
| `img_src` | string | Images only | Full image URL |
| `resolution` | string | Images only | Image dimensions |
| `filesize` | string | Files only | File size |

---

## Autocomplete Endpoint

### Request

```
GET /autocompleter?q={partial_query}
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `q` | Yes | Partial query for suggestions |

### Example Request

```bash
curl 'https://search.example.com/autocompleter?q=clim'
```

### Response Structure

Returns a JSON array with two elements:

```json
[
  "clim",
  ["climate change", "climbing gear", "climate science", "climate zones"]
]
```

- `[0]`: The original query
- `[1]`: Array of suggestion strings

---

## Error Responses

### JSON Format Not Enabled

If JSON format is not enabled in settings.yml:

```
HTTP 403 Forbidden
```

### Invalid Request

```json
{
  "error": "search error",
  "message": "Description of the error"
}
```

---

## Rate Limiting

SearXNG does not have built-in rate limiting in the API, but:
- Your instance may be behind a reverse proxy with limits
- Upstream search engines may rate limit your instance
- Consider caching results client-side

---

## URL Construction Examples

### Basic Search

```javascript
const baseUrl = "https://search.example.com";
const query = encodeURIComponent("hello world");
const url = `${baseUrl}/search?q=${query}&format=json`;
```

### With Category

```javascript
const url = `${baseUrl}/search?q=${query}&format=json&categories=images`;
```

### With Time Range

```javascript
const url = `${baseUrl}/search?q=${query}&format=json&time_range=day`;
```

### Autocomplete

```javascript
const url = `${baseUrl}/autocompleter?q=${encodeURIComponent(partialQuery)}`;
```

---

## Domain Extraction

SearXNG returns full URLs. To extract the domain for display:

```javascript
function extractDomain(url) {
    try {
        const hostname = new URL(url).hostname;
        // Remove 'www.' prefix if present
        return hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

// Usage:
// extractDomain("https://www.reddit.com/r/programming/...")
// Returns: "reddit.com"
```

---

## References

- [SearXNG Search API Documentation](https://docs.searxng.org/dev/search_api.html)
- [SearXNG Autocomplete Documentation](https://docs.searxng.org/_modules/searx/autocomplete.html)
- [SearXNG Result Types](https://docs.searxng.org/dev/result_types/index.html)
- [Vivaldi + SearXNG Autocomplete Guide](https://ae3.ch/searxng-vivaldi-autocomplete/)
