#!/usr/bin/env node
/**
 * jotai-recoil-compat CLI
 *
 *   npx jotai-recoil-compat check   [paths...]            report Recoil usage & compatibility
 *   npx jotai-recoil-compat migrate [paths...] [--dry-run] rewrite 'recoil' imports
 *
 * No dependencies; works on .js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts files.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACKAGE_NAME = 'jotai-recoil-compat';

/** Every runtime export of `recoil@0.7.x`, all provided by jotai-recoil-compat. */
export const SUPPORTED_EXPORTS = [
  'DefaultValue',
  'RecoilEnv',
  'RecoilLoadable',
  'RecoilRoot',
  'Snapshot',
  'MutableSnapshot',
  'atom',
  'atomFamily',
  'constSelector',
  'errorSelector',
  'isRecoilValue',
  'noWait',
  'readOnlySelector',
  'retentionZone',
  'selector',
  'selectorFamily',
  'snapshot_UNSTABLE',
  'useGetRecoilValueInfo_UNSTABLE',
  'useGotoRecoilSnapshot',
  'useRecoilBridgeAcrossReactRoots_UNSTABLE',
  'useRecoilCallback',
  'useRecoilRefresher_UNSTABLE',
  'useRecoilSnapshot',
  'useRecoilState',
  'useRecoilStateLoadable',
  'useRecoilState_TRANSITION_SUPPORT_UNSTABLE',
  'useRecoilStoreID',
  'useRecoilTransactionObserver_UNSTABLE',
  'useRecoilTransaction_UNSTABLE',
  'useRecoilValue',
  'useRecoilValueLoadable',
  'useRecoilValueLoadable_TRANSITION_SUPPORT_UNSTABLE',
  'useRecoilValue_TRANSITION_SUPPORT_UNSTABLE',
  'useResetRecoilState',
  'useRetain',
  'useSetRecoilState',
  'waitForAll',
  'waitForAllSettled',
  'waitForAny',
  'waitForNone',
];

/** Type-only exports of recoil (TS code often imports these without `type`). */
export const SUPPORTED_TYPES = [
  'AtomEffect',
  'AtomFamilyOptions',
  'AtomOptions',
  'CachePolicyWithoutEquality',
  'CallbackInterface',
  'EvictionPolicy',
  'GetCallback',
  'GetRecoilValue',
  'Loadable',
  'ReadOnlySelectorFamilyOptions',
  'ReadOnlySelectorOptions',
  'ReadWriteSelectorFamilyOptions',
  'ReadWriteSelectorOptions',
  'RecoilBridge',
  'RecoilRootProps',
  'RecoilState',
  'RecoilValue',
  'RecoilValueReadOnly',
  'ResetRecoilState',
  'Resetter',
  'SelectorCallbackInterface',
  'SerializableParam',
  'SetRecoilState',
  'SetterOrUpdater',
  'SnapshotID',
  'StoreID',
  'TransactionInterface_UNSTABLE',
  'UnwrapLoadable',
  'UnwrapLoadables',
  'UnwrapRecoilValue',
  'UnwrapRecoilValueLoadables',
  'UnwrapRecoilValues',
  'WrappedValue',
];

/** APIs that work but behave slightly differently from Recoil. */
export const NOTES = {
  useRecoilBridgeAcrossReactRoots_UNSTABLE: 'works by passing the Jotai store to the other root.',
  useRetain: 'no-op: values are garbage collected normally.',
  retentionZone: 'no-op: values are garbage collected normally.',
  useRecoilSnapshot: 're-renders after a microtask (batched), not synchronously with the change.',
  useRecoilTransactionObserver_UNSTABLE: 'notified after a microtask (batched).',
  useGetRecoilValueInfo_UNSTABLE: 'best effort: `subscribers` is always empty.',
};

