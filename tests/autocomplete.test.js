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
		const item = suggestionToAlfredItem("events", "news", "month");
		assert.strictEqual(item.subtitle, "Search news (past month) for this suggestion");
	});

	it("includes variables for bang context", () => {
		const item = suggestionToAlfredItem("test", "images", "month");
		assert.deepStrictEqual(item.variables, {
			category: "images",
			timeRange: "month"
		});
	});

	it("omits variables when no bang context", () => {
		const item = suggestionToAlfredItem("test", null, null);
		assert.strictEqual(item.variables, undefined);
	});
});

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
			assert.strictEqual(shouldShowFullResults("  ab  "), false); // 2 chars after trim
		});
	});
});
