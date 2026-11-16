/**
 * Stable merchant keys. The same shop should group together whether the bank
 * writes "PAGAMENTO POS ESSELUNGA 123 MILANO" or "Esselunga S.p.A.".
 */

import { counterpartyRaw, type Transaction } from './model';

const NOISE = new Set([
  'pos',
  'carta',
  'pagamento',
  'debito',
  'credito',
  'contactless',
  'visa',
  'mastercard',
  'maestro',
  'nexi',
  'pin',
  'sdd',
  'sepa',
  'addebito',
  'diretto',
  'direct',
  'debit',
  'srl',
  'spa',
  'sas',
  'snc',
  'sarl',
  'gmbh',
  'ltd',
  'inc',
  'bv',
  'www',
  'city',
  'express',
  'market',
  'supermercato',
  'supermarket',
  'drive',
  'paypal',
  'pp',
]);

/** Dropped only from the end, and only while another token remains. */
const TRAILING = new Set([
  'milano',
  'roma',
  'torino',
  'napoli',
  'bologna',
  'firenze',
  'genova',
  'venezia',
  'palermo',
  'bari',
  'verona',
  'padova',
  'trieste',
  'bergamo',
  'brescia',
  'modena',
  'parma',
  'catania',
  'messina',
  'mi',
  'rm',
  'to',
  'na',
  'bo',
  'fi',
  'ge',
  've',
  'pa',
  'ba',
  'it',
  'com',
  'eu',
  'net',
  'org',
  'de',
  'fr',
  'uk',
  'io',
  'italia',
  'italy',
  'payments',
  'payment',
  'se',
  'sa',
  'ag',
  'energia',
  'energy',
  'servizi',
  'service',
  'services',
  'mktp',
  'stazione',
  'carburante',
  'benzina',
  'servito',
]);

const DISPLAY: Record<string, string> = {
  atm: 'ATM',
  atac: 'ATAC',
  eni: 'Eni',
  ikea: 'IKEA',
  'h&m': 'H&M',
  iliad: 'Iliad',
  dazn: 'DAZN',
  q8: 'Q8',
  ip: 'IP',
  uci: 'UCI',
  tim: 'TIM',
  a2a: 'A2A',
  'now tv': 'NOW TV',
  chatgpt: 'ChatGPT',
  openai: 'OpenAI',
  icloud: 'iCloud',
  'youtube premium': 'YouTube Premium',
  'amazon prime': 'Amazon Prime',
  'disney+': 'Disney+',
  easyjet: 'easyJet',
  mcfit: 'McFit',
  mcdonalds: "McDonald's",
  windtre: 'WindTre',
  freenow: 'FreeNow',
  mycicero: 'MyCicero',
  'ita airways': 'ITA Airways',
  ryanair: 'Ryanair',
  glovo: 'Glovo',
  paypal: 'PayPal',
  'google one': 'Google One',
  tv: 'TV',
};

const PARTICLE = new Set(['del', 'della', 'dei', 'di', 'da', 'e', 'de']);

/** Lowercase, strip accents, turn punctuation into spaces. Keeps `+` and `&`. */
export function foldLight(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens split on anything that is not a letter, digit, `+`, or `&`. */
export function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9+&]+/).filter(Boolean);
}

