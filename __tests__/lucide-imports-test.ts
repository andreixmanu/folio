// Metro types `require` as returning `any` and does not include `@types/node`.
const fs = require('fs') as {
  readFileSync(filePath: string, encoding: 'utf8'): string;
  readdirSync(dir: string, options: { withFileTypes: true }): FsDirent[];
};

const path = require('path') as {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
};

type FsDirent = { name: string; isDirectory(): boolean };

const cwd = (process as unknown as { cwd(): string }).cwd();
const SRC_ROOT = path.join(cwd, 'src');

/** Drop comments so a mention in a comment is not treated as an import. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

/**
 * A clause is type-only when it is `import type` / `export type`, or a named
 * list whose every specifier is inline `type` (`import { type LucideIcon }`).
 */
function isTypeOnlyClause(clause: string): boolean {
  const body = clause.trim();
  if (/^type\b/.test(body)) return true;
  const braced = body.match(/^\{([\s\S]*)\}$/);
  if (!braced) return false;
  const parts = braced[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\b/.test(part));
}

/** Runtime imports of the bare `lucide-react-native` specifier. Deep icon paths are allowed. */
function runtimeBarrelImports(source: string): string[] {
  const text = stripComments(source);
  const hits: string[] = [];

  if (/(?:^|[^\w.])import\s+['"]lucide-react-native['"]/.test(text)) {
    hits.push("import 'lucide-react-native'");
  }

  const dynamic = /\b(?:import|require)\s*\(\s*['"]lucide-react-native['"]\s*\)/g;
  if (dynamic.test(text)) hits.push("import()/require('lucide-react-native')");

  const statement = /(import|export)\s+(type\s+)?([^;'"]*?)\s+from\s+['"]lucide-react-native['"]/g;
  for (const match of text.matchAll(statement)) {
    const typeKeyword = match[2] != null;
    const clause = match[3] ?? '';
    if (typeKeyword || isTypeOnlyClause(clause)) continue;
    hits.push(match[0].replace(/\s+/g, ' ').trim());
  }

  return hits;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

describe('lucide imports', () => {
  test('no file under src runtime-imports the lucide-react-native barrel', () => {
    const offenders = sourceFiles(SRC_ROOT).flatMap((file) => {
      const hits = runtimeBarrelImports(fs.readFileSync(file, 'utf8'));
      if (hits.length === 0) return [];
      return [`${path.relative(cwd, file)}: ${hits.join(' | ')}`];
    });

    expect(offenders).toEqual([]);
  });
});
