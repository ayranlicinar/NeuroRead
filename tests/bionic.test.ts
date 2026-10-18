import { describe, expect, it } from 'vitest';
import { boldLength, segmentsToString, toBionicSegments } from '../src/utils/bionic';

describe('Bionic Reading', () => {
  it('round-trips Turkish text, punctuation, whitespace and newlines exactly', () => {
    const samples = [
      'Işık, ılık süt içtiğimizde; çağrı “öğüt” verdi!',
      'İSTANBUL’da ÇĞÖŞÜ büyük harfler…\n\nYeni paragraf\tsekme  çift boşluk',
      '  Baştaki boşluk ve sondaki   \n',
      'Sayılar 2026 ve %45, e-posta: ornek@alan.com — tire',
      'Emoji 👍🏽 ve birleşik ç (ç) karakter',
      '',
      '...?!',
    ];
    for (const s of samples) {
      expect(segmentsToString(toBionicSegments(s, 0.4))).toBe(s);
    }
  });

  it('bolds the beginning of Turkish words without splitting letters', () => {
    const segs = toBionicSegments('Çiğdem ışığı', 0.5);
    const words = segs.filter((s) => s.type === 'word');
    expect(words).toEqual([
      { type: 'word', bold: 'Çiğ', rest: 'dem' },
      { type: 'word', bold: 'ışı', rest: 'ğı' },
    ]);
  });

  it('keeps punctuation and apostrophe suffixes outside of bold parts', () => {
    const segs = toBionicSegments('Ankara’ya, gittim.', 0.4);
    expect(segs.map((s) => (s.type === 'word' ? `[${s.bold}|${s.rest}]` : s.value)).join('')).toBe('[An|kara]’[y|a], [gi|ttim].');
  });

  it('keeps combining marks attached to their base letter', () => {
    const segs = toBionicSegments('çok', 0.3);
    const word = segs[0];
    expect(word.type).toBe('word');
    if (word.type === 'word') expect(word.bold).toBe('ç');
  });

  it('uses a configurable ratio with sane bounds', () => {
    expect(boldLength(1, 0.4)).toBe(1);
    expect(boldLength(3, 0.9)).toBe(1);
    expect(boldLength(10, 0.2)).toBe(2);
    expect(boldLength(10, 0.6)).toBe(6);
    expect(boldLength(10, 5)).toBe(8); // clamped to 0.8
    expect(boldLength(10, Number.NaN)).toBe(4); // default 0.4
    expect(boldLength(2, 0.8)).toBe(1);
  });

  it('does not modify the source string', () => {
    const original = 'Değişmeyen metin.';
    const copy = original.slice();
    toBionicSegments(original, 0.7);
    expect(original).toBe(copy);
  });
});
