// Request contract shared by the browser client and the backend validator.
export const AI_ACTION_IDS = ['summarize', 'simplify', 'key-ideas', 'study-notes', 'ask'] as const;
export type AiActionId = (typeof AI_ACTION_IDS)[number];

export const MAX_TEXT_CHARS = 24_000;
export const MAX_QUESTION_CHARS = 1_000;
