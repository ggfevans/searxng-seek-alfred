#!/usr/bin/env node
/**
 * Unit tests for parseBool function
 * Run with: node tests/parse-bool.test.js
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract parseBool function from search.js
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);
const parseBoolMatch = searchJs.match(
	/function parseBool\(value, defaultValue = true\) \{[\s\S]*?return lower !== "0" && lower !== "false" && lower !== "no";\s*\}/
);
if (!parseBoolMatch) {
	throw new Error("Could not find parseBool function in search.js");
}
// eslint-disable-next-line no-eval
const parseBool = eval(`(${parseBoolMatch[0]})`);

describe("parseBool", () => {
	describe("truthy values", () => {
		it("returns true for '1'", () => {
			assert.strictEqual(parseBool("1"), true);
		});

		it("returns true for 'true'", () => {
			assert.strictEqual(parseBool("true"), true);
		});

		it("returns true for 'TRUE'", () => {
			assert.strictEqual(parseBool("TRUE"), true);
		});

		it("returns true for 'yes'", () => {
			assert.strictEqual(parseBool("yes"), true);
		});

		it("returns true for 'YES'", () => {
			assert.strictEqual(parseBool("YES"), true);
		});

		it("returns true for any other string", () => {
			assert.strictEqual(parseBool("enabled"), true);
		});
	});

	describe("falsy values", () => {
		it("returns false for '0'", () => {
			assert.strictEqual(parseBool("0"), false);
		});

		it("returns false for 'false'", () => {
			assert.strictEqual(parseBool("false"), false);
		});

		it("returns false for 'FALSE'", () => {
			assert.strictEqual(parseBool("FALSE"), false);
		});

		it("returns false for 'False'", () => {
			assert.strictEqual(parseBool("False"), false);
		});

		it("returns false for 'no'", () => {
			assert.strictEqual(parseBool("no"), false);
		});

		it("returns false for 'NO'", () => {
			assert.strictEqual(parseBool("NO"), false);
		});
	});

	describe("empty/undefined values - uses default", () => {
		it("returns default true for empty string", () => {
			assert.strictEqual(parseBool(""), true);
		});

		it("returns default true for null", () => {
			assert.strictEqual(parseBool(null), true);
		});

		it("returns default true for undefined", () => {
			assert.strictEqual(parseBool(undefined), true);
		});

		it("returns custom default false for empty string", () => {
			assert.strictEqual(parseBool("", false), false);
		});

		it("returns custom default false for null", () => {
			assert.strictEqual(parseBool(null, false), false);
		});

		it("returns custom default false for undefined", () => {
			assert.strictEqual(parseBool(undefined, false), false);
		});
	});

	describe("case insensitivity", () => {
		it("handles mixed case 'FaLsE'", () => {
			assert.strictEqual(parseBool("FaLsE"), false);
		});

		it("handles mixed case 'No'", () => {
			assert.strictEqual(parseBool("No"), false);
		});

		it("handles mixed case 'TrUe'", () => {
			assert.strictEqual(parseBool("TrUe"), true);
		});
	});
});
