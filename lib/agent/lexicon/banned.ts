// Swear words and slurs. Recognized (never "corrected"), but never offered as a typo guess
// and never defined in a lookup, so a slip of the keyboard can't turn into one.
export const BANNED_WORDS: ReadonlySet<string> = new Set([
	"fuck", "fucking", "fucked", "fucker", "shit", "shitty", "bitch", "bitches", "cunt", "dick", "dicks", "cock", "pussy",
	"slut", "whore", "fag", "fags", "faggot", "nigger", "nigga", "niggas", "retard", "retarded", "spic", "chink", "kike",
	"tranny", "twat", "wanker", "bastard", "asshole", "motherfucker", "dyke", "coon", "gook", "wetback", "raghead",
]);
