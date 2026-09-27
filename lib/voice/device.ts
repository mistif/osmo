// A readable name for the device that taught a voiceprint, from the browser's user agent: "Windows · Chrome".

export function deviceLabel(userAgent: string): string {
	const system = /iPhone/.test(userAgent)
		? "iPhone"
		: /iPad/.test(userAgent)
			? "iPad"
			: /Android/.test(userAgent)
				? "Android"
				: /Windows/.test(userAgent)
					? "Windows"
					: /Macintosh|Mac OS X/.test(userAgent)
						? "Mac"
						: /Linux/.test(userAgent)
							? "Linux"
							: "Unknown device";
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /OPR\//.test(userAgent)
			? "Opera"
			: /Firefox\//.test(userAgent)
				? "Firefox"
				: /CriOS\/|Chrome\//.test(userAgent)
					? "Chrome"
					: /Safari\//.test(userAgent)
						? "Safari"
						: "Browser";
	return `${system} · ${browser}`;
}
