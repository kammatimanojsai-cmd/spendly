// Copies the OCR engine and English language data into public/ so receipt scanning is served
// from Spendly's own origin: no third-party CDN, works on restricted networks, nothing leaves the site.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = join(process.cwd(), 'public', 'tesseract');
const from = (pkg, file) => join(dirname(require.resolve(`${pkg}/package.json`)), file);

const files = [
  [from('tesseract.js', 'dist/worker.min.js'), 'worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']
    .map((f) => [from('tesseract.js-core', f), f]),
  [from('@tesseract.js-data/eng', '4.0.0_best_int/eng.traineddata.gz'), 'lang/eng.traineddata.gz'],
];

for (const [src, dest] of files) {
  const target = join(out, dest);
  mkdirSync(dirname(target), { recursive: true });
  if (!existsSync(src)) throw new Error(`Missing OCR asset: ${src}`);
  copyFileSync(src, target);
}
console.log(`OCR assets ready in public/tesseract (${files.length} files)`);
