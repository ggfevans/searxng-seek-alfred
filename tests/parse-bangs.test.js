#!/usr/bin/env node
/**
 * Unit tests for parseBangs function
 * Run with: node tests/parse-bangs.test.js
 *
 * parseBangs extracts category and time range modifiers from search queries.
 * Category bangs: !i/!images (images), !n/!news (news), !v/!videos (videos), !maps (maps)
 * Time range bangs: !d (day), !m (month), !y (year)
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

// Extract parseBangs function from search.js via regex.
// NOTE: This extraction approach is fragile - it depends on the function ending
// with a closing brace on its own line. If parseBangs is reformatted or contains
// nested structures that break this pattern, the regex will fail. This is a
// trade-off for testing pure functions in a JXA codebase that can't use ES modules.
// Future refactor: move parseBangs to a standalone module that both search.js
// and tests can import directly. See CLAUDE.md "Future Structure" section.
const searchJs = fs.readFileSync(
	path.join(__dirname, "../scripts/search.js"),
	"utf-8"
);
const parseBangsMatch = searchJs.match(
	/function parseBangs\(query\) \{[\s\S]*?\n\}/
);
if (!parseBangsMatch) {
	throw new Error("Could not find parseBangs function in search.js");
}
// eslint-disable-next-line no-eval
const parseBangs = eval(`(${parseBangsMatch[0]})`);

describe("parseBangs", () => {
	describe("category bangs - images", () => {
		it("parses !i for images", () => {
			const result = parseBangs("!i cats");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "cats");
		});

		it("parses !images for images", () => {
			const result = parseBangs("!images cats");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "cats");
		});
	});

	describe("category bangs - news", () => {
		it("parses !n for news", () => {
			const result = parseBangs("!n elections");
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.query, "elections");
		});

		it("parses !news for news", () => {
			const result = parseBangs("!news elections");
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.query, "elections");
		});
	});

	describe("category bangs - videos", () => {
		it("parses !v for videos", () => {
			const result = parseBangs("!v tutorial");
			assert.strictEqual(result.category, "videos");
			assert.strictEqual(result.query, "tutorial");
		});

		it("parses !videos for videos", () => {
			const result = parseBangs("!videos tutorial");
			assert.strictEqual(result.category, "videos");
			assert.strictEqual(result.query, "tutorial");
		});
	});

	describe("category bangs - maps", () => {
		it("parses !maps for maps (no short form)", () => {
			const result = parseBangs("!maps coffee shops");
			assert.strictEqual(result.category, "maps");
			assert.strictEqual(result.query, "coffee shops");
		});
	});

	describe("time range bangs", () => {
		it("parses !d for day time range", () => {
			const result = parseBangs("!d breaking news");
			assert.strictEqual(result.timeRange, "day");
			assert.strictEqual(result.query, "breaking news");
		});

		it("parses !m for month time range", () => {
			const result = parseBangs("!m quarterly report");
			assert.strictEqual(result.timeRange, "month");
			assert.strictEqual(result.query, "quarterly report");
		});

		it("parses !y for year time range", () => {
			const result = parseBangs("!y annual review");
			assert.strictEqual(result.timeRange, "year");
			assert.strictEqual(result.query, "annual review");
		});
	});

	describe("combined bangs - category and time range", () => {
		it("parses category and time range together", () => {
			const result = parseBangs("!n !d breaking story");
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.timeRange, "day");
			assert.strictEqual(result.query, "breaking story");
		});

		it("parses time range before category", () => {
			const result = parseBangs("!y !images landscape");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.timeRange, "year");
			assert.strictEqual(result.query, "landscape");
		});

		it("parses bangs in reverse order", () => {
			const result = parseBangs("!m !v documentary");
			assert.strictEqual(result.category, "videos");
			assert.strictEqual(result.timeRange, "month");
			assert.strictEqual(result.query, "documentary");
		});
	});

	describe("position flexibility", () => {
		it("parses bang at start of query", () => {
			const result = parseBangs("!i sunset photos");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "sunset photos");
		});

		it("parses bang at end of query", () => {
			const result = parseBangs("sunset photos !i");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "sunset photos");
		});

		it("parses bang in middle of query", () => {
			const result = parseBangs("sunset !i photos");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "sunset photos");
		});

		it("parses multiple bangs scattered in query", () => {
			const result = parseBangs("latest !n technology !y updates");
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.timeRange, "year");
			assert.strictEqual(result.query, "latest technology updates");
		});
	});

	describe("case insensitivity", () => {
		it("parses uppercase !I for images", () => {
			const result = parseBangs("!I mountains");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "mountains");
		});

		it("parses uppercase !IMAGES for images", () => {
			const result = parseBangs("!IMAGES mountains");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "mountains");
		});

		it("parses mixed case !Images for images", () => {
			const result = parseBangs("!Images mountains");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "mountains");
		});

		it("parses uppercase !N for news", () => {
			const result = parseBangs("!N headlines");
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.query, "headlines");
		});

		it("parses uppercase !D for day", () => {
			const result = parseBangs("!D events");
			assert.strictEqual(result.timeRange, "day");
			assert.strictEqual(result.query, "events");
		});

	});

	describe("unknown bangs", () => {
		it("preserves unknown bang !foo in query", () => {
			const result = parseBangs("!foo search term");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.timeRange, undefined);
			assert.strictEqual(result.query, "!foo search term");
		});

		it("preserves unknown bang !g in query", () => {
			const result = parseBangs("!g google search");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.timeRange, undefined);
			assert.strictEqual(result.query, "!g google search");
		});

		it("processes known bang and preserves unknown bang", () => {
			const result = parseBangs("!i !xyz test");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "!xyz test");
		});
	});

	describe("word boundary matching", () => {
		it("does not match !i in the middle of a word like 'exciting'", () => {
			const result = parseBangs("exciting news");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.query, "exciting news");
		});

		it("does not match !n in the middle of a word like 'inner'", () => {
			const result = parseBangs("inner peace");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.query, "inner peace");
		});

		it("does not match !d in the middle of a word like 'monday'", () => {
			const result = parseBangs("monday meeting");
			assert.strictEqual(result.timeRange, undefined);
			assert.strictEqual(result.query, "monday meeting");
		});

		it("does not match !v in the middle of a word like 'innovative'", () => {
			const result = parseBangs("innovative ideas");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.query, "innovative ideas");
		});

		it("matches !i as standalone word at start", () => {
			const result = parseBangs("!i exciting photos");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "exciting photos");
		});

		it("matches !i as standalone word after another word", () => {
			const result = parseBangs("find !i exciting");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "find exciting");
		});
	});

	describe("edge cases - empty and minimal queries", () => {
		it("handles empty query", () => {
			const result = parseBangs("");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.timeRange, undefined);
			assert.strictEqual(result.query, "");
		});

		it("handles query with only a category bang", () => {
			const result = parseBangs("!i");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "");
		});

		it("handles query with only a time bang", () => {
			const result = parseBangs("!d");
			assert.strictEqual(result.timeRange, "day");
			assert.strictEqual(result.query, "");
		});

		it("handles query with only category and time bangs", () => {
			const result = parseBangs("!i !d");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.timeRange, "day");
			assert.strictEqual(result.query, "");
		});

		it("handles query with no bangs", () => {
			const result = parseBangs("regular search query");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.timeRange, undefined);
			assert.strictEqual(result.query, "regular search query");
		});

		it("handles whitespace-only query", () => {
			const result = parseBangs("   ");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.timeRange, undefined);
			assert.strictEqual(result.query, "");
		});
	});

	describe("edge cases - duplicate bangs", () => {
		it("later-defined bang in categoryBangs wins when multiple present", () => {
			const result = parseBangs("!i !n search");
			// The effective category is determined by iteration order of categoryBangs
			// in parseBangs (see scripts/search.js). Since !n is defined after !i,
			// and both match, !n's value ("news") becomes the final category.
			// Note: "!n !i search" would also result in "news" for the same reason.
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.query, "search");
		});

		it("later-defined bang in timeRangeBangs wins when multiple present", () => {
			const result = parseBangs("!d !m search");
			// The effective timeRange is determined by iteration order of timeRangeBangs
			// in parseBangs. Since !m is defined after !d, !m's value wins.
			assert.strictEqual(result.timeRange, "month");
			assert.strictEqual(result.query, "search");
		});

		it("handles multiple duplicates of same bang", () => {
			const result = parseBangs("!i !i cats");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "cats");
		});
	});

	describe("edge cases - special characters and formatting", () => {
		it("handles query with special characters", () => {
			const result = parseBangs("!n c++ programming");
			assert.strictEqual(result.category, "news");
			assert.strictEqual(result.query, "c++ programming");
		});

		it("handles query with numbers", () => {
			const result = parseBangs("!i 2024 photos");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "2024 photos");
		});

		it("handles multiple spaces between words", () => {
			const result = parseBangs("!i    multiple   spaces");
			assert.strictEqual(result.category, "images");
			assert.strictEqual(result.query, "multiple  spaces");
		});

		it("handles bang followed immediately by text (no match)", () => {
			// "!images" is a valid bang, but "!imagesearch" is not
			const result = parseBangs("!imagesearch query");
			assert.strictEqual(result.category, undefined);
			assert.strictEqual(result.query, "!imagesearch query");
		});
	});

	describe("return structure", () => {
		it("returns object with query, category, and timeRange properties", () => {
			const result = parseBangs("!i !d test");
			assert.ok(Object.hasOwn(result, "query"));
			assert.ok(Object.hasOwn(result, "category"));
			assert.ok(Object.hasOwn(result, "timeRange"));
		});

		it("returns undefined (not null) for unset category", () => {
			const result = parseBangs("test query");
			assert.strictEqual(result.category, undefined);
		});

		it("returns undefined (not null) for unset timeRange", () => {
			const result = parseBangs("test query");
			assert.strictEqual(result.timeRange, undefined);
		});
	});
});
