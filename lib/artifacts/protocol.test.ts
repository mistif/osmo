import { describe, expect, it } from "vitest";
import { BUILD_ERRORS, createLineReader, encodeLine, type BuildLine } from "./protocol";

function collect() {
	const got: BuildLine[] = [];
	return { got, reader: createLineReader((l) => got.push(l)) };
}

describe("encodeLine", () => {
	it("is one JSON object and a newline", () => {
		expect(encodeLine({ t: "delta", s: "a\nb" })).toBe(String.raw`{"t":"delta","s":"a\nb"}` + "\n");
		expect(encodeLine({ t: "done", tokens: 5 })).toBe('{"t":"done","tokens":5}\n');
	});
});
describe("createLineReader", () => {
	it("joins a line split across chunks", () => {
		const { got, reader } = collect();
		reader.push('{"t":"delta","s":"a"}\n{"t":"do');
		expect(got).toEqual([{ t: "delta", s: "a" }]);
		reader.push('ne","tokens":5}\n');
		expect(got).toEqual([{ t: "delta", s: "a" }, { t: "done", tokens: 5 }]);
	});
	it("skips garbage, unknown kinds and unknown error codes", () => {
		const { got, reader } = collect();
		reader.push('not json\n{"t":"zap"}\n{"t":"error","code":"nope"}\n{"t":"delta"}\n{"t":"done","tokens":"x"}\n[]\n\n');
		expect(got).toEqual([]);
		reader.push('{"t":"error","code":"too_big"}\n');
		expect(got).toEqual([{ t: "error", code: "too_big" }]);
	});
	it("accepts every named error code", () => {
		const { got, reader } = collect();
		for (const code of BUILD_ERRORS) reader.push(JSON.stringify({ t: "error", code }) + "\n");
		expect(got.length).toBe(BUILD_ERRORS.length);
	});
	it("holds a final line that has no newline", () => {
		const { got, reader } = collect();
		reader.push('{"t":"done","tokens":5}');
		expect(got).toEqual([]);
	});
	it("handles several lines in one chunk and a CRLF ending", () => {
		const { got, reader } = collect();
		reader.push('{"t":"delta","s":"x"}\r\n{"t":"delta","s":"y"}\n');
		expect(got.map((l) => (l.t === "delta" ? l.s : ""))).toEqual(["x", "y"]);
	});
});
