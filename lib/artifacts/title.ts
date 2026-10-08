// The first line of a build is "// title: <words>". Spec 3.4.
export function cleanTitle(raw: string): string | null {
	const words = raw
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 5);
	const title = Array.from(words.join(" ")).slice(0, 60).join("").trim();
	return title === "" ? null : title;
}

// Only a complete first line counts: the title is read once its newline has arrived, and only at the start of the text (as save.ts reads it).
export function partialTitle(source: string): string | null {
	const m = /^[ \t]*\/\/ title:[ \t]*([^\n]*)\n/.exec(source.slice(0, 400));
	return m ? cleanTitle(m[1]) : null;
}
