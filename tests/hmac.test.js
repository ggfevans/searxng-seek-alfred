#!/usr/bin/env node
/**
 * Unit tests for HMAC output normalization
 * Run with: node tests/hmac.test.js
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract normalizeHmacOutput function from search.js
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);
const normalizeHmacMatch = searchJs.match(
	/function normalizeHmacOutput\(output\) \{[\s\S]*?return trimmed;\s*\}/
);
if (!normalizeHmacMatch) {
	throw new Error("Could not find normalizeHmacOutput function in search.js");
}
// eslint-disable-next-line no-eval
const normalizeHmacOutput = eval(`(${normalizeHmacMatch[0]})`);

describe("normalizeHmacOutput", () => {
	const expectedHash = "6afeb25a205f6b540cf4efa6a20d12b5e8a3c1d7f9e0b2a4c6d8e0f1a3b5c7d9";

	it("handles macOS LibreSSL format (hash only)", () => {
		const result = normalizeHmacOutput(expectedHash);
		assert.strictEqual(result, expectedHash);
	});

	it("handles macOS LibreSSL format with whitespace", () => {
		const result = normalizeHmacOutput(`  ${expectedHash}  \n`);
		assert.strictEqual(result, expectedHash);
	});

	it("handles OpenSSL SHA2-256 prefixed format", () => {
		const result = normalizeHmacOutput(`SHA2-256(stdin)= ${expectedHash}`);
		assert.strictEqual(result, expectedHash);
	});

	it("handles OpenSSL HMAC-SHA256 prefixed format", () => {
		const result = normalizeHmacOutput(`HMAC-SHA256(stdin)= ${expectedHash}`);
		assert.strictEqual(result, expectedHash);
	});

	it("handles generic openssl dgst format", () => {
		const result = normalizeHmacOutput(`(stdin)= ${expectedHash}`);
		assert.strictEqual(result, expectedHash);
	});

	it("handles prefixed format with trailing whitespace", () => {
		const result = normalizeHmacOutput(`SHA2-256(stdin)= ${expectedHash}  \n`);
		assert.strictEqual(result, expectedHash);
	});

	it("handles prefixed format with leading whitespace", () => {
		const result = normalizeHmacOutput(`  SHA2-256(stdin)= ${expectedHash}`);
		assert.strictEqual(result, expectedHash);
	});

	it("handles empty string gracefully", () => {
		const result = normalizeHmacOutput("");
		assert.strictEqual(result, "");
	});

	it("handles whitespace-only string", () => {
		const result = normalizeHmacOutput("   \n\t  ");
		assert.strictEqual(result, "");
	});

	it("uses lastIndexOf to handle edge case with = in prefix", () => {
		// Hypothetical edge case: if prefix somehow contains "= "
		const result = normalizeHmacOutput(`weird= label= ${expectedHash}`);
		assert.strictEqual(result, expectedHash);
	});
});
