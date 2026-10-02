import { describe, it, expect } from 'vitest';
import * as recoil from 'recoil';
import * as compat from '../index';
// @ts-expect-error untyped .mjs
import { SUPPORTED_EXPORTS, SUPPORTED_TYPES, analyzeSource, rewriteSource } from '../../bin/jotai-recoil-compat.mjs';

describe('export parity', () => {
  const recoilRuntime = Object.keys(recoil).filter((k) => k !== 'default' && k !== '__esModule');

  it('exports every runtime API of recoil, with the same kind', () => {
    for (const name of recoilRuntime) {
      expect(compat, name).toHaveProperty(name);
      expect(typeof (compat as any)[name], name).toBe(typeof (recoil as any)[name]);
    }
  });

  it('has a default export like recoil', () => {
    for (const name of recoilRuntime) expect((compat.default as any)[name], name).toBe((compat as any)[name]);
  });

  it('CLI knows every recoil runtime export', () => {
    expect([...SUPPORTED_EXPORTS].sort()).toEqual(
      [...new Set([...recoilRuntime, 'Snapshot', 'MutableSnapshot'])].sort(),
    );
    for (const name of SUPPORTED_EXPORTS) expect(compat, name).toHaveProperty(name);
    expect(SUPPORTED_TYPES.length).toBeGreaterThan(20);
  });
});

describe('CLI', () => {
  it('rewrites all recoil module specifiers and nothing else', () => {
    const src = [
      `import { atom, selector } from 'recoil';`,
      `import type { RecoilState } from "recoil";`,
      `export { useRecoilValue } from 'recoil';`,
      `import * as R from 'recoil';`,
      `const r = require('recoil');`,
      `const lazy = await import('recoil');`,
      `jest.mock('recoil', () => ({}));`,
      `vi.mock("recoil");`,
      `const actual = jest.requireActual('recoil');`,
      `import 'recoil';`,
      `import x from 'recoil-sync';`,
      `const s = 'recoil';`,
    ].join('\n');
    const { output, count } = rewriteSource(src);
    expect(count).toBe(10);
    expect(output).toContain(`from 'jotai-recoil-compat';`);
    expect(output).toContain(`from "jotai-recoil-compat";`);
    expect(output).toContain(`require('jotai-recoil-compat')`);
    expect(output).toContain(`import('jotai-recoil-compat')`);
    expect(output).toContain(`jest.mock('jotai-recoil-compat'`);
    expect(output).toContain(`vi.mock("jotai-recoil-compat")`);
    expect(output).toContain(`import 'jotai-recoil-compat';`);
    expect(output).toContain(`from 'recoil-sync'`);
    expect(output).toContain(`const s = 'recoil';`);
  });

  it('analyses imported names, namespaces, default imports and add-ons', () => {
    const { names, problems } = analyzeSource(
      [
        `import { atom, selector as sel, type RecoilState, RecoilValue } from 'recoil';`,
        `import type { Loadable } from 'recoil';`,
        `import * as R from 'recoil';`,
        `import Recoil from 'recoil';`,
        `R.useRecoilValue(x); Recoil.waitForAll([]); foo.R.bar;`,
        `import { syncEffect } from 'recoil-sync';`,
      ].join('\n'),
    );
    expect([...names].sort()).toEqual(['RecoilValue', 'atom', 'selector', 'useRecoilValue', 'waitForAll']);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/recoil-sync/);
  });
});
