import { describe, it, expect, beforeEach } from 'vitest';
import { atom, clearAtomRegistry, getAtomByKey } from '../atom';

describe('atom', () => {
  beforeEach(() => {
    clearAtomRegistry();
  });

  it('should create an atom with a key', () => {
    const testAtom = atom({
      key: 'testAtom',
      default: 'test value',
    });

    expect(testAtom.key).toBe('testAtom');
  });

  it('should return the same atom for the same key', () => {
    const testAtom1 = atom({
      key: 'testAtom',
      default: 'test value',
    });

    const testAtom2 = atom({
      key: 'testAtom',
      default: 'different value',
    });

    expect(testAtom1).toBe(testAtom2);
  });

  it('should store atoms in registry', () => {
    const testAtom = atom({
      key: 'testAtom',
      default: 'test value',
    });

    const retrieved = getAtomByKey('testAtom');
    expect(retrieved).toBe(testAtom);
  });

  it('should create different atoms for different keys', () => {
    const atom1 = atom({
      key: 'atom1',
      default: 'value1',
    });

    const atom2 = atom({
      key: 'atom2',
      default: 'value2',
    });

    expect(atom1).not.toBe(atom2);
    expect(atom1.key).toBe('atom1');
    expect(atom2.key).toBe('atom2');
  });
});
