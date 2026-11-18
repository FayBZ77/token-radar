// Token Radar: the hand-in program for make.fun's token-radar-01 (Node 22, standard library only).
//
// It reads the sealed DefiLlama snapshot, scores every protocol with the peer-multiple model in
// lib/model.ts, and writes the entry to the output directory:
//   board.json    the ranked board the gate reads (watchlist covered, ranks 1..N, a plan per row)
//   data.js       the same board as one script, which the dashboard renders with no network
//   dashboard/    this repository's static page, copied across
//   screenshots/  this repository's three dashboard screenshots, copied across
//   dossier.json  the judge's summary, written last with the vendored make.fun library, so the
//                 scorer rebuilds it from the same files and finds the same bytes
//
// In the grader the snapshot is /input/snapshot.json and the output is /output. Outside it:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
// The program is deterministic: two runs over the same snapshot write the same bytes.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildBoard, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The dossier's caps, as the scorer's reference states them; only the text cap shapes bytes. */
const DOSSIER_CAPS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
} as const;

/** A screenshot's name, as the dossier accepts one. */
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--name value` or `--name=value` from the arguments, else the fallback. */
function option(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` && i + 1 < args.length) return args[i + 1]!;
    if (args[i]!.startsWith(`--${name}=`)) return args[i]!.slice(name.length + 3);
  }
  return fallback;
}

/** Stop with the reason on stderr and a non-zero exit. */
function fail(message: string): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(1);
}

// --- the snapshot ---------------------------------------------------------------------------

const inputArg = option('input', process.env.MAKEFUN_INPUT_DIR ?? '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed input`);
}
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));

// --- the board ------------------------------------------------------------------------------

const { board, data } = buildBoard(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

// --- the output -----------------------------------------------------------------------------

const outDir = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(data));

/** Copy a directory tree's regular files, in name order, skipping dot names at every level. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) copied.push(...copyTree(src, dst).map((n) => `${name}/${n}`));
    else if (statSync(src).isFile()) {
      copyFileSync(src, dst);
      copied.push(name);
    }
  }
  return copied;
}

const pageFiles = copyTree(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
if (!pageFiles.includes('index.html')) fail('dashboard/ holds no index.html to hand in');

const shots = copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ holds ${shots.length} images: hand in 3 or 4, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

// The dossier goes last: it is built from the dashboard and screenshots now in place.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_CAPS));

process.stdout.write(
  `token-radar: snapshot of ${snapshot.as_of}: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist\n` +
    `token-radar: board of ${board.length} pre-token rows ranked, ${data.counts.live_rows} already-trading protocols scored alongside, ` +
    `$${data.counts.total_implied_usd.toLocaleString('en-US')} of implied pre-token value\n` +
    `token-radar: wrote board.json, data.js, dashboard/ (${pageFiles.length} files), screenshots/ (${shots.length} images) and dossier.json to ${outDir}\n`,
);
