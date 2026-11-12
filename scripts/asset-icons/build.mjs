// Builds the bundled, circular asset icons used by <AssetAvatar />.
//   cd scripts/asset-icons && npm install && npm run build
// Output: assets/asset-icons/<SYMBOL>.png (128×128, transparent outside the
// circle) + src/components/ui/asset-icons.generated.ts + assets/asset-icons/SOURCES.md
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'assets/asset-icons');
const cacheDir = path.join(here, '.cache');
const SIZE = 128;

const pkgDir = (name) => path.join(here, 'node_modules', name);
const CI = pkgDir('cryptocurrency-icons');
const SI = pkgDir('simple-icons');
const W3 = path.join(pkgDir('@web3icons/core'), 'dist/svgs');

const LICENSES = {
  ci: 'cryptocurrency-icons 0.18.1 (spothq) — CC0-1.0',
  w3: '@web3icons/core 4.0.59 (0xa3k5) — MIT',
  si: 'simple-icons 16 — CC0-1.0 (brand marks remain trademarks of their owners)',
  fmp: 'Financial Modeling Prep public logo endpoint (no key) — trademark of the issuer, nominative use only',
};

/** symbol → recipe */
const ICONS = {
  // Crypto — cryptocurrency-icons (already circular)
  BTC: { kind: 'ci', file: 'btc' },
  ETH: { kind: 'ci', file: 'eth' },
  SOL: { kind: 'ci', file: 'sol' },
  XRP: { kind: 'ci', file: 'xrp' },
  LTC: { kind: 'ci', file: 'ltc' },
  XLM: { kind: 'ci', file: 'xlm' },
  DOGE: { kind: 'ci', file: 'doge' },
  ADA: { kind: 'ci', file: 'ada' },
  DOT: { kind: 'ci', file: 'dot' },
  LINK: { kind: 'ci', file: 'link' },
  AVAX: { kind: 'ci', file: 'avax' },
  ATOM: { kind: 'ci', file: 'atom' },
  TRX: { kind: 'ci', file: 'trx' },
  UNI: { kind: 'ci', file: 'uni' },
  AAVE: { kind: 'ci', file: 'aave' },
  BCH: { kind: 'ci', file: 'bch' },
  USDC: { kind: 'ci', file: 'usdc' },
  USDT: { kind: 'ci', file: 'usdt' },
  // Crypto — web3icons "background" variants (cropped to a circle)
  POL: { kind: 'w3', file: 'tokens/background/POL' },
  NEAR: { kind: 'w3', file: 'tokens/background/NEAR' },
  ARB: { kind: 'w3', file: 'networks/background/arbitrum-one' },
  OP: { kind: 'w3', file: 'tokens/background/OP' },
  SUI: { kind: 'w3', file: 'tokens/background/SUI' },
  TON: { kind: 'w3', file: 'networks/background/ton' },
  // Stocks — simple-icons glyph on a brand/light circle
  AAPL: { kind: 'si', slug: 'apple' },
  NVDA: { kind: 'si', slug: 'nvidia' },
  // Stocks/ETFs — issuer logos (FMP), padded on a circle
  MSFT: { kind: 'fmp', ticker: 'MSFT' },
  VWCE: { kind: 'fmp', ticker: 'VWRL.L', note: 'Vanguard (issuer) mark' },
  CSPX: { kind: 'fmp', ticker: 'CSPX.L', note: 'iShares (issuer) mark' },
};

const circleMask = Buffer.from(
  `<svg width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="#fff"/></svg>`,
);
const disc = (fill) =>
  sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: fill } })
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
const toCircle = (buf) =>
  sharp(buf).resize(SIZE, SIZE, { fit: 'cover' }).composite([{ input: circleMask, blend: 'dest-in' }]).png().toBuffer();

async function onDisc(logo, fill, scale) {
  const inner = Math.round(SIZE * scale);
  const fitted = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(await disc(fill))
    .composite([{ input: fitted, gravity: 'centre' }])
    .png()
    .toBuffer();
}

const luminance = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

async function fetchCached(url, name) {
  await mkdir(cacheDir, { recursive: true });
  const file = path.join(cacheDir, name);
  try {
    return await readFile(file);
  } catch {}
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}

