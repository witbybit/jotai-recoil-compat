import { describe, it, expect } from 'vitest';
import { stableStringify } from '../stableStringify';

// Expected outputs match Recoil's own stableStringify.
describe('stableStringify', () => {
  it('matches Recoil formatting', () => {
    expect(stableStringify(undefined)).toBe('');
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(1.5)).toBe('1.5');
    expect(stableStringify('abc')).toBe('"abc"');
    expect(stableStringify('a"b')).toBe('"a\\"b"');
    expect(stableStringify([1, 'a', [true]])).toBe('[1,"a",[true]]');
    expect(stableStringify({ b: 1, a: [2], c: undefined })).toBe('{"a":[2],"b":1}');
    expect(stableStringify(new Set([3, 1, 2]))).toBe('[1,2,3]');
    expect(stableStringify(new Map<unknown, unknown>([['k', 1], [2, 'v']]))).toBe('{"2":"v","k":1}');
    expect(stableStringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
    expect(() => stableStringify(() => 1)).toThrow();
    expect(stableStringify(function named() {}, { allowFunctions: true })).toBe('__FUNCTION(named)__');
  });
});
