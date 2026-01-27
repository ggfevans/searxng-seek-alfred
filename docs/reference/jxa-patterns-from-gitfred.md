# JXA Patterns from gitfred Workflow

Reference patterns extracted from the [gitfred](https://github.com/chrisgrieser/gitfred) Alfred workflow.
These patterns demonstrate best practices for building Alfred Script Filter workflows with JXA (JavaScript for Automation).

---

## 1. Complete JXA Script Filter Structure

Every JXA script for Alfred follows this structure:

```javascript
#!/usr/bin/env osascript -l JavaScript

// ============================================================================
// IMPORTS AND INITIALIZATION
// ============================================================================

// Required: Import stdlib to access environment variables via $.getenv()
ObjC.import("stdlib");

// Required: Get reference to current application for shell scripts
const app = Application.currentApplication();
app.includeStandardAdditions = true;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// ... define helper functions here ...

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Alfred calls this function automatically.
 * @param {string[]} argv - Command line arguments passed from Alfred
 * @returns {string} - JSON string conforming to Alfred Script Filter format
 */
// biome-ignore lint/correctness/noUnusedVariables: Alfred run
function run(argv) {
    // argv[0] contains the query from Alfred's input
    const query = argv[0];

    // ... main logic ...

    // MUST return a JSON string with { items: [...] }
    return JSON.stringify({ items: [...] });
}
```

### Key Points:
- The shebang `#!/usr/bin/env osascript -l JavaScript` tells macOS to execute as JXA
- `ObjC.import("stdlib")` is required for `$.getenv()` to work
- The `run(argv)` function is called automatically by Alfred
- Must return a JSON string (use `JSON.stringify()`)

---

## 2. HTTP Requests with curl

### Method A: Simple HTTP Request (No Headers) - Using NSData

```javascript
/**
 * Perform a simple HTTP GET request without custom headers.
 * Uses native macOS APIs - no shell invocation.
 * @param {string} url - The URL to fetch
 * @returns {string} - Response body as string
 */
function httpRequest(url) {
    const queryUrl = $.NSURL.URLWithString(url);
    const requestData = $.NSData.dataWithContentsOfURL(queryUrl);
    return $.NSString.alloc.initWithDataEncoding(requestData, $.NSUTF8StringEncoding).js;
}
```

### Method B: HTTP Request with Custom Headers - Using curl

```javascript
/**
 * Perform an HTTP GET request with custom headers.
 * Uses curl via shell script for header support.
 * @param {string} url - The URL to fetch
 * @param {string[]} headers - Array of header strings, e.g., ["Accept: application/json"]
 * @returns {string} - Response body as string
 */
function httpRequestWithHeaders(url, headers) {
    // Build the headers string for curl
    let allHeaders = "";
    for (const line of headers) {
        allHeaders += ` -H "${line}"`;
    }

    // Construct curl command:
    // --silent: No progress meter
    // --location: Follow redirects
    // || true: Prevent error from killing the script
    const curlRequest = `curl --silent --location ${allHeaders} "${url}" || true`;

    // Optional: Log for debugging (shows in Alfred's debug console)
    console.log(curlRequest);

    return app.doShellScript(curlRequest);
}

// Example usage with API authentication:
const apiUrl = "https://api.github.com/user/repos";
const headers = [
    "Accept: application/vnd.github.json",
    "X-GitHub-Api-Version: 2022-11-28",
    `Authorization: BEARER ${token}`,
];
const response = httpRequestWithHeaders(apiUrl, headers);
```

### Important Notes:
- Always use `|| true` at the end of curl to prevent script failure on HTTP errors
- Use `--silent` to suppress progress output
- Use `--location` to follow redirects automatically
- `console.log()` output appears in Alfred's debug console

---

## 3. Alfred Script Filter JSON Structure

### Basic Item Structure

```javascript
/** @type {AlfredItem} */
const item = {
    // Required: Main text shown
    title: "Item Title",

    // Optional: Secondary text below title
    subtitle: "Description text",

    // Optional: Value passed to next action when selected
    arg: "value-to-pass",

    // Optional: Whether item can be actioned (default: true)
    valid: true,

    // Optional: Custom match string for Alfred filtering
    // If omitted, Alfred filters by title
    match: "search terms keywords",

    // Optional: URL for Quick Look (Shift key)
    quicklookurl: "https://example.com",

    // Optional: Unique ID for Alfred's frecency learning
    uid: "unique-identifier",

    // Optional: Custom icon
    icon: { path: "icon.png" },

    // Optional: Variables to pass to downstream actions
    variables: { key: "value" },

    // Optional: Modifier key actions (see below)
    mods: { ... },
};
```

### Modifier Keys (mods)

```javascript
const item = {
    title: "My Item",
    arg: "default-action",
    mods: {
        // Command key (Cmd)
        cmd: {
            valid: true,
            arg: "cmd-action-value",
            subtitle: "Cmd: Do something else",
            variables: { mode: "alternate" },
        },

        // Option key (Alt)
        alt: {
            valid: true,
            arg: "alt-action-value",
            subtitle: "Alt: Copy URL",
            variables: { mode: "copy" },
        },

        // Control key
        ctrl: {
            valid: true,
            arg: "ctrl-action-value",
            subtitle: "Ctrl: Open in Terminal",
        },

        // Shift key
        shift: {
            valid: true,
            arg: "shift-action-value",
            subtitle: "Shift: Mark as done",
            variables: { mode: "done" },
        },
    },
};
```

### Disabling All Modifiers

```javascript
// Useful for placeholder/error items where no modifier actions make sense
const deactivatedMods = {
    cmd: { valid: false, subtitle: "" },
    alt: { valid: false, subtitle: "" },
    ctrl: { valid: false, subtitle: "" },
    shift: { valid: false, subtitle: "" },
};

const errorItem = {
    title: "No results",
    subtitle: "Try a different search",
    valid: false,
    mods: deactivatedMods,
};
```

### Response Caching

```javascript
// Return items with cache configuration
return JSON.stringify({
    items: myItems,
    cache: {
        // How long to cache results (in seconds)
        seconds: 150,

        // If true, shows cached results immediately while fetching fresh data
        // Provides faster perceived performance
        loosereload: true,
    },
});
```

### Complete Response Example

```javascript
function run(argv) {
    const query = argv[0];

    // ... fetch and process data ...

    const items = results.map(result => ({
        title: result.name,
        subtitle: result.description,
        arg: result.url,
        match: alfredMatcher(result.name),
        quicklookurl: result.url,
        mods: {
            cmd: {
                arg: result.alternateUrl,
                subtitle: "Cmd: Open alternate"
            },
            alt: {
                arg: result.url,
                subtitle: "Alt: Copy URL",
                variables: { mode: "copy" }
            },
        },
    }));

    return JSON.stringify({
        items: items,
        cache: { seconds: 150, loosereload: true },
    });
}
```

---

## 4. Reading Environment Variables from Alfred

### Basic Environment Variable Access

```javascript
// Must import stdlib first!
ObjC.import("stdlib");

// Read a string variable (returns empty string if not set)
const username = $.getenv("github_username");

// Read and trim whitespace
const apiUrl = $.getenv("api_url").trim();

// Read a boolean (workflow variables are always strings)
const includePrivate = $.getenv("include_private") === "1";

// Read a number
const maxResults = Number.parseInt($.getenv("max_results"));
const cloneDepth = Number.parseInt($.getenv("clone_depth"));

// Check if a variable is set/non-empty
const isEnterprise = $.getenv("enterprise_url").trim() !== "";
```

### Safe Environment Variable Reading with Fallback

```javascript
// Using optional chaining for potentially undefined values
const enterpriseUrl = $.getenv("github_enterprise_url")?.trim();
```

### Reading Process Info (Alternative Method)

```javascript
// Access environment through NSProcessInfo (useful for checking specific vars)
const mode = $.NSProcessInfo.processInfo.environment.objectForKey("mode").js;
const showRead = mode === "show-read-notifications";
```

### Reading Secrets from Multiple Sources (Cascading Fallback)

```javascript
/**
 * Get a token from multiple possible sources with fallback.
 * Tries: Alfred prefs -> custom shell command -> ~/.zshenv
 */
function getToken() {
    // 1. Try Alfred workflow preferences first
    let token = $.getenv("token_from_alfred_prefs").trim();

    // 2. Try custom shell command (e.g., from password manager)
    if (!token) {
        const tokenShellCmd = $.getenv("token_shell_cmd");
        if (tokenShellCmd) {
            token = app.doShellScript(tokenShellCmd + " || true").trim();
            if (!token) console.log("Token shell command failed.");
        }
    }

    // 3. Try reading from ~/.zshenv (common for CLI tools)
    if (!token) {
        const cmd = "test -e $HOME/.zshenv && source $HOME/.zshenv ; echo $MY_TOKEN";
        token = app.doShellScript(cmd);
    }

    return token;
}
```

---

## 5. Reusable Utility Functions

### Alfred Match String Generator

Improves Alfred's fuzzy matching by generating additional searchable terms:

```javascript
/**
 * Generate enhanced match string for Alfred filtering.
 * Adds variations to improve fuzzy matching.
 * @param {string} str - The string to create match variants for
 * @returns {string} - Space-separated match terms
 */
function alfredMatcher(str) {
    // Replace common separators with spaces
    const clean = str.replace(/[-()_.:#/\\;,[\]]/g, " ");

    // Split camelCase into separate words (MyRepo -> My Repo)
    const camelCaseSeparated = str.replace(/([A-Z])/g, " $1");

    // Return all variants joined
    return [clean, camelCaseSeparated, str].join(" ");
}

// Usage example:
// alfredMatcher("MyAwesome-Repo_v2")
// Returns: "MyAwesome Repo v2  My Awesome- Repo_v2 MyAwesome-Repo_v2"
```

### Human-Readable Relative Date

```javascript
/**
 * Convert ISO date string to human-readable relative time.
 * @param {string} isoDateStr - ISO 8601 date string
 * @returns {string} - Human readable string like "2 hours ago"
 */
function humanRelativeDate(isoDateStr) {
    const deltaMins = (Date.now() - new Date(isoDateStr).getTime()) / 1000 / 60;

    /** @type {"year"|"month"|"week"|"day"|"hour"|"minute"} */
    let unit;
    let delta;

    if (deltaMins < 60) {
        unit = "minute";
        delta = Math.floor(deltaMins);
    } else if (deltaMins < 60 * 24) {
        unit = "hour";
        delta = Math.floor(deltaMins / 60);
    } else if (deltaMins < 60 * 24 * 7) {
        unit = "day";
        delta = Math.floor(deltaMins / 60 / 24);
    } else if (deltaMins < 60 * 24 * 7 * 4) {
        unit = "week";
        delta = Math.floor(deltaMins / 60 / 24 / 7);
    } else if (deltaMins < 60 * 24 * 7 * 4 * 12) {
        unit = "month";
        delta = Math.floor(deltaMins / 60 / 24 / 7 / 4);
    } else {
        unit = "year";
        delta = Math.floor(deltaMins / 60 / 24 / 7 / 4 / 12);
    }

    // Use built-in Intl formatter for localized output
    const formatter = new Intl.RelativeTimeFormat("en", {
        style: "narrow",
        numeric: "auto"
    });
    const str = formatter.format(-delta, unit);

    // Disambiguate "m" (could be month or minute)
    return str.replace(/m(?= ago$)/, "min");
}

// Usage: humanRelativeDate("2024-01-15T10:30:00Z") -> "3 hours ago"
```

### Short Number Formatter

```javascript
/**
 * Format large numbers with 'k' suffix for readability.
 * @param {number} count - Number to format
 * @returns {string} - Formatted string (e.g., "12k" for 12000)
 */
function shortNumber(count) {
    const str = count.toString();
    if (count < 2000) return str;
    return str.slice(0, -3) + "k";
}

// Usage: shortNumber(15432) -> "15k"
```

---

## 6. Error Handling Patterns

### Guard Clauses for API Responses

```javascript
function run(argv) {
    const query = argv[0];

    // GUARD: No input
    if (!query) {
        return JSON.stringify({
            items: [{ title: "Waiting for query...", valid: false }]
        });
    }

    // Fetch data
    const response = httpRequest(apiUrl);

    // GUARD: No response (network error)
    if (!response) {
        return JSON.stringify({
            items: [{
                title: "No response from server.",
                subtitle: "Try again later.",
                valid: false
            }],
        });
    }

    // GUARD: API error response
    const data = JSON.parse(response);
    if (data.message || data.error) {
        return JSON.stringify({
            items: [{
                title: "Request denied.",
                subtitle: data.message || data.error,
                valid: false
            }]
        });
    }

    // GUARD: Empty results
    if (data.items.length === 0) {
        return JSON.stringify({
            items: [{
                title: "No results",
                subtitle: `No results found for '${query}'`,
                valid: false,
                mods: {
                    shift: { valid: false },
                    cmd: { valid: false },
                    alt: { valid: false },
                    ctrl: { valid: false },
                },
            }],
        });
    }

    // Process and return results
    // ...
}
```

### Missing Configuration Guard

```javascript
function run() {
    const token = getToken();

    // GUARD: Required configuration missing
    if (!token) {
        return JSON.stringify({
            items: [{
                title: "No API token found.",
                subtitle: "Configure token in workflow settings.",
                valid: false
            }]
        });
    }

    // Continue with main logic...
}
```

---

## 7. Pagination Pattern

```javascript
function run() {
    const apiBase = "https://api.example.com";
    const perPage = 100;

    /** @type {ApiItem[]} */
    const allItems = [];
    let page = 1;

    while (true) {
        const url = `${apiBase}/items?per_page=${perPage}&page=${page}`;
        const response = httpRequest(url);

        if (!response) {
            return JSON.stringify({
                items: [{ title: "No response. Try again later.", valid: false }],
            });
        }

        const pageItems = JSON.parse(response);

        // Check for API errors
        if (pageItems.message) {
            return JSON.stringify({
                items: [{ title: "API Error", subtitle: pageItems.message, valid: false }],
            });
        }

        console.log(`Page ${page}: ${pageItems.length} items`);
        allItems.push(...pageItems);

        page++;

        // Stop conditions:
        // - Received less than requested (last page)
        // - Optional: limit total pages for performance
        if (pageItems.length < perPage) break;
        // if (page > 5) break; // Optional: limit to 5 pages
    }

    // Process allItems...
}
```

---

## 8. Running Shell Commands

```javascript
// Simple command execution
const result = app.doShellScript("ls -la /some/path");

// Command with error suppression (won't crash on failure)
const result = app.doShellScript("command-that-might-fail || true");

// Creating directories
app.doShellScript(`mkdir -p "${folderPath}"`);

// Finding files
const gitFolders = app
    .doShellScript(`find ${baseFolder} -type d -maxdepth 2 -name ".git"`)
    .split("\r");  // Note: JXA uses \r as line separator, not \n

// Checking git status
try {
    const isDirty = app.doShellScript(`cd "${repoPath}" && git status --porcelain`) !== "";
} catch (error) {
    // Handle error (e.g., not a git repo, permission issues)
}
```

---

## Source Files

These patterns were extracted from:
- `/Users/gvns/code/3rd-party/gitfred/scripts/github-notifications.js`
- `/Users/gvns/code/3rd-party/gitfred/scripts/my-github-issues.js`
- `/Users/gvns/code/3rd-party/gitfred/scripts/my-github-prs.js`
- `/Users/gvns/code/3rd-party/gitfred/scripts/my-github-repos.js`
- `/Users/gvns/code/3rd-party/gitfred/scripts/public-github-repo-search.js`
