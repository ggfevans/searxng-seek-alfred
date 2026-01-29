#!/usr/bin/env node
/**
 * Unit tests for errorItem function
 * Run with: node tests/error-item.test.js
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Extract errorItem function from search.js for testing.
 *
 * WHY THIS APPROACH:
 * - JXA scripts run in JavaScriptCore, not Node.js
 * - No module system (no require/export) in JXA
 * - Can't import functions directly into Node test environment
 */
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);

// Verify getEnv function exists in search.js (presence check only).
// We don't eval the extracted code - we use a test-local mock below instead,
// since JXA's $.getenv is not available in Node.js test environment.
const getEnvMatch = searchJs.match(/function getEnv\(/);
if (!getEnvMatch) {
	throw new Error("Could not find getEnv function in search.js");
}

// Extract errorItem function
// Note: Match with optional 4th parameter (details) to work during TDD transition
const errorItemMatch = searchJs.match(
	/function errorItem\(title, subtitle, arg(?:, details)?\) \{[\s\S]*?return item;\s*\}/
);
if (!errorItemMatch) {
	throw new Error("Could not find errorItem function in search.js");
}

// Mock getEnv for testing (JXA $.getenv not available in Node)
function getEnv(name, defaultValue) {
	const mockEnv = {
		alfred_workflow_version: "1.2.3",
		alfred_version: "5.5",
	};
	return mockEnv[name] || defaultValue || "";
}

// eslint-disable-next-line no-eval
const errorItem = eval(`(${errorItemMatch[0]})`);

describe("errorItem", () => {
	describe("basic functionality", () => {
		it("creates item with title and subtitle", () => {
			const item = errorItem("Error Title", "Error subtitle");
			assert.strictEqual(item.title, "Error Title");
			assert.strictEqual(item.subtitle, "Error subtitle");
		});

		it("is invalid when no arg provided", () => {
			const item = errorItem("Error", "Description");
			assert.strictEqual(item.valid, false);
		});

		it("is valid when arg provided", () => {
			const item = errorItem("Error", "Description", "https://example.com");
			assert.strictEqual(item.valid, true);
			assert.strictEqual(item.arg, "https://example.com");
		});

		it("disables all modifier keys", () => {
			const item = errorItem("Error", "Description");
			assert.strictEqual(item.mods.cmd.valid, false);
			assert.strictEqual(item.mods.alt.valid, false);
			assert.strictEqual(item.mods.ctrl.valid, false);
			assert.strictEqual(item.mods.shift.valid, false);
		});
	});

	describe("debug info (text property)", () => {
		it("includes text property for copy/largetype", () => {
			const item = errorItem("Error", "Description");
			assert.ok(item.text, "Should have text property");
			assert.ok(item.text.copy, "Should have copy text");
			assert.ok(item.text.largetype, "Should have largetype text");
		});

		it("includes title and subtitle in debug info", () => {
			const item = errorItem("Test Error", "Test description");
			assert.ok(item.text.copy.includes("Test Error"));
			assert.ok(item.text.copy.includes("Test description"));
		});

		it("includes workflow version in debug info", () => {
			const item = errorItem("Error", "Description");
			assert.ok(item.text.copy.includes("Workflow:"));
		});

		it("includes Alfred version in debug info", () => {
			const item = errorItem("Error", "Description");
			assert.ok(item.text.copy.includes("Alfred:"));
		});

		it("includes details object when provided", () => {
			const item = errorItem("Error", "Description", null, {
				query: "test query",
				url: "https://example.com",
			});
			assert.ok(item.text.copy.includes("query"));
			assert.ok(item.text.copy.includes("test query"));
		});

		it("handles empty details object", () => {
			const item = errorItem("Error", "Description", null, {});
			assert.ok(item.text.copy, "Should still have copy text");
		});

		it("handles undefined details", () => {
			const item = errorItem("Error", "Description", null, undefined);
			assert.ok(item.text.copy, "Should still have copy text");
		});
	});

	describe("debug info format", () => {
		it("formats details with key: value pairs", () => {
			const item = errorItem("Error", "Desc", null, {
				query: "test",
				url: "https://example.com",
			});
			// Check format: each detail on its own line with indent
			assert.ok(item.text.copy.includes("query: test"));
			assert.ok(item.text.copy.includes("url: https://example.com"));
		});

		it("has consistent copy and largetype content", () => {
			const item = errorItem("Error", "Desc", null, { key: "value" });
			assert.strictEqual(item.text.copy, item.text.largetype);
		});
	});
});
