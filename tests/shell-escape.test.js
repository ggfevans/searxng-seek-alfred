#!/usr/bin/env node
/**
 * Unit tests for shellEscape function
 * Run with: node tests/shell-escape.test.js
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract shellEscape function from search.js
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);
const shellEscapeMatch = searchJs.match(
	/function shellEscape\(str\) \{[\s\S]*?return [^}]+\}/
);
if (!shellEscapeMatch) {
	throw new Error("Could not find shellEscape function in search.js");
}
// eslint-disable-next-line no-eval
const shellEscape = eval(`(${shellEscapeMatch[0]})`);

describe("shellEscape", () => {
	it("handles empty string", () => {
		const result = shellEscape("");
		assert.strictEqual(result, "''", "Empty string should become ''");
	});

	it("handles simple string without special characters", () => {
		const result = shellEscape("hello");
		assert.strictEqual(result, "'hello'");
	});

	it("handles single quote", () => {
		const result = shellEscape("'");
		assert.strictEqual(
			result,
			"''\\'''",
			"Single quote should be escaped as '\\''"
		);
	});

	it("handles double quote", () => {
		const result = shellEscape('"');
		assert.strictEqual(
			result,
			"'\"'",
			"Double quote needs no escaping inside single quotes"
		);
	});

	it("handles dollar sign", () => {
		const result = shellEscape("$VAR");
		assert.strictEqual(
			result,
			"'$VAR'",
			"Dollar sign is safe inside single quotes"
		);
	});

	it("handles backticks", () => {
		const result = shellEscape("`cmd`");
		assert.strictEqual(
			result,
			"'`cmd`'",
			"Backticks are safe inside single quotes"
		);
	});

	it("handles string starting with dash", () => {
		const result = shellEscape("-foo");
		assert.strictEqual(
			result,
			"'-foo'",
			"Leading dash is wrapped in quotes"
		);
	});

	it("handles multiple special characters combined", () => {
		const result = shellEscape("test'$`\"value");
		assert.strictEqual(
			result,
			"'test'\\''$`\"value'",
			"Only single quotes need escaping"
		);
	});

	it("handles URL with query parameters", () => {
		const url = "https://example.com/search?q=test&foo=bar";
		const result = shellEscape(url);
		assert.strictEqual(result, `'${url}'`);
	});

	it("handles URL with single quote in query", () => {
		const url = "https://example.com/search?q=it's";
		const result = shellEscape(url);
		assert.strictEqual(result, "'https://example.com/search?q=it'\\''s'");
	});
});