/** Word-boundary phrase match. `bar` does not match `barbiere` or `barilla`. */
export function containsPhrase(text: string, phrase: string): boolean {
  const hay = tokenize(text);
  const needle = tokenize(phrase);
  if (needle.length === 0 || hay.length < needle.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i += 1) {
    let found = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (hay[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return true;
  }
  return false;
}

function isReferenceCode(token: string): boolean {
  return /^(?=.*[a-z])(?=.*\d)[a-z0-9]{4,}$/.test(token);
}

function canonicalize(key: string): string {
  if (!key) return '';
  if (/\b(amazon|amzn)\b/.test(key) && /\bprime\b/.test(key)) return 'amazon prime';
  if (/\bprime video\b/.test(key)) return 'amazon prime';
  if (/\b(amzn|amazon)\b/.test(key)) return 'amazon';
  if (/\bicloud\b/.test(key) || (/\bapple\b/.test(key) && /\bbill\b/.test(key))) return 'icloud';
  if (/\bgoogle one\b/.test(key)) return 'google one';
  if (/\byoutube premium\b/.test(key)) return 'youtube premium';
  if (/\bdisney\+|disney plus\b/.test(key)) return 'disney+';
  if (/\bnowtv\b|\bnow tv\b/.test(key)) return 'now tv';
  if (/\bmycicero\b|\bmy cicero\b/.test(key)) return 'mycicero';
  if (/\bfreenow\b|\bfree now\b/.test(key)) return 'freenow';
  if (/\bwindtre\b|\bwind tre\b/.test(key)) return 'windtre';
  if (/\bjusteat\b|\bjust eat\b/.test(key)) return 'just eat';
  if (/\bburger king\b/.test(key)) return 'burger king';
  if (/\beasyjet\b|\beasy jet\b/.test(key)) return 'easyjet';
  if (/\bvirgin active\b/.test(key)) return 'virgin active';
  if (/\bmcfit\b|\bmc fit\b/.test(key)) return 'mcfit';
  if (/\bthe space\b/.test(key)) return 'the space';
  if (/\bh&m\b|\bh & m\b/.test(key)) return 'h&m';
  if (/\bmcdonalds\b|\bmc donalds\b/.test(key)) return 'mcdonalds';
  if (/\bchatgpt\b|\bchat gpt\b/.test(key)) return 'chatgpt';
  if (/\bopenai\b|\bopen ai\b/.test(key)) return 'openai';
  if (/\bita airways\b/.test(key)) return 'ita airways';
  if (/\bsteamgames\b|\bsteam games\b/.test(key)) return 'steam';
  return key;
}

/**
 * Stable grouping key: lowercase, no accents, no POS/card/legal/city noise,
 * store numbers removed (`esselunga 123` → `esselunga`).
 */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = foldLight(raw);
  text = text.replace(/\bs\s+p\s+a\b/g, ' ');
  text = text.replace(/\bs\s+r\s+l\b/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  let tokens = text.split(' ').filter(Boolean);
  while (tokens[0] === 'paypal' || tokens[0] === 'pp') tokens.shift();
  tokens = tokens.filter((token) => !NOISE.has(token));
  const deduped: string[] = [];
  for (const token of tokens) {
    if (deduped[deduped.length - 1] !== token) deduped.push(token);
  }
  tokens = deduped;
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1] ?? '';
    if (TRAILING.has(last) || /^\d+$/.test(last) || isReferenceCode(last)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return canonicalize(tokens.join(' '));
}

/** Title-case display name. Known brands keep their usual spelling. */
export function displayMerchant(raw: string | null | undefined): string {
  const key = normalizeMerchant(raw);
  if (!key) return '';
  const known = DISPLAY[key];
  if (known) return known;
  return key
    .split(' ')
    .map((word, index) => {
      const special = DISPLAY[word];
      if (special) return special;
      if (index > 0 && PARTICLE.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

type MerchantSource = Pick<
  Transaction,
  'amount' | 'creditorName' | 'debtorName' | 'remittanceInformation' | 'merchantKey'
>;

/**
 * Key used to group and categorise. An explicit `merchantKey` wins; otherwise
 * the counterparty, then the remittance when the bank left the name empty.
 */
export function merchantKeyFor(tx: MerchantSource): string {
  const explicit = tx.merchantKey?.trim();
  if (explicit) return explicit;
  const fromName = normalizeMerchant(counterpartyRaw(tx));
  if (fromName) return fromName;
  return normalizeMerchant(tx.remittanceInformation);
}
