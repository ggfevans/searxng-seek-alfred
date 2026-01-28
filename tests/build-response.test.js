#!/usr/bin/env node
/**
 * Unit tests for buildResponse function
 * Run with: node tests/build-response.test.js
 */

const assert = require("node:assert");
const { describe, it, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract buildResponse function and CONFIG from search.js
// We need to create a mock CONFIG that buildResponse references
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);

// Extract the buildResponse function (matches: cacheSeconds > 0)
const buildResponseMatch = searchJs.match(
	/function buildResponse\(items, cacheSeconds\) \{[\s\S]*?cacheSeconds > 0[\s\S]*?return response;\s*\}/
);
if (!buildResponseMatch) {
	throw new Error("Could not find buildResponse function in search.js");
}

// Create a mock CONFIG that we can manipulate in tests
let mockConfig = { enableResultCache: true };

// Create buildResponse that uses our mock CONFIG
const buildResponse = eval(`(function(CONFIG) {
	return ${buildResponseMatch[0]};
})(mockConfig)`);

describe("buildResponse", () => {
	beforeEach(() => {
		mockConfig.enableResultCache = true;
	});

	describe("caching enabled", () => {
		it("includes cache when cacheSeconds provided", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, 60);
			assert.deepStrictEqual(result, {
				items: [{ title: "test" }],
				cache: {
					seconds: 60,
					loosereload: true,
				},
			});
		});

		it("uses loosereload for background refresh", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, 30);
			assert.strictEqual(result.cache.loosereload, true);
		});

		it("respects custom cache duration", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, 120);
			assert.strictEqual(result.cache.seconds, 120);
		});
	});

	describe("caching disabled via config", () => {
		beforeEach(() => {
			mockConfig.enableResultCache = false;
		});

		it("excludes cache when config disabled", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, 60);
			assert.deepStrictEqual(result, {
				items: [{ title: "test" }],
			});
			assert.strictEqual(result.cache, undefined);
		});
	});

	describe("no cache seconds provided", () => {
		it("excludes cache when cacheSeconds is undefined", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items);
			assert.deepStrictEqual(result, {
				items: [{ title: "test" }],
			});
			assert.strictEqual(result.cache, undefined);
		});

		it("excludes cache when cacheSeconds is 0", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, 0);
			assert.deepStrictEqual(result, {
				items: [{ title: "test" }],
			});
			assert.strictEqual(result.cache, undefined);
		});

		it("excludes cache when cacheSeconds is null", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, null);
			assert.deepStrictEqual(result, {
				items: [{ title: "test" }],
			});
			assert.strictEqual(result.cache, undefined);
		});

		it("excludes cache when cacheSeconds is negative", () => {
			const items = [{ title: "test" }];
			const result = buildResponse(items, -30);
			assert.deepStrictEqual(result, {
				items: [{ title: "test" }],
			});
			assert.strictEqual(result.cache, undefined);
		});
	});

	describe("items passthrough", () => {
		it("passes through empty items array", () => {
			const result = buildResponse([], 60);
			assert.deepStrictEqual(result.items, []);
		});

		it("passes through multiple items", () => {
			const items = [
				{ title: "first" },
				{ title: "second" },
				{ title: "third" },
			];
			const result = buildResponse(items, 60);
			assert.deepStrictEqual(result.items, items);
		});

		it("preserves complex item structure", () => {
			const items = [{
				title: "Test Result",
				subtitle: "example.com",
				arg: "https://example.com",
				icon: { path: "icon.png" },
				mods: {
					alt: { arg: "alt-action" },
				},
			}];
			const result = buildResponse(items, 60);
			assert.deepStrictEqual(result.items, items);
		});
	});
});
