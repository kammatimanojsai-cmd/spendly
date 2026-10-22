// Turns noisy OCR text from a receipt into a suggested transaction.
// Pure and deterministic so it can be unit-tested; the OCR itself (tesseract.js) runs in the browser.

import { daysInMonth, fromParts, type ISODate } from './dates.ts';

export interface ReceiptGuess {
  total: number | null;          // major units (e.g. rupees), not minor
  date: ISODate | null;
  merchant: string | null;
  categoryHint: string | null;   // a default category name, if the merchant looks familiar
  confidence: 'high' | 'medium' | 'low';
  amounts: number[];             // other candidate amounts, largest first, for a quick pick list
}

const TOTAL_WORDS = /(grand\s*total|net\s*(amount|payable|total)|amount\s*(due|payable|paid)|total\s*(amount|due|payable|inr|rs)?|bill\s*amount|to\s*pay|balance\s*due)/i;
const NOT_TOTAL = /(sub\s*-?\s*total|total\s*(items?|qty|quantity|savings?|discount|tax|gst)|discount|you\s*saved|change|tendered|cash\s*paid|round\s*off|cgst|sgst|igst|vat)/i;
const SKIP_MERCHANT = /(tax\s*invoice|invoice|receipt|bill\s*no|gstin|gst|phone|ph[:.]|tel|mob|www\.|https?:|date|time|cashier|table|order|token|thank|welcome|^\W*$)/i;

// "1,299.00" "1299" "₹ 1 299.50" "Rs.450/-"; OCR often reads O for 0 and , for . in decimals
const AMOUNT_RE = /(?:₹|rs\.?|inr|\$|€|£)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d%])/gi;
// lines that carry identifiers, not money
const ID_LINE = /\b(ph|phone|tel|mob(ile)?|gstin|fssai|cin|pan|bill\s*no|invoice\s*no|order\s*(no|id)|txn|upi\s*ref|card\s*no|a\/c)\b/i;
const DATE_LIKE = /\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b|\b\d{1,2}[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s,-]*\d{2,4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s.-]*\d{1,2},?[\s-]*\d{2,4}\b|\b\d{1,2}:\d{2}(:\d{2})?\b/gi;

function toNumber(raw: string) {
  let s = raw.replace(/\s/g, '');
  // a trailing ",dd" is a decimal comma; other commas are thousands separators
  if (/,\d{1,2}$/.test(s) && !/\./.test(s)) s = s.replace(/,(\d{1,2})$/, '.$1');
  s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function amountsIn(line: string): number[] {
  if (ID_LINE.test(line)) return [];
  // common OCR confusions inside numbers: O->0, l/I/|->1, S->5 ; then drop dates and times
  const fixed = line
    .replace(/(?<=\d)[oO](?=[\d.,]|\b)/g, '0')
    .replace(/(?<=[\d₹])[lI|](?=[\d.,])/g, '1')
    .replace(/(?<=\d)[S](?=\d)/g, '5')
    .replace(DATE_LIKE, ' ');
  const out: number[] = [];
  for (const m of fixed.matchAll(AMOUNT_RE)) {
    const n = toNumber(m[1]);
    // drop things that are clearly not prices: years, phone/bill numbers, percentages
    if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) continue;
    if (/^\d{4}$/.test(m[1]) && n >= 1990 && n <= 2100 && !/[.,]/.test(m[1])) continue;
    if (/^\d{7,}$/.test(m[1].replace(/\D/g, '')) && !/[.,]\d{1,2}$/.test(m[1])) continue;
    out.push(Math.round(n * 100) / 100);
  }
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function validDate(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return fromParts(y, m, d);
}

export function findDate(text: string): ISODate | null {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) { const r = validDate(+m[1], +m[2], +m[3]); if (r) return r; }
  // Indian/European order first: dd/mm/yyyy
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const r = validDate(+m[3], +m[2], +m[1]) ?? validDate(+m[3], +m[1], +m[2]);
    if (r) return r;
  }
  m = text.match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i);
  if (m) { const r = validDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]); if (r) return r; }
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[\s.-]*(\d{1,2}),?[\s-]*(\d{2,4})\b/i);
  if (m) { const r = validDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]); if (r) return r; }
  return null;
}

const MERCHANT_CATEGORIES: [RegExp, string][] = [
  [/swiggy|zomato|domino|pizza|burger|kfc|mcdonald|cafe|coffee|starbucks|restaurant|biryani|kitchen|bakery|chai|food/i, 'Food & dining'],
  [/big\s*bazaar|dmart|d-mart|reliance\s*fresh|more\s*retail|grocery|grocer|supermarket|blinkit|zepto|instamart|bigbasket|mart\b|kirana/i, 'Groceries'],
  [/uber|ola|rapido|metro|irctc|petrol|fuel|indian\s*oil|hpcl|bpcl|shell|parking|toll|fastag/i, 'Transport'],
  [/amazon|flipkart|myntra|ajio|nykaa|decathlon|lifestyle|westside|trends|zara|h&m|mall/i, 'Shopping'],
  [/apollo|pharmacy|medplus|chemist|hospital|clinic|diagnostic|lab/i, 'Health'],
  [/pvr|inox|bookmyshow|netflix|spotify|prime|hotstar|cinema/i, 'Entertainment'],
  [/airtel|jio|vodafone|\bvi\b|bsnl|electricity|power|water\s*bill|gas\b|broadband|act\s*fibernet/i, 'Bills & utilities'],
];

export function guessCategory(merchant: string | null) {
  if (!merchant) return null;
  for (const [re, name] of MERCHANT_CATEGORIES) if (re.test(merchant)) return name;
  return null;
}

function findMerchant(lines: string[]) {
  for (const raw of lines.slice(0, 8)) {
    const line = raw.replace(/[^\p{L}\p{N}&'.\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
    const letters = (line.match(/\p{L}/gu) || []).length;
    if (letters < 3 || SKIP_MERCHANT.test(line) || letters / line.length < 0.5) continue;
    return line.slice(0, 60).replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase());
  }
  return null;
}

export function parseReceipt(text: string): ReceiptGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const all: number[] = [];
  const totals: number[] = [];

  lines.forEach((line, i) => {
    const nums = amountsIn(line);
    all.push(...nums);
    if (TOTAL_WORDS.test(line) && !NOT_TOTAL.test(line)) {
      // value may be on the same line or wrapped onto the next line
      const vals = nums.length ? nums : amountsIn(lines[i + 1] || '');
      if (vals.length) totals.push(vals[vals.length - 1]);
    }
  });

  let total: number | null = null;
  let confidence: ReceiptGuess['confidence'] = 'low';
  if (totals.length) {
    total = Math.max(...totals);
    confidence = 'high';
  } else if (all.length) {
    total = Math.max(...all);
    confidence = 'medium';
  }

  const merchant = findMerchant(lines);
  const amounts = [...new Set(all)].sort((a, b) => b - a).slice(0, 6);
  const date = findDate(text);
  if (confidence === 'high' && !date) confidence = 'medium';
  return { total, date, merchant, categoryHint: guessCategory(merchant), confidence, amounts };
}
