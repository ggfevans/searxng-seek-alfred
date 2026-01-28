# Autocomplete Suggestions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add smart autocomplete suggestions with threshold-based behavior (≤3 chars: autocomplete only, >3 chars: both)

**Architecture:** Modify search.js to call SearXNG's `/autocompleter` endpoint. Short queries get fast autocomplete-only response. Longer queries fetch both endpoints in parallel using shell backgrounding.

**Tech Stack:** JXA (JavaScript for Automation), SearXNG API, curl for HTTP

---

## Task 1: Add Autocomplete Response Parsing Tests

**Files:**
- Create: `tests/autocomplete.test.js`

**Step 1: Create test file with parseAutocompleteResponse tests**

```javascript
#!/usr/bin/env node
/**
 * Unit tests for autocomplete functions
 * Run with: node tests/autocomplete.test.js
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract parseAutocompleteResponse function from search.js via regex
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);
const parseAutocompleteFn = searchJs.match(
	/function parseAutocompleteResponse\(responseData\) \{[\s\S]*?\n\}/
);
if (!parseAutocompleteFn) {
	throw new Error("Could not find parseAutocompleteResponse function in search.js");
}
// eslint-disable-next-line no-eval
const parseAutocompleteResponse = eval(`(${parseAutocompleteFn[0]})`);

describe("parseAutocompleteResponse", () => {
	describe("valid responses", () => {
		it("parses standard autocomplete response", () => {
			const data = '["clim", ["climate change", "climbing gear", "climate science"]]';
			const result = parseAutocompleteResponse(data);
			assert.deepStrictEqual(result, ["climate change", "climbing gear", "climate science"]);
		});

		it("returns empty array for empty suggestions", () => {
			const data = '["query", []]';
			const result = parseAutocompleteResponse(data);
			assert.deepStrictEqual(result, []);
		});

		it("handles single suggestion", () => {
			const data = '["test", ["testing"]]';
			const result = parseAutocompleteResponse(data);
			assert.deepStrictEqual(result, ["testing"]);
		});
	});

	describe("invalid responses", () => {
		it("returns empty array for invalid JSON", () => {
			const result = parseAutocompleteResponse("not json");
			assert.deepStrictEqual(result, []);
		});

		it("returns empty array for null", () => {
			const result = parseAutocompleteResponse(null);
			assert.deepStrictEqual(result, []);
		});

		it("returns empty array for empty string", () => {
			const result = parseAutocompleteResponse("");
			assert.deepStrictEqual(result, []);
		});

		it("returns empty array for malformed array", () => {
			const result = parseAutocompleteResponse('["only one element"]');
			assert.deepStrictEqual(result, []);
		});

		it("returns empty array for non-array suggestions", () => {
			const result = parseAutocompleteResponse('["query", "not an array"]');
			assert.deepStrictEqual(result, []);
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Could not find parseAutocompleteResponse function"

**Step 3: Add minimal parseAutocompleteResponse function to search.js**

Add after `parseBangs` function (around line 188):

```javascript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add tests/autocomplete.test.js scripts/search.js
git commit -m "feat: add parseAutocompleteResponse function

Parses SearXNG autocomplete API response format.

Issue #5"
```

---

## Task 2: Add Suggestion Item Builder Tests and Implementation

**Files:**
- Modify: `tests/autocomplete.test.js`
- Modify: `scripts/search.js`

**Step 1: Add suggestionToAlfredItem tests**

Append to `tests/autocomplete.test.js`:

```javascript
// Extract suggestionToAlfredItem function
const suggestionFn = searchJs.match(
	/function suggestionToAlfredItem\(suggestion, category, timeRange\) \{[\s\S]*?\n\}/
);
if (!suggestionFn) {
	throw new Error("Could not find suggestionToAlfredItem function in search.js");
}
// eslint-disable-next-line no-eval
const suggestionToAlfredItem = eval(`(${suggestionFn[0]})`);

