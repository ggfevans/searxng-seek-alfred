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

const CONFIG = {
	searxngUrl: getEnv("searxng_url"),
	timeoutMs: Number.parseInt(getEnv("timeout_ms", "5000"), 10),
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
 * Perform HTTP GET request.
 * @param {string} url - URL to fetch
 * @param {number} timeoutSecs - Timeout in seconds
 * @returns {{success: boolean, data?: string, error?: string}}
 */
function httpGet(url, timeoutSecs) {
	try {
		// Simple curl request - JXA's doShellScript has issues with complex output parsing
		const curlCmd = `curl --silent --location --max-time ${timeoutSecs} "${url}"`;
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
// ALFRED OUTPUT HELPERS
// ============================================================================

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
 * @returns {object} Alfred item
 */
function fallbackItem(query, searxngUrl) {
	const searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}`;
	return {
		title: `Search "${query}" in browser`,
		subtitle: "Open SearXNG web interface",
		arg: searchUrl,
		icon: { path: "icon.png" },
	};
}

/**
 * Transform a SearXNG result into an Alfred item.
 * @param {object} result - SearXNG result object
 * @param {string} query - Original search query
 * @param {string} searxngUrl - SearXNG base URL
 * @returns {object} Alfred item
 */
function resultToAlfredItem(result, query, searxngUrl) {
	const domain = extractDomain(result.url);
	const snippet = truncate(result.content || "", 80);
	const subtitle = snippet ? `${domain} · ${snippet}` : domain;
	const searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}`;

	return {
		title: result.title || result.url,
		subtitle: subtitle,
		arg: result.url,
		quicklookurl: result.url,
		match: alfredMatcher(result.title) + " " + alfredMatcher(snippet),
		mods: {
			cmd: {
				arg: result.url,
				subtitle: "⌘: Copy URL",
				variables: { action: "copy" },
			},
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
	// Remove trailing slash from URL if present
	const searxngUrl = CONFIG.searxngUrl.replace(/\/+$/, "");
	const timeoutMs = CONFIG.timeoutMs;

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

	query = query.trim();
	const searchUrl = `${searxngUrl}/search?q=${encodeURIComponent(query)}&format=json`;
	const timeoutSecs = Math.ceil(timeoutMs / 1000);

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
				fallbackItem(query, searxngUrl),
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
					`${searxngUrl}/search?q=${encodeURIComponent(query)}`
				),
				fallbackItem(query, searxngUrl),
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
					fallbackItem(query, searxngUrl),
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
				fallbackItem(query, searxngUrl),
			],
		};
	}

	// Guard: API error response
	if (data.error) {
		return {
			items: [
				errorItem("❌ API Error", data.error, searxngUrl),
				fallbackItem(query, searxngUrl),
			],
		};
	}

	// Guard: No results
	if (!data.results || data.results.length === 0) {
		return {
			items: [
				errorItem(
					"🔍 No results found",
					"Try different keywords",
					`${searxngUrl}/search?q=${encodeURIComponent(query)}`
				),
			],
		};
	}

	// Transform results to Alfred items
	const items = data.results.map((result) =>
		resultToAlfredItem(result, query, searxngUrl)
	);

	// Add fallback item at the end
	items.push(fallbackItem(query, searxngUrl));

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
