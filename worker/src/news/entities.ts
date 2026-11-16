/**
 * Named entities that show up in finance feeds (Italian accents, quotes, dashes).
 * Numeric references (`&#NNN;` / `&#xHH;`) cover the rest.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  egrave: 'è',
  Egrave: 'È',
  eacute: 'é',
  Eacute: 'É',
  agrave: 'à',
  Agrave: 'À',
  aacute: 'á',
  Aacute: 'Á',
  ograve: 'ò',
  Ograve: 'Ò',
  oacute: 'ó',
  Oacute: 'Ó',
  igrave: 'ì',
  Igrave: 'Ì',
  iacute: 'í',
  Iacute: 'Í',
  ugrave: 'ù',
  Ugrave: 'Ù',
  uacute: 'ú',
  Uacute: 'Ú',
  ccedil: 'ç',
  Ccedil: 'Ç',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  ouml: 'ö',
  Ouml: 'Ö',
  auml: 'ä',
  Auml: 'Ä',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  sbquo: '\u201a',
  bdquo: '\u201e',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  bull: '\u2022',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  laquo: '\u00ab',
  raquo: '\u00bb',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  middot: '\u00b7',
  times: '\u00d7',
  divide: '\u00f7',
  deg: '\u00b0',
  plusmn: '\u00b1',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  iexcl: '\u00a1',
  iquest: '\u00bf',
  szlig: '\u00df',
  oelig: '\u0153',
  OElig: '\u0152',
  scaron: '\u0161',
  Scaron: '\u0160',
  yuml: 'ÿ',
  Yuml: 'Ÿ',
  circ: '\u02c6',
  tilde: '\u02dc',
  lsaquo: '\u2039',
  rsaquo: '\u203a',
  prime: '\u2032',
  Prime: '\u2033',
  larr: '\u2190',
  rarr: '\u2192',
  minus: '\u2212',
  zwnj: '\u200c',
  zwj: '\u200d',
  thinsp: '\u2009',
};

/** Decode XML/HTML entities. Two passes so `&amp;egrave;` becomes `è`. */
export function decodeXmlEntities(input: string): string {
  let current = input;
  for (let pass = 0; pass < 2; pass++) {
    const next = current.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (full, body: string) => {
      if (body.startsWith('#')) {
        const hex = body[1] === 'x' || body[1] === 'X';
        const codePoint = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return full;
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) return full;
        return String.fromCodePoint(codePoint);
      }
      return NAMED_ENTITIES[body] ?? full;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}