describe("suggestionToAlfredItem", () => {
	it("creates basic suggestion item", () => {
		const item = suggestionToAlfredItem("climate change", null, null);
		assert.strictEqual(item.title, "climate change");
		assert.strictEqual(item.subtitle, "Search for this suggestion");
		assert.strictEqual(item.arg, "climate change");
		assert.strictEqual(item.autocomplete, "climate change");
		assert.strictEqual(item.valid, true);
		assert.deepStrictEqual(item.icon, { path: "icon.png" });
	});

	it("inherits category in subtitle", () => {
		const item = suggestionToAlfredItem("mountains", "images", null);
		assert.strictEqual(item.subtitle, "Search images for this suggestion");
	});

	it("inherits time range in subtitle", () => {
		const item = suggestionToAlfredItem("news", null, "day");
		assert.strictEqual(item.subtitle, "Search (past day) for this suggestion");
	});

	it("inherits both category and time range", () => {
		const item = suggestionToAlfredItem("events", "news", "week");
		assert.strictEqual(item.subtitle, "Search news (past week) for this suggestion");
	});

	it("includes variables for bang context", () => {
		const item = suggestionToAlfredItem("test", "images", "month");
		assert.deepStrictEqual(item.variables, {
			category: "images",
			timeRange: "month"
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Could not find suggestionToAlfredItem function"

**Step 3: Add suggestionToAlfredItem function to search.js**

Add after `parseAutocompleteResponse` function:

```javascript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add tests/autocomplete.test.js scripts/search.js
git commit -m "feat: add suggestionToAlfredItem function

Creates Alfred items from autocomplete suggestions with inherited bang context.

Issue #5"
```

---

## Task 3: Add Threshold Logic Tests

**Files:**
- Modify: `tests/autocomplete.test.js`

**Step 1: Add shouldShowFullResults tests**

Append to `tests/autocomplete.test.js`:

```javascript
// Extract shouldShowFullResults function
const thresholdFn = searchJs.match(
	/function shouldShowFullResults\(query\) \{[\s\S]*?\n\}/
);
if (!thresholdFn) {
	throw new Error("Could not find shouldShowFullResults function in search.js");
}
// eslint-disable-next-line no-eval
const shouldShowFullResults = eval(`(${thresholdFn[0]})`);

describe("shouldShowFullResults", () => {
	describe("short queries (≤3 chars) - autocomplete only", () => {
		it("returns false for 1 char", () => {
			assert.strictEqual(shouldShowFullResults("a"), false);
		});

		it("returns false for 2 chars", () => {
			assert.strictEqual(shouldShowFullResults("ab"), false);
		});

		it("returns false for 3 chars", () => {
			assert.strictEqual(shouldShowFullResults("abc"), false);
		});

		it("returns false for empty string", () => {
			assert.strictEqual(shouldShowFullResults(""), false);
		});
	});

	describe("longer queries (>3 chars) - full results", () => {
		it("returns true for 4 chars", () => {
			assert.strictEqual(shouldShowFullResults("abcd"), true);
		});

		it("returns true for long query", () => {
			assert.strictEqual(shouldShowFullResults("climate change"), true);
		});
	});

	describe("edge cases", () => {
		it("counts actual characters, not bytes", () => {
			assert.strictEqual(shouldShowFullResults("café"), true); // 4 chars
		});

		it("trims whitespace before counting", () => {
			assert.strictEqual(shouldShowFullResults("  ab  "), false); // 2 chars
		});
	});
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Could not find shouldShowFullResults function"

**Step 3: Add shouldShowFullResults function to search.js**

Add after `suggestionToAlfredItem`:

```javascript
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
```

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add tests/autocomplete.test.js scripts/search.js
git commit -m "feat: add shouldShowFullResults threshold function

Queries ≤3 chars get fast autocomplete only, >3 chars get full results.

Issue #5"
```

---

## Task 4: Add fetchAutocomplete Function

**Files:**
- Modify: `scripts/search.js`

**Step 1: Add fetchAutocomplete function**

Add after `shouldShowFullResults`:

```javascript
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
```

**Step 2: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add scripts/search.js
git commit -m "feat: add fetchAutocomplete function

Fetches suggestions from SearXNG /autocompleter endpoint with 2s timeout.

Issue #5"
```

---

## Task 5: Add Separator Item Function

**Files:**
- Modify: `scripts/search.js`

**Step 1: Add separatorItem function**

Add after `fallbackItem` function (around line 503):

```javascript
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
```

**Step 2: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add scripts/search.js
git commit -m "feat: add separatorItem function for visual dividers

Issue #5"
```

---

## Task 6: Integrate Autocomplete into Search Function

**Files:**
- Modify: `scripts/search.js`

**Step 1: Modify search function to add autocomplete logic**

Replace the `search` function (starting around line 568) with updated version that:
1. Checks threshold with `shouldShowFullResults`
2. For short queries: fetch autocomplete only
3. For long queries: fetch both in parallel
4. Combine results appropriately

Find the section after bang parsing (around line 617) where we build the search URL. Insert new logic:

```javascript
// After: const cleanQuery = parsed.query; (around line 604)
// Before: // Build search URL... (around line 619)

// Determine response strategy based on query length
const showFullResults = shouldShowFullResults(cleanQuery);

// Fetch autocomplete suggestions
const suggestions = fetchAutocomplete(cleanQuery, searxngUrl, timeoutSecs);

// Build suggestion items with inherited bang context
const suggestionItems = suggestions.slice(0, 5).map((s) =>
	suggestionToAlfredItem(s, parsed.category, parsed.timeRange)
);

// For short queries, return autocomplete-only response
if (!showFullResults) {
	const items = [...suggestionItems];
	items.push(fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange));
	return { items };
}

// For longer queries, continue to fetch full search results below...
```

Then at the end of the search function, modify result assembly (around line 718-731):

```javascript
// Transform results to Alfred items
const items = data.results.map((result) =>
	resultToAlfredItem(result, cleanQuery, searxngUrl, secretKey, parsed.category, parsed.timeRange)
);

// Add related searches section if we have suggestions
if (suggestionItems.length > 0) {
	items.push(separatorItem("Related searches"));
	items.push(...suggestionItems);
}

// Add fallback item at the end
items.push(fallbackItem(cleanQuery, searxngUrl, parsed.category, parsed.timeRange));
```

**Step 2: Run tests to verify nothing broke**

Run: `npm test`
Expected: All tests PASS

**Step 3: Manual test with Alfred**

Run: `just transfer-changes-TO-local`
Test in Alfred:
- `sx cl` → Should show autocomplete suggestions only (fast)
- `sx climate` → Should show search results + related searches

**Step 4: Commit**

```bash
git add scripts/search.js
git commit -m "feat: integrate autocomplete into search function

- Short queries (≤3 chars): autocomplete only (~176ms)
- Long queries (>3 chars): search results + related searches
- Suggestions inherit bang modifier context

Closes #5"
```

---

## Task 7: Update Tests for Full Integration

**Files:**
- Modify: `tests/autocomplete.test.js`

**Step 1: Re-read search.js and update test extraction**

The test file needs to re-read search.js to get the updated functions. Update the file reading at the top to be done once, and ensure all function extractions work.

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests PASS (78+ existing + new autocomplete tests)

**Step 3: Commit if any test fixes needed**

```bash
git add tests/autocomplete.test.js
git commit -m "test: ensure autocomplete tests work with integrated code

Issue #5"
```

---

## Summary

| Task | Description | Commit |
|------|-------------|--------|
| 1 | parseAutocompleteResponse function + tests | `feat: add parseAutocompleteResponse` |
| 2 | suggestionToAlfredItem function + tests | `feat: add suggestionToAlfredItem` |
| 3 | shouldShowFullResults threshold + tests | `feat: add shouldShowFullResults` |
| 4 | fetchAutocomplete function | `feat: add fetchAutocomplete` |
| 5 | separatorItem function | `feat: add separatorItem` |
| 6 | Integrate into search() | `feat: integrate autocomplete` + Closes #5 |
| 7 | Final test verification | `test: ensure tests work` |

**Total: 7 tasks, ~6 commits**
