#!/usr/bin/env node
/**
 * Unit tests for scriptFilter wrapper
 * Run with: node tests/script-filter.test.js
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract errorItem function from search.js
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);

// Extract errorItem - needed by scriptFilter
const errorItemMatch = searchJs.match(
	/function errorItem\(title, subtitle, arg(?:, text)?\) \{[\s\S]*?return \{[\s\S]*?\};\s*\}/
);
if (!errorItemMatch) {
	throw new Error("Could not find errorItem function in search.js");
}

// Extract scriptFilter
const scriptFilterMatch = searchJs.match(
	/function scriptFilter\(handler\) \{[\s\S]*?return function \(argv\) \{[\s\S]*?\};\s*\}/
);
if (!scriptFilterMatch) {
	throw new Error("Could not find scriptFilter function in search.js");
}

// Evaluate both functions (errorItem first, then scriptFilter which uses it)
// eslint-disable-next-line no-eval
eval(errorItemMatch[0]);
// eslint-disable-next-line no-eval
const scriptFilter = eval(`(${scriptFilterMatch[0]})`);

describe("scriptFilter", () => {
	it("returns valid JSON when handler returns normal object", () => {
		const wrapped = scriptFilter(() => ({ items: [{ title: "test" }] }));
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.deepStrictEqual(parsed, { items: [{ title: "test" }] });
	});

	it("returns valid JSON with empty items when handler returns undefined", () => {
		const wrapped = scriptFilter(() => undefined);
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.ok(parsed.items, "Should have items array");
		assert.strictEqual(parsed.items.length, 0, "Items should be empty");
	});

	it("returns valid JSON with empty items when handler returns null", () => {
		const wrapped = scriptFilter(() => null);
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.ok(parsed.items, "Should have items array");
		assert.strictEqual(parsed.items.length, 0, "Items should be empty");
	});

	it("handles Error throws with message and stack", () => {
		const wrapped = scriptFilter(() => {
			throw new Error("test error");
		});
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.strictEqual(parsed.items.length, 1);
		assert.strictEqual(parsed.items[0].title, "Internal Error");
		assert.strictEqual(parsed.items[0].subtitle, "test error");
		assert.ok(parsed.items[0].text.copy.includes("test error"));
	});

	it("handles string throws", () => {
		const wrapped = scriptFilter(() => {
			throw "string error";
		});
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.strictEqual(parsed.items.length, 1);
		assert.strictEqual(parsed.items[0].title, "Internal Error");
		assert.strictEqual(parsed.items[0].subtitle, "string error");
	});

	it("handles null throws", () => {
		const wrapped = scriptFilter(() => {
			throw null;
		});
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.strictEqual(parsed.items.length, 1);
		assert.strictEqual(parsed.items[0].title, "Internal Error");
		assert.ok(parsed.items[0].subtitle, "Should have a subtitle");
	});

	it("handles object throws without message property", () => {
		const wrapped = scriptFilter(() => {
			throw { code: 42 };
		});
		const result = wrapped([]);
		const parsed = JSON.parse(result);
		assert.strictEqual(parsed.items.length, 1);
		assert.strictEqual(parsed.items[0].title, "Internal Error");
	});
});
