import { WORDS_TEXT } from "./words-data";

// Real words, most common first, so a word's index says how common it is (0 is "you").
export const WORD_LIST: readonly string[] = WORDS_TEXT.split(" ");
const RANK = new Map(WORD_LIST.map((word, i) => [word, i]));

export const isKnownWord = (word: string): boolean => RANK.has(word);

// Words not in the list count as rarer than any that are.
export const wordRank = (word: string): number => RANK.get(word) ?? WORD_LIST.length;