async function build(symbol, r) {
  switch (r.kind) {
    case 'ci':
      return toCircle(await readFile(path.join(CI, '128/color', `${r.file}.png`)));
    case 'w3': {
      const mod = await import(path.join(W3, `${r.file}.svg.js`));
      const svg = Object.values(mod).find((v) => typeof v === 'string');
      return toCircle(await sharp(Buffer.from(svg), { density: 600 }).png().toBuffer());
    }
    case 'si': {
      const svg = await readFile(path.join(SI, 'icons', `${r.slug}.svg`), 'utf8');
      const data = JSON.parse(await readFile(path.join(SI, 'data/simple-icons.json'), 'utf8'));
      const list = Array.isArray(data) ? data : data.icons;
      const hex = list.find((i) => (i.slug ?? '') === r.slug)?.hex ?? '000000';
      // Dark brand colours (Apple = black) get a light disc with the brand glyph,
      // otherwise a brand-colour disc with a white glyph.
      const dark = luminance(hex) < 0.15;
      const glyph = svg.replace('<svg ', `<svg fill="${dark ? `#${hex}` : '#ffffff'}" `);
      return onDisc(await sharp(Buffer.from(glyph), { density: 600 }).png().toBuffer(), dark ? '#F4F4F6' : `#${hex}`, 0.56);
    }
    case 'fmp': {
      const raw = await fetchCached(`https://financialmodelingprep.com/image-stock/${r.ticker}.png`, `${r.ticker}.png`);
      const trimmed = await sharp(raw).trim({ threshold: 1 }).png().toBuffer().catch(() => raw);
      const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // Sample the four corners (inset) — a uniform opaque colour means a "tile"
      // logo (Vanguard, iShares) that we re-centre on a disc of that colour;
      // anything else is drawn on a light disc.
      const inset = Math.max(3, Math.round(info.width * 0.05));
      const px = (x, y) => {
        const o = (y * info.width + x) * 4;
        return [data[o], data[o + 1], data[o + 2], data[o + 3]];
      };
      const w = info.width - 1 - inset;
      const h = info.height - 1 - inset;
      const corners = [px(inset, inset), px(w, inset), px(inset, h), px(w, h)];
      const [c0] = corners;
      const uniform = corners.every((c) => c[3] > 240 && c.slice(0, 3).every((v, i) => Math.abs(v - c0[i]) < 12));
      if (!uniform) return onDisc(trimmed, '#F4F4F6', 0.54);
      const fill = `#${c0.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const inner = await sharp(raw)
        .extract({ left: inset, top: inset, width: info.width - 2 * inset, height: info.height - 2 * inset })
        .png()
        .toBuffer();
      const core = await sharp(inner)
        .trim({ background: fill, threshold: 20 })
        .png()
        .toBuffer();
      return onDisc(core, fill, 0.8);
    }
    default:
      throw new Error(`unknown kind for ${symbol}`);
  }
}

await mkdir(outDir, { recursive: true });
const done = [];
for (const [symbol, recipe] of Object.entries(ICONS)) {
  await writeFile(path.join(outDir, `${symbol}.png`), await build(symbol, recipe));
  done.push([symbol, recipe]);
  console.log('✓', symbol);
}

const ts = `// AUTO-GENERATED by scripts/asset-icons/build.mjs — do not edit by hand.
// Each value is a Metro asset module id (bundled, works offline and in Expo Go).
export const ASSET_ICONS: Readonly<Partial<Record<string, number>>> = {
${done.map(([s]) => `  ${s}: require('../../../assets/asset-icons/${s}.png'),`).join('\n')}
};
`;
await writeFile(path.join(root, 'src/components/ui/asset-icons.generated.ts'), ts);

const md = `# Asset icons — sources & licences

Generated by \`scripts/asset-icons/build.mjs\` (128×128 circular PNG).

| Symbol | Source |
| --- | --- |
${done.map(([s, r]) => `| ${s} | ${LICENSES[r.kind]}${r.note ? ` — ${r.note}` : ''} |`).join('\n')}

Company/issuer logos are trademarks of their respective owners and are used only to
identify the holding (nominative use) in a personal app. Unknown stock symbols fall
back to the worker's \`/logo/:symbol\` endpoint, then to the initials badge.
`;
await writeFile(path.join(outDir, 'SOURCES.md'), md);
