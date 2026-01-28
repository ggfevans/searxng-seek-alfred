#!/usr/bin/env osascript -l JavaScript

// Alfred SearXNG Workflow - Main Script Filter
// Searches a personal SearXNG instance and displays results in Alfred

// ============================================================================
// IMPORTS AND INITIALIZATION
// ============================================================================

ObjC.import("stdlib");

const app = Application.currentApplication();
app.includeStandardAdditions = true;

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Read environment variable with optional default value.
 * In JXA, $.getenv() throws an error if the variable doesn't exist.
 * @param {string} name - Environment variable name
 * @param {string} [defaultValue] - Default if not set
 * @returns {string}
 */
function getEnv(name, defaultValue) {
	try {
		const value = $.getenv(name);
		if (value === undefined || value === null || value === "") {
			return defaultValue !== undefined ? defaultValue : "";
		}
		return value.trim();
	} catch {
		return defaultValue !== undefined ? defaultValue : "";
	}
}

/**
 * Parse and validate timeout value.
 * Returns defaultMs if value is invalid, non-positive, or NaN.
 * Clamps to maxMs to prevent excessively long timeouts.
 * @param {string} value - String value to parse
 * @param {number} [defaultMs=5000] - Default timeout in milliseconds
 * @param {number} [maxMs=30000] - Maximum allowed timeout
 * @returns {number} Validated timeout in milliseconds
 */
function parseTimeout(value, defaultMs = 5000, maxMs = 30000) {
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return defaultMs;
	}
	return Math.min(parsed, maxMs);
}

