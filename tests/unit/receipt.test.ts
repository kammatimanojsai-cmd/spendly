import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, findDate, guessCategory } from '../../lib/receipt.ts';

const RESTAURANT = `
  SPICE ROUTE KITCHEN
  12, MG Road, Hyderabad
  GSTIN: 36ABCDE1234F1Z5
  Tax Invoice   Bill No: 4521
  Date: 18/10/2026   Time: 20:41
  Paneer Tikka        1   320.00
  Butter Naan         4   240.00
  Sweet Lime Soda     2   180.00
  Sub Total               740.00
  CGST 2.5%                18.50
  SGST 2.5%                18.50
  Round Off                 0.00
  Grand Total         ₹  777.00
  Thank you! Visit again
`;

const GROCERY = `
DMart Avenue Supermarts
Ph: 040 23456789
Invoice Date 05-Oct-2026
Total Items: 7
Toor Dal 1kg    165.00
Milk 1L          62.00
Total Savings    48.00
NET AMOUNT PAYABLE
1,184.50
Cash Tendered  1,200.00
Change            15.50
`;

const NOISY = `
uber
Trip receipt
Oct 3, 2026
Base fare 85
Distance 132.4O
Total ₹2l7.40
`;

test('restaurant bill: grand total, date, merchant and category', () => {
  const r = parseReceipt(RESTAURANT);
  assert.equal(r.total, 777);
  assert.equal(r.date, '2026-10-18');
  assert.equal(r.merchant, 'Spice Route Kitchen');
  assert.equal(r.categoryHint, 'Food & dining');
  assert.equal(r.confidence, 'high');
  assert.ok(!r.amounts.includes(2.5), 'GST percentage must not be read as an amount');
});

test('grocery: total on the next line; ignores tendered/change/savings/item count', () => {
  const r = parseReceipt(GROCERY);
  assert.equal(r.total, 1184.5);
  assert.equal(r.date, '2026-10-05');
  assert.equal(r.categoryHint, 'Groceries');
  assert.ok(!r.amounts.includes(40234), 'phone number must not be an amount');
});

test('noisy OCR: month-name date; fixes l-for-1 misreads and ignores date digits', () => {
  const r = parseReceipt(NOISY);
  assert.equal(r.date, '2026-10-03');
  assert.equal(r.merchant, 'Uber');
  assert.equal(r.categoryHint, 'Transport');
  assert.equal(r.total, 217.4, 'l misread as 1 must be corrected');
  assert.ok(!r.amounts.includes(3) && !r.amounts.includes(2026), 'date digits are not amounts');
});

test('empty or unreadable text gives a low-confidence empty guess', () => {
  const r = parseReceipt('~~ ### ~~');
  assert.equal(r.total, null);
  assert.equal(r.confidence, 'low');
  assert.equal(r.merchant, null);
});

test('date formats and invalid dates', () => {
  assert.equal(findDate('2026-12-01 10:00'), '2026-12-01');
  assert.equal(findDate('Dated 7.11.26'), '2026-11-07');
  assert.equal(findDate('Dec 25, 2026'), '2026-12-25');
  assert.equal(findDate('31/02/2026'), null);
  assert.equal(guessCategory('Apollo Pharmacy'), 'Health');
  assert.equal(guessCategory('Unknown Traders'), null);
});
