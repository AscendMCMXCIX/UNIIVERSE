/** Types for ./refused-words-list.mjs (Matchup Intel's one list of refused words, read by TypeScript and by the Production check's plain Node). */
export declare const REFUSED_WORDS: ReadonlyArray<{ why: string; words: readonly string[] }>;
export declare const REFUSED_FLAGS: string;
export declare function refusedSource(word: string): string;
export declare function refusedSources(list?: ReadonlyArray<{ why: string; words: readonly string[] }>): Array<{ word: string; why: string; source: string }>;
