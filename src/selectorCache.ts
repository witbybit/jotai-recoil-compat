import type { AnyAtom } from './core';
import type { CachePolicyWithoutEquality } from './types';

export type CacheResult = { ok: true; value: unknown } | { ok: false; error: unknown };

interface Branch {
  dep: AnyAtom;
  children: Map<unknown, Branch | Leaf>;
  parent?: Branch;
  parentKey?: unknown;
}

interface Leaf {
  leaf: true;
  result: CacheResult;
  parent?: Branch;
  parentKey?: unknown;
}

const isLeaf = (n: Branch | Leaf): n is Leaf => 'leaf' in n;

/**
 * Selector result cache keyed on dependency values, like Recoil's. Because a
 * selector is deterministic, the next dependency it reads is fully determined
 * by the values of the ones read before it, so entries form a tree:
 * each branch node names a dependency, and its children are keyed by that
 * dependency's value.
 *
 * This is what gives Recoil's behaviour of not re-running a selector (e.g.
 * not re-fetching) when its inputs return to values seen before.
 */
export class SelectorCache {
  private root: Branch | Leaf | undefined;
  private readonly leaves = new Set<Leaf>();
  private readonly policy: CachePolicyWithoutEquality;

  constructor(policy: CachePolicyWithoutEquality | undefined) {
    this.policy = policy ?? { eviction: 'keep-all' };
  }

  lookup(get: (a: AnyAtom) => unknown): CacheResult | undefined {
    let node = this.root;
    while (node && !isLeaf(node)) {
      let value: unknown;
      try {
        value = get(node.dep);
      } catch {
        return undefined;
      }
      node = node.children.get(value);
    }
    if (!node) return undefined;
    if (this.policy.eviction === 'lru') {
      this.leaves.delete(node);
      this.leaves.add(node);
    }
    return node.result;
  }

  insert(deps: ReadonlyArray<readonly [AnyAtom, unknown]>, result: CacheResult): void {
    if (this.policy.eviction === 'most-recent') this.clear();
    const leaf: Leaf = { leaf: true, result };
    if (deps.length === 0) {
      this.clear();
      this.root = leaf;
      this.leaves.add(leaf);
      return;
    }
    if (!this.root || isLeaf(this.root)) {
      this.clear();
      this.root = { dep: deps[0][0], children: new Map() };
    }
    let node: Branch = this.root;
    for (let i = 0; i < deps.length; i++) {
      const [dep, value] = deps[i];
      // Dependency order differs from a previous evaluation: the selector is
      // not deterministic, so don't cache this result.
      if (node.dep !== dep) return;
      const child = node.children.get(value);
      if (i === deps.length - 1) {
        if (child && !isLeaf(child)) return;
        if (child) this.leaves.delete(child);
        leaf.parent = node;
        leaf.parentKey = value;
        node.children.set(value, leaf);
        this.leaves.add(leaf);
      } else if (!child) {
        const next: Branch = { dep: deps[i + 1][0], children: new Map(), parent: node, parentKey: value };
        node.children.set(value, next);
        node = next;
      } else if (isLeaf(child)) {
        return;
      } else {
        node = child;
      }
    }
    if (this.policy.eviction === 'lru') {
      const maxSize = Math.max(1, this.policy.maxSize);
      while (this.leaves.size > maxSize) {
        this.remove(this.leaves.values().next().value as Leaf);
      }
    }
  }

  private remove(leaf: Leaf): void {
    this.leaves.delete(leaf);
    let node: Branch | Leaf = leaf;
    while (node.parent) {
      const parent: Branch = node.parent;
      parent.children.delete(node.parentKey);
      if (parent.children.size > 0) return;
      node = parent;
    }
    if (node === this.root) this.root = undefined;
  }

  clear(): void {
    this.root = undefined;
    this.leaves.clear();
  }

  /** @internal for tests */
  get size(): number {
    return this.leaves.size;
  }
}