const MODULE_SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+|\b(?:mock|doMock|unmock|requireActual|importActual|requireMock|importMock)\s*\(\s*)(['"])recoil\2/g;

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out', '.turbo']);

export function* walk(target) {
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return;
  }
  if (stats.isFile()) {
    if (EXTENSIONS.has(extname(target)) && !target.endsWith('.d.ts')) yield target;
    return;
  }
  if (!stats.isDirectory()) return;
  for (const entry of readdirSync(target)) {
    if (IGNORED_DIRS.has(entry)) continue;
    yield* walk(join(target, entry));
  }
}

/** Rewrites `'recoil'` module specifiers. Returns the new source and the number of replacements. */
export function rewriteSource(source, to = PACKAGE_NAME) {
  let count = 0;
  const output = source.replace(MODULE_SPECIFIER, (_m, prefix, quote) => {
    count++;
    return `${prefix}${quote}${to}${quote}`;
  });
  return { output, count };
}

/** Finds names imported from 'recoil' (or from `moduleName`) in a source file. */
export function analyzeSource(source, moduleName = 'recoil') {
  const esc = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = new Set();
  const problems = [];
  const named = new RegExp(`import\\s+(?:type\\s+)?(?:([\\w$]+)\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${esc}['"]`, 'g');
  const namespace = new RegExp(`import\\s+\\*\\s+as\\s+([\\w$]+)\\s+from\\s*['"]${esc}['"]`, 'g');
  const defaultImport = new RegExp(`import\\s+([\\w$]+)\\s+from\\s*['"]${esc}['"]`, 'g');
  const requireDestructure = new RegExp(`\\{([^}]*)\\}\\s*=\\s*require\\(\\s*['"]${esc}['"]\\s*\\)`, 'g');
  const reexport = new RegExp(`export\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]${esc}['"]`, 'g');

  const addList = (list, isTypeOnlyStatement) => {
    for (const raw of list.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const isType = isTypeOnlyStatement || part.startsWith('type ');
      const name = part.replace(/^type\s+/, '').split(/\s+as\s+|\s*:\s*/)[0].trim();
      if (name && !isType) names.add(name);
    }
  };
  const namespaces = [];
  for (const m of source.matchAll(named)) {
    if (m[1]) namespaces.push(m[1]);
    addList(m[2], /^import\s+type\b/.test(m[0]));
  }
  for (const m of source.matchAll(reexport)) addList(m[1], /^export\s+type\b/.test(m[0]));
  for (const m of source.matchAll(requireDestructure)) addList(m[1], false);
  for (const m of source.matchAll(namespace)) namespaces.push(m[1]);
  for (const m of source.matchAll(defaultImport)) if (m[1] !== 'type') namespaces.push(m[1]);
  for (const nsName of namespaces) {
    const ns = nsName.replace(/\$/g, '\\$');
    for (const use of source.matchAll(new RegExp(`(?<![\\w$.])${ns}\\.([\\w$]+)`, 'g'))) names.add(use[1]);
  }
  if (/from\s*['"](recoil-sync|recoil-relay|@recoiljs\/[\w-]+)['"]/.test(source)) {
    problems.push('uses a Recoil add-on (recoil-sync / recoil-relay / @recoiljs/*), which is not provided');
  }
  return { names, problems };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--') && !a.includes('=')));
  const opts = Object.fromEntries(
    rest.filter((a) => a.startsWith('--') && a.includes('=')).map((a) => a.slice(2).split('=')),
  );
  const paths = rest.filter((a) => !a.startsWith('--'));
  return { command, flags, opts, paths: paths.length ? paths : ['.'] };
}

function runCheck(paths, moduleName) {
  const usage = new Map();
  const problems = [];
  let files = 0;
  for (const p of paths) {
    for (const file of walk(p)) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes(moduleName)) continue;
      const { names, problems: fileProblems } = analyzeSource(src, moduleName);
      if (!names.size && !fileProblems.length) continue;
      files++;
      for (const n of names) usage.set(n, (usage.get(n) ?? 0) + 1);
      for (const pr of fileProblems) problems.push(`${relative(process.cwd(), file)}: ${pr}`);
    }
  }
  const unsupported = [...usage.keys()].filter((n) => !SUPPORTED_EXPORTS.includes(n) && !SUPPORTED_TYPES.includes(n));
  console.log(`\nScanned for imports from '${moduleName}': ${files} file(s), ${usage.size} distinct API(s).\n`);
  for (const [name, count] of [...usage.entries()].sort((a, b) => b[1] - a[1])) {
    const status = unsupported.includes(name) ? '✗ unsupported' : NOTES[name] ? '~ note' : '✓';
    console.log(`  ${status.padEnd(14)} ${name} (${count} file${count > 1 ? 's' : ''})${NOTES[name] ? ` – ${NOTES[name]}` : ''}`);
  }
  if (problems.length) {
    console.log('\nProblems:');
    for (const p of problems) console.log(`  ✗ ${p}`);
  }
  const ok = !unsupported.length && !problems.length;
  console.log(
    ok
      ? `\n✓ Everything you use is supported. Run \`npx ${PACKAGE_NAME} migrate\` (or alias 'recoil' to '${PACKAGE_NAME}').\n`
      : `\n✗ Some usages need attention (see above).\n`,
  );
  return ok ? 0 : 1;
}

function runMigrate(paths, dryRun, to) {
  let changedFiles = 0;
  let total = 0;
  for (const p of paths) {
    for (const file of walk(p)) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('recoil')) continue;
      const { output, count } = rewriteSource(src, to);
      if (!count) continue;
      changedFiles++;
      total += count;
      console.log(`${dryRun ? '[dry-run] ' : ''}${relative(process.cwd(), file)}: ${count} import(s)`);
      if (!dryRun) writeFileSync(file, output);
    }
  }
  console.log(
    `\n${dryRun ? 'Would rewrite' : 'Rewrote'} ${total} import(s) in ${changedFiles} file(s) from 'recoil' to '${to}'.`,
  );
  if (!dryRun && changedFiles) {
    console.log(`Next: npm uninstall recoil && npm install ${PACKAGE_NAME} jotai`);
  }
  return 0;
}

const HELP = `Usage:
  npx ${PACKAGE_NAME} check   [paths...]             Report which Recoil APIs you use and whether they're supported
  npx ${PACKAGE_NAME} migrate [paths...] [--dry-run]  Rewrite imports of 'recoil' to '${PACKAGE_NAME}'

Options:
  --dry-run         Show what would change without writing files
  --to=<module>     Module to rewrite to (default: ${PACKAGE_NAME})
  --module=<name>   Module to analyse with "check" (default: recoil)

Paths default to the current directory. node_modules, dist, build and .git are skipped.
Zero-code-change alternative: "recoil": "npm:${PACKAGE_NAME}@^1" in package.json.`;

export function main(argv) {
  const { command, flags, opts, paths } = parseArgs(argv);
  switch (command) {
    case 'check':
      return runCheck(paths, opts.module ?? 'recoil');
    case 'migrate':
      return runMigrate(paths, flags.has('--dry-run'), opts.to ?? PACKAGE_NAME);
    default:
      console.log(HELP);
      return command && command !== 'help' && command !== '--help' ? 1 : 0;
  }
}

const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
