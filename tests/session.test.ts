import { describe, expect, it } from 'vitest';
import { getActiveMs, initialSession, sessionReducer } from '../src/utils/session';
import { countWords, estimateReadingMinutes, formatDuration, formatReadingTime, splitParagraphs } from '../src/utils/textMetrics';

describe('session metrics', () => {
  it('counts only active time across pause/resume', () => {
    let s = sessionReducer(initialSession, { type: 'start', now: 1_000 });
    expect(s.status).toBe('running');
    expect(getActiveMs(s, 61_000)).toBe(60_000);

    s = sessionReducer(s, { type: 'pause', now: 61_000 });
    expect(s.status).toBe('paused');
    expect(getActiveMs(s, 500_000)).toBe(60_000); // paused time is not counted

    s = sessionReducer(s, { type: 'resume', now: 500_000 });
    expect(getActiveMs(s, 530_000)).toBe(90_000);

    s = sessionReducer(s, { type: 'reset' });
    expect(s).toEqual(initialSession);
    expect(getActiveMs(s, 999_999)).toBe(0);
  });

  it('ignores invalid transitions', () => {
    const idle = initialSession;
    expect(sessionReducer(idle, { type: 'pause', now: 5 })).toBe(idle);
    expect(sessionReducer(idle, { type: 'resume', now: 5 })).toBe(idle);
    const running = sessionReducer(idle, { type: 'start', now: 0 });
    expect(sessionReducer(running, { type: 'start', now: 10 })).toBe(running);
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});

describe('text metrics', () => {
  it('counts Turkish words including apostrophe suffixes and hyphenated words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords('Işık hızı çok yüksek.')).toBe(4);
    expect(countWords('Ankara’ya gittik, e-posta gönderdik — 2026 yılında!')).toBe(6);
  });

  it('estimates reading time at the default 180 wpm', () => {
    expect(estimateReadingMinutes(0)).toBe(0);
    expect(estimateReadingMinutes(360)).toBe(2);
    expect(formatReadingTime(0.4)).toBe('1 dk’dan az');
    expect(formatReadingTime(2)).toBe('2 dk');
    expect(formatReadingTime(75)).toBe('1 sa 15 dk');
  });

  it('splits paragraphs on blank lines and keeps single newlines', () => {
    expect(splitParagraphs('A\nB\n\n\nC\r\n\r\nD')).toEqual(['A\nB', 'C', 'D']);
    expect(splitParagraphs('')).toEqual([]);
  });
});