const CONFIG = {
	searxngUrl: getEnv("searxng_url"),
	timeoutMs: parseTimeout(getEnv("timeout_ms", "5000")),
	secretKey: getEnv("secret_key", ""), // For SearXNG favicon proxy HMAC
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract domain from URL for display.
 * @param {string} url - Full URL
 * @returns {string} Domain without www prefix
 */
function extractDomain(url) {
	try {
		// Use regex since JXA doesn't have URL constructor
		const match = url.match(/^https?:\/\/(?:www\.)?([^\/]+)/);
		return match ? match[1] : url;
	} catch {
		return url;
	}
}

/**
 * Generate enhanced match string for Alfred filtering.
 * @param {string} str - String to create match variants for
 * @returns {string} Space-separated match terms
 */
function alfredMatcher(str) {
	if (!str) return "";
	const clean = str.replace(/[-()_.:#/\\;,[\]]/g, " ");
	const camelCaseSeparated = str.replace(/([A-Z])/g, " $1");
	return [clean, camelCaseSeparated, str].join(" ");
}

/**
 * Truncate text to a maximum length.
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string}
 */
function truncate(text, maxLength) {
	if (!text) return "";
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
}

/**
 * Shell-escape a string for safe interpolation into shell commands.
 * Wraps string in single quotes and escapes any embedded single quotes.
 * @param {string} str - String to escape
 * @returns {string} Shell-safe escaped string
 */
function shellEscape(str) {
	return "'" + str.replace(/'/g, "'\\''") + "'";
}

/**
 * Parse bang modifiers from query string.
 * Extracts category bangs (!i, !images, !n, !news, !v, !videos, !maps)
 * and time range bangs (!d, !m, !y) from anywhere in the query.
 * @param {string} query - Raw query string with potential bangs
 * @returns {{query: string, category: string|undefined, timeRange: string|undefined}}
 */
function parseBangs(query) {
	const categoryBangs = {
		"!images": "images",
		"!i": "images",
		"!news": "news",
		"!n": "news",
		"!videos": "videos",
		"!v": "videos",
		"!maps": "maps",
	};

	// SearXNG only supports: day, month, year (not week)
	const timeRangeBangs = {
		"!d": "day",
		"!m": "month",
		"!y": "year",
	};

	let category;
	let timeRange;
	let cleanQuery = query;

	// Helper to replace a bang, handling spacing correctly.
	// The regex captures: (before)(bang)(after) where before/after are whitespace or boundaries.
	// Three cases with intentionally asymmetric returns:
	// 1. Bang at start (before is empty): remove bang entirely, no leading space needed
	// 2. Bang at end (after is empty): preserve the leading space from 'before'
	// 3. Bang between words: collapse to single space to avoid double-spacing
	const replaceBang = (str, regex) => {
		return str.replace(regex, (match, before, after) => {
			if (before === "" || before === undefined) return ""; // Case 1: bang at start
			if (after === "" || after === undefined) return before; // Case 2: bang at end
			return " "; // Case 3: bang between words
		});
	};

	// Extract category bangs (case-insensitive, word boundary)
	// Keep replacing until no more matches (handles duplicates like "!i !i cats")
	for (const [bang, value] of Object.entries(categoryBangs)) {
		const regex = new RegExp(`(^|\\s)${bang}(\\s|$)`, "gi");
		let newQuery = replaceBang(cleanQuery, regex);
		while (newQuery !== cleanQuery) {
			category = value;
			cleanQuery = newQuery;
			newQuery = replaceBang(cleanQuery, regex);
		}
	}

	// Extract time range bangs (case-insensitive, word boundary)
	for (const [bang, value] of Object.entries(timeRangeBangs)) {
		const regex = new RegExp(`(^|\\s)${bang}(\\s|$)`, "gi");
		let newQuery = replaceBang(cleanQuery, regex);
		while (newQuery !== cleanQuery) {
			timeRange = value;
			cleanQuery = newQuery;
			newQuery = replaceBang(cleanQuery, regex);
		}
	}

	// Collapse runs of 3+ spaces to 2, then trim
	cleanQuery = cleanQuery.replace(/\s{3,}/g, "  ").trim();

	return {
		query: cleanQuery,
		category,
		timeRange,
	};
}

/**
 * Parse SearXNG autocomplete response.
 * Response format: ["query", ["suggestion1", "suggestion2", ...]]
 * @param {string} responseData - Raw JSON response string
 * @returns {string[]} Array of suggestions or empty array on error
 */
function parseAutocompleteResponse(responseData) {
	if (!responseData) return [];
	try {
		const parsed = JSON.parse(responseData);
		if (!Array.isArray(parsed) || parsed.length < 2 || !Array.isArray(parsed[1])) {
			return [];
		}
		return parsed[1];
	} catch {
		return [];
	}
}

/**
 * Convert an autocomplete suggestion to an Alfred item.
 * @param {string} suggestion - Suggestion text
 * @param {string|null} category - Inherited category from bangs
 * @param {string|null} timeRange - Inherited time range from bangs
 * @returns {object} Alfred item
 */
function suggestionToAlfredItem(suggestion, category, timeRange) {
	// Build contextual subtitle
	let subtitle = "Search";
	if (category) {
		subtitle += ` ${category}`;
	}
	if (timeRange) {
		const timeLabels = { day: "past day", month: "past month", year: "past year" };
		subtitle += ` (${timeLabels[timeRange] || timeRange})`;
	}
	subtitle += " for this suggestion";

	const item = {
		title: suggestion,
		subtitle: subtitle,
		arg: suggestion,
		autocomplete: suggestion,
		valid: true,
		icon: { path: "icon.png" },
	};

	// Pass bang context as variables for potential rerun
	if (category || timeRange) {
		item.variables = {};
		if (category) item.variables.category = category;
		if (timeRange) item.variables.timeRange = timeRange;
	}

	return item;
}

/**
 * Determine if query is long enough to show full search results.
 * Short queries (≤3 chars) show only autocomplete for speed.
 * Longer queries show both autocomplete and full results.
 * @param {string} query - Clean query (after bang extraction)
 * @returns {boolean} True if full results should be fetched
 */
function shouldShowFullResults(query) {
	const trimmed = query.trim();
	return trimmed.length > 3;
}

/**
 * Fetch autocomplete suggestions from SearXNG.
 * @param {string} query - Search query
 * @param {string} searxngUrl - Base SearXNG URL
 * @param {number} timeoutSecs - Timeout in seconds
 * @returns {string[]} Array of suggestions or empty array on error
 */
function fetchAutocomplete(query, searxngUrl, timeoutSecs) {
	const autocompleteUrl = `${searxngUrl}/autocompleter?q=${encodeURIComponent(query)}`;
	const response = httpGet(autocompleteUrl, Math.min(timeoutSecs, 2)); // Max 2s for autocomplete

	if (!response.success || !response.data) {
		return [];
	}

	return parseAutocompleteResponse(response.data);
}

/**
 * Perform HTTP GET request.
 * @param {string} url - URL to fetch
 * @param {number} timeoutSecs - Timeout in seconds
 * @returns {{success: boolean, data?: string, error?: string}}
 */
function httpGet(url, timeoutSecs) {
	try {
		// Shell-escape URL to prevent command injection
		// Use -- to prevent URLs starting with - from being interpreted as options
		const escapedUrl = shellEscape(url);
		const curlCmd = `curl --silent --location --max-time ${timeoutSecs} -- ${escapedUrl}`;
		const response = app.doShellScript(curlCmd);

		// Check for curl errors (when curl itself fails)
		if (!response || response.includes("curl:") || response.includes("Could not resolve")) {
			return { success: false, error: "network" };
		}

		return { success: true, data: response };
	} catch (e) {
		// doShellScript throws on non-zero exit codes
		return { success: false, error: "network" };
	}
}

// ============================================================================
// FAVICON CACHING
// ============================================================================

// Import Foundation for NSFileManager
ObjC.import("Foundation");

// Track favicon fetches per search to limit network requests
let faviconFetchesThisSearch = 0;
const MAX_FAVICON_FETCHES_PER_SEARCH = 10;

// Memoized directory paths (initialized on first use)
let cachedWorkflowDataDir = null;
let cachedFaviconDir = null;

/**
 * Get the workflow data directory path.
 * Creates the directory if it doesn't exist. Memoized for performance.
 * @returns {string} Absolute path to workflow data directory
 */
function getWorkflowDataDir() {
	if (cachedWorkflowDataDir) {
		return cachedWorkflowDataDir;
	}

	let dataDir;
	try {
		// Try Alfred's environment variable first
		dataDir = $.getenv("alfred_workflow_data");
	} catch {
		// Fallback: construct from bundle ID using getEnv helper for safety
		const home = getEnv("HOME", "");
		if (!home) {
			throw new Error("Cannot determine workflow data directory: HOME not set");
		}
		const bundleId = "com.ggfevans.alfred-searxng";
		dataDir = `${home}/Library/Application Support/Alfred/Workflow Data/${bundleId}`;
	}

	// Create directory if needed (mkdir -p is idempotent)
	app.doShellScript(`mkdir -p ${shellEscape(dataDir)}`);

	cachedWorkflowDataDir = dataDir;
	return dataDir;
}

/**
 * Get the favicons cache directory path.
 * Creates the directory if it doesn't exist. Memoized for performance.
 * @returns {string} Absolute path to favicons directory
 */
function getCacheDir() {
	if (cachedFaviconDir) {
		return cachedFaviconDir;
	}

	const cacheDir = `${getWorkflowDataDir()}/favicons`;
	app.doShellScript(`mkdir -p ${shellEscape(cacheDir)}`);

	cachedFaviconDir = cacheDir;
	return cacheDir;
}

/**
 * Check if a file exists using NSFileManager (faster than shell).
 * @param {string} path - File path to check
 * @returns {boolean} True if file exists
 */
function fileExists(path) {
	return $.NSFileManager.defaultManager.fileExistsAtPath(path);
}

/**
 * Sanitize a domain name for use as a filename.
 * Replaces any characters that could be problematic in filenames.
 * @param {string} domain - Domain name
 * @returns {string} Safe filename
 */
function sanitizeDomainForFilename(domain) {
	return domain.replace(/[^a-zA-Z0-9.-]/g, "_");
}

/**
 * Check if a favicon is cached for the given domain.
 * @param {string} domain - Domain name (e.g., "github.com")
 * @returns {string|null} Path to cached favicon or null if not cached
 */
function getCachedFavicon(domain) {
	const cacheDir = getCacheDir();
	const faviconPath = `${cacheDir}/${sanitizeDomainForFilename(domain)}.png`;

	if (fileExists(faviconPath)) {
		return faviconPath;
	}
	return null;
}

/**
 * Compute HMAC-SHA256 for SearXNG favicon proxy authentication.
 * Uses openssl which is available on all macOS systems.
 * @param {string} secretKey - SearXNG server secret key
 * @param {string} authority - Domain name to authenticate
 * @returns {string|null} Hex-encoded HMAC or null on failure
 */
function computeHmac(secretKey, authority) {
	try {
		// HMAC-SHA256 using openssl (matches SearXNG's new_hmac function)
		// printf ensures no trailing newline
		// macOS LibreSSL outputs just the hex digest (no prefix)
		const cmd = `printf '%s' ${shellEscape(authority)} | openssl dgst -sha256 -hmac ${shellEscape(secretKey)}`;
		const hmac = app.doShellScript(cmd);
		return hmac.trim();
	} catch {
		return null;
	}
}

/**
 * Build SearXNG favicon proxy URL with HMAC authentication.
 * @param {string} searxngUrl - Base SearXNG URL
 * @param {string} secretKey - SearXNG server secret key
 * @param {string} domain - Domain name
 * @returns {string|null} Favicon proxy URL or null if HMAC fails
 */
function buildFaviconProxyUrl(searxngUrl, secretKey, domain) {
	const hmac = computeHmac(secretKey, domain);
	if (!hmac) {
		return null;
	}
	return `${searxngUrl}/favicon_proxy?authority=${encodeURIComponent(domain)}&h=${hmac}`;
}

/**
 * Fetch favicon from SearXNG's native favicon proxy and save to cache.
 * Uses the user's own SearXNG instance for privacy-preserving favicon retrieval.
 * @param {string} domain - Domain name (e.g., "github.com")
 * @param {string} searxngUrl - Base SearXNG URL
 * @param {string} secretKey - SearXNG server secret key
 * @returns {string|null} Path to saved favicon or null on failure
 */
function fetchFavicon(domain, searxngUrl, secretKey) {
	const cacheDir = getCacheDir();
	const faviconPath = `${cacheDir}/${sanitizeDomainForFilename(domain)}.png`;

	// Build SearXNG favicon proxy URL with HMAC
	const faviconUrl = buildFaviconProxyUrl(searxngUrl, secretKey, domain);
	if (!faviconUrl) {
		return null;
	}

	try {
		// Download favicon with curl
		// --silent: No progress output
		// --location: Follow redirects
		// --max-time 1: 1 second timeout (keep UI responsive)
		// --output: Save directly to file
		const curlCmd = `curl --silent --location --max-time 1 --output ${shellEscape(faviconPath)} -- ${shellEscape(faviconUrl)}`;
		app.doShellScript(curlCmd);

		// Verify file was created and has content
		const fileSize = app.doShellScript(`stat -f%z ${shellEscape(faviconPath)} 2>/dev/null || echo 0`);
		if (Number.parseInt(fileSize, 10) > 0) {
			return faviconPath;
		}

		// Empty file - delete it and return null
		app.doShellScript(`rm -f ${shellEscape(faviconPath)}`);
		return null;
	} catch {
		// curl failed - clean up any partial file
		try {
			app.doShellScript(`rm -f ${shellEscape(faviconPath)}`);
		} catch {
			/* ignore cleanup errors */
		}
		return null;
	}
}

/**
 * Get favicon path for a domain, fetching and caching if needed.
 * Requires secret_key to be configured for SearXNG favicon proxy access.
 * @param {string} domain - Domain name (e.g., "github.com")
 * @param {string} searxngUrl - Base SearXNG URL
 * @param {string} secretKey - SearXNG server secret key
 * @returns {string} Path to favicon (cached, fetched, or generic fallback)
 */
function getFaviconPath(domain, searxngUrl, secretKey) {
	// If no secret key configured, favicons are disabled
	if (!secretKey) {
		return "icon.png";
	}

	// Check cache first
	const cached = getCachedFavicon(domain);
	if (cached) {
		return cached;
	}

	// Limit new fetches to keep search responsive
	if (faviconFetchesThisSearch >= MAX_FAVICON_FETCHES_PER_SEARCH) {
		return "icon.png";
	}

	faviconFetchesThisSearch++;

	// Try to fetch and cache via SearXNG's favicon proxy
	const fetched = fetchFavicon(domain, searxngUrl, secretKey);
	if (fetched) {
		return fetched;
	}

	// Fallback to generic icon
	return "icon.png";
}

// ============================================================================
// ALFRED OUTPUT HELPERS
// ============================================================================

/**
 * Format active filters for display in subtitle.
 * @param {string|null} category - Active category filter
 * @param {string|null} timeRange - Active time range filter
 * @returns {string} Formatted filter string or empty string
 */
function formatFilterSubtitle(category, timeRange) {
	const parts = [];
	if (category) {
		parts.push(category.charAt(0).toUpperCase() + category.slice(1));
	}
	if (timeRange) {
		const timeLabels = { day: "Past day", month: "Past month", year: "Past year" };
		parts.push(timeLabels[timeRange] || timeRange);
	}
	return parts.join(" · ");
}

/**
 * Create an error item for Alfred display.
 * @param {string} title - Error title
 * @param {string} subtitle - Error description
 * @param {string} [arg] - URL to open on Enter
 * @returns {object} Alfred item
 */
function errorItem(title, subtitle, arg) {
	const item = {
		title: title,
		subtitle: subtitle,
		valid: arg ? true : false,
		mods: {
			cmd: { valid: false, subtitle: "" },
			alt: { valid: false, subtitle: "" },
			ctrl: { valid: false, subtitle: "" },
			shift: { valid: false, subtitle: "" },
		},
	};
	if (arg) {
		item.arg = arg;
	}
	return item;
}

/**
 * Create the fallback "search in browser" item.
 * @param {string} query - Search query
 * @param {string} searxngUrl - SearXNG base URL
 * @param {string|null} category - Active category filter
 * @param {string|null} timeRange - Active time range filter
 * @returns {object} Alfred item
 */
function fallbackItem(query, searxngUrl, category, timeRange) {
	let searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}`;
	if (category) {
		searchUrl += `&categories=${encodeURIComponent(category)}`;
	}
	if (timeRange) {
		searchUrl += `&time_range=${encodeURIComponent(timeRange)}`;
	}
	const filterInfo = formatFilterSubtitle(category, timeRange);
	const subtitle = filterInfo ? `Open SearXNG web interface · ${filterInfo}` : "Open SearXNG web interface";
	return {
		title: `Search "${query}" in browser`,
		subtitle: subtitle,
		arg: searchUrl,
		icon: { path: "icon.png" },
	};
}

/**
 * Create a visual separator item for Alfred display.
 * @param {string} label - Separator label
 * @returns {object} Alfred item (not selectable)
 */
function separatorItem(label) {
	return {
		title: `── ${label} ──`,
		valid: false,
		icon: { path: "icon.png" },
	};
}

/**
 * Transform a SearXNG result into an Alfred item.
 * @param {object} result - SearXNG result object
 * @param {string} query - Original search query
 * @param {string} searxngUrl - SearXNG base URL
 * @param {string} secretKey - SearXNG server secret key (for favicons)
 * @param {string|null} category - Active category filter
 * @param {string|null} timeRange - Active time range filter
 * @returns {object} Alfred item
 */
function resultToAlfredItem(result, query, searxngUrl, secretKey, category, timeRange) {
	const domain = extractDomain(result.url);
	const snippet = truncate(result.content || "", 80);
	const filterInfo = formatFilterSubtitle(category, timeRange);
	const subtitleParts = [domain];
	if (filterInfo) {
		subtitleParts.push(filterInfo);
	}
	if (snippet) {
		subtitleParts.push(snippet);
	}
	const subtitle = subtitleParts.join(" · ");

	let searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}`;
	if (category) {
		searchUrl += `&categories=${encodeURIComponent(category)}`;
	}
	if (timeRange) {
		searchUrl += `&time_range=${encodeURIComponent(timeRange)}`;
	}

	// Get favicon for this domain (requires secret_key for SearXNG proxy)
	const iconPath = getFaviconPath(domain, searxngUrl, secretKey);

	return {
		title: result.title || result.url,
		subtitle: subtitle,
		arg: result.url,
		icon: { path: iconPath },
		quicklookurl: result.url,
		match: alfredMatcher(result.title) + " " + alfredMatcher(snippet),
		text: {
			copy: result.url,
			largetype: result.title || result.url,
		},
		mods: {
			alt: {
				arg: searchUrl,
				subtitle: "⌥: View in SearXNG",
			},
		},
	};
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

/**
 * Perform search and return Alfred items.
 * @param {string} query - Search query
 * @returns {object} Alfred response object
 */
function search(query) {
	// Reset favicon fetch counter for this search
	faviconFetchesThisSearch = 0;

	// Remove trailing slash from URL if present
	const searxngUrl = CONFIG.searxngUrl.replace(/\/+$/, "");
	const timeoutMs = CONFIG.timeoutMs;
	const secretKey = CONFIG.secretKey;

	// Guard: No SearXNG URL configured
	if (!searxngUrl) {
		return {
			items: [
				errorItem(
					"⚠️ SearXNG URL not configured",
					"Set searxng_url in workflow settings"
				),
			],
		};
	}

	// Guard: Empty query
	if (!query || query.trim() === "") {
		return {
			items: [
				{
					title: "Search SearXNG...",
					subtitle: "Type a query to search",
					valid: false,
				},
			],
		};
	}

	// Parse bangs from query
	const parsed = parseBangs(query.trim());
	const cleanQuery = parsed.query;

	// Guard: Empty query after bang extraction
	if (!cleanQuery) {
		return {
			items: [
				{
					title: "Search SearXNG...",
					subtitle: formatFilterSubtitle(parsed.category, parsed.timeRange) || "Type a query to search",
					valid: false,
				},
			],
		};
	}

	const timeoutSecs = Math.ceil(timeoutMs / 1000);

	// Fetch autocomplete suggestions (always, for any query length)
	const suggestions = fetchAutocomplete(cleanQuery, searxngUrl, timeoutSecs);
	const suggestionItems = suggestions.map((s) =>
		suggestionToAlfredItem(s, parsed.category, parsed.timeRange)
	);

	// Short queries: return autocomplete only for speed
	if (!shouldShowFullResults(cleanQuery)) {
		const items = [...suggestionItems];
		// Add fallback if no suggestions
		if (items.length === 0) {
			items.push(fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange));
		}
		return {
			items: items,
			cache: {
				seconds: 30,
				loosereload: true,
			},
		};
	}

	// Longer queries: fetch full results too
	// Build search URL with optional category and time_range
	let searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(cleanQuery)}&format=json`;
	if (parsed.category) {
		searchUrl += `&categories=${encodeURIComponent(parsed.category)}`;
	}
	if (parsed.timeRange) {
		searchUrl += `&time_range=${encodeURIComponent(parsed.timeRange)}`;
	}

	// Perform HTTP request
	const response = httpGet(searchUrl, timeoutSecs);

	// Guard: Network error
	if (!response.success) {
		return {
			items: [
				errorItem(
					"⚠️ Cannot reach SearXNG",
					"Check your connection",
					searxngUrl
				),
				fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange),
			],
		};
	}

	// Guard: Empty response
	if (!response.data || response.data.trim() === "") {
		return {
			items: [
				errorItem(
					"⏱️ Empty response",
					"SearXNG returned no data",
					`${searxngUrl}/search?q=${encodeURIComponent(cleanQuery)}`
				),
				fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange),
			],
		};
	}

	// Parse JSON response
	let data;
	try {
		data = JSON.parse(response.data);
	} catch (e) {
		// Check if we got HTML instead of JSON (API not enabled)
		if (response.data.includes("<!DOCTYPE") || response.data.includes("<html")) {
			return {
				items: [
					errorItem(
						"🔒 JSON API not enabled",
						"Enable json format in SearXNG settings.yml",
						"https://docs.searxng.org/admin/settings/settings_search.html#settings-search"
					),
					fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange),
				],
			};
		}
		return {
			items: [
				errorItem(
					"❌ Invalid response",
					"Check if JSON format is enabled",
					searxngUrl
				),
				fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange),
			],
		};
	}

	// Guard: API error response
	if (data.error) {
		return {
			items: [
				errorItem("❌ API Error", data.error, searxngUrl),
				fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange),
			],
		};
	}

	// Guard: No results
	if (!data.results || data.results.length === 0) {
		const filterInfo = formatFilterSubtitle(parsed.category, parsed.timeRange);
		const noResultsSubtitle = filterInfo
			? `Try different keywords · ${filterInfo}`
			: "Try different keywords";
		// Return suggestions if available, otherwise show no results error
		if (suggestionItems.length > 0) {
			return {
				items: [
					...suggestionItems,
					separatorItem("No Results"),
					errorItem(
						"🔍 No results found",
						noResultsSubtitle,
						`${searxngUrl}/search?q=${encodeURIComponent(cleanQuery)}`
					),
				],
				cache: {
					seconds: 60,
					loosereload: true,
				},
			};
		}
		return {
			items: [
				errorItem(
					"🔍 No results found",
					noResultsSubtitle,
					`${searxngUrl}/search?q=${encodeURIComponent(cleanQuery)}`
				),
			],
		};
	}

	// Transform results to Alfred items
	const resultItems = data.results.map((result) =>
		resultToAlfredItem(result, cleanQuery, searxngUrl, secretKey, parsed.category, parsed.timeRange)
	);

	// Combine: suggestions first, then separator, then results
	const items = [];
	if (suggestionItems.length > 0) {
		items.push(...suggestionItems);
		items.push(separatorItem("Results"));
	}
	items.push(...resultItems);

	// Add fallback item at the end
	items.push(fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange));

	return {
		items: items,
		cache: {
			seconds: 60,
			loosereload: true,
		},
	};
}

// ============================================================================
// ALFRED ENTRY POINT
// ============================================================================

// biome-ignore lint/correctness/noUnusedVariables: Alfred entry point
function run(argv) {
	const query = argv[0] || "";
	const result = search(query);
	return JSON.stringify(result);
}
