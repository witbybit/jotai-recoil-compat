import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { createStore } from 'jotai/vanilla';
import type { ReactNode } from 'react';
import { RecoilRoot, atom, atomFamily, DefaultValue, useRecoilState, useRecoilValue, type AtomEffect } from '../index';

const wrapper = ({ children }: { children: ReactNode }) => <RecoilRoot>{children}</RecoilRoot>;

function localStorageEffect<T>(storage: Map<string, string>): AtomEffect<T> {
  return ({ node, setSelf, onSet }) => {
    const saved = storage.get(node.key);
    if (saved != null) setSelf(JSON.parse(saved));
    onSet((newValue, _old, isReset) => {
      if (isReset) storage.delete(node.key);
      else storage.set(node.key, JSON.stringify(newValue));
    });
  };
}

describe('atom effects', () => {
  it('initialise synchronously with setSelf (no default flash) and persist with onSet', () => {
    const storage = new Map([['fx/persist', '"saved"']]);
    const a = atom({ key: 'fx/persist', default: 'default', effects: [localStorageEffect<string>(storage)] });
    const renders: string[] = [];
    const { result } = renderHook(
      () => {
        const s = useRecoilState(a);
        renders.push(s[0]);
        return s;
      },
      { wrapper },
    );
    expect(renders[0]).toBe('saved');
    act(() => result.current[1]('changed'));
    expect(storage.get('fx/persist')).toBe('"changed"');
    act(() => result.current[1](new DefaultValue() as any));
    expect(storage.has('fx/persist')).toBe(false);
    expect(result.current[0]).toBe('default');
  });

  it('runs once per store, with storeID and trigger', () => {
    const effect = vi.fn();
    const a = atom({ key: 'fx/once', default: 0, effects: [(p) => effect(p.storeID, p.trigger)] });
    const s1 = createStore();
    const s2 = createStore();
    s1.get(a);
    s1.get(a);
    s1.set(a, 1);
    s2.set(a, 2);
    expect(effect).toHaveBeenCalledTimes(2);
    expect(effect.mock.calls[0][1]).toBe('get');
    expect(effect.mock.calls[1][1]).toBe('set');
    expect(effect.mock.calls[0][0]).not.toBe(effect.mock.calls[1][0]);
  });

  it('does not call an effect\'s own onSet for its setSelf, but calls other effects', () => {
    const ownOnSet = vi.fn();
    const otherOnSet = vi.fn();
    let setSelf!: (v: number) => void;
    const a = atom({
      key: 'fx/own',
      default: 0,
      effects: [
        (p) => {
          setSelf = p.setSelf as any;
          p.onSet(ownOnSet);
        },
        (p) => p.onSet(otherOnSet),
      ],
    });
    const store = createStore();
    store.get(a);
    setSelf(5);
    expect(store.get(a)).toBe(5);
    expect(ownOnSet).not.toHaveBeenCalled();
    expect(otherOnSet).toHaveBeenCalledWith(5, 0, false);
    store.set(a, 6);
    expect(ownOnSet).toHaveBeenCalledWith(6, 5, false);
  });

  it('supports async setSelf (atom pending until resolved) and later subscriptions', async () => {
    let push!: (v: string) => void;
    const a = atom<string>({
      key: 'fx/async',
      default: 'default',
      effects: [
        ({ setSelf }) => {
          setSelf(Promise.resolve('remote'));
          push = (v) => setSelf(v);
        },
      ],
    });
    function Show() {
      return <div>{useRecoilValue(a)}</div>;
    }
    const { Suspense } = await import('react');
    await act(async () => {
      render(
        <RecoilRoot>
          <Suspense fallback={<div>loading</div>}>
            <Show />
          </Suspense>
        </RecoilRoot>,
      );
    });
    expect(await screen.findByText('remote')).toBeTruthy();
    act(() => push('pushed'));
    expect(screen.getByText('pushed')).toBeTruthy();
  });

  it('setSelf with updater during init sees the default; resetSelf resets', () => {
    let reset!: () => void;
    const a = atom({
      key: 'fx/updater',
      default: 10,
      effects: [
        ({ setSelf, resetSelf }) => {
          setSelf((v) => (v as number) + 1);
          reset = resetSelf;
        },
      ],
    });
    const store = createStore();
    expect(store.get(a)).toBe(11);
    reset();
    expect(store.get(a)).toBe(10);
  });

  it('runs cleanups when the RecoilRoot unmounts', async () => {
    const cleanup = vi.fn();
    const a = atom({ key: 'fx/cleanup', default: 0, effects: [() => cleanup] });
    function Show() {
      return <div>{useRecoilValue(a)}</div>;
    }
    const { unmount } = render(
      <RecoilRoot>
        <Show />
      </RecoilRoot>,
    );
    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    await Promise.resolve();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('effects can read other atoms via getLoadable / getPromise', async () => {
    const source = atom({ key: 'fx/read/source', default: 'src' });
    const a = atom({
      key: 'fx/read',
      default: '',
      effects: [({ setSelf, getLoadable }) => setSelf(`copy of ${getLoadable(source).getValue()}`)],
    });
    expect(createStore().get(a)).toBe('copy of src');
  });

  it('atomFamily effects receive the parameter', () => {
    const fam = atomFamily<string, number>({
      key: 'fx/fam',
      default: '',
      effects: (id) => [({ setSelf }) => setSelf(`id=${id}`)],
    });
    expect(createStore().get(fam(7))).toBe('id=7');
  });
});
