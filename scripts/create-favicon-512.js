import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const fontPath = path.join(process.cwd(), 'public', 'fonts', 'playfair-display-700-normal-8.woff2');
const fontBase64 = fs.readFileSync(fontPath).toString('base64');

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'Playfair Display Custom';
        src: url('data:font/woff2;charset=utf-8;base64,${fontBase64}') format('woff2');
        font-weight: 700;
        font-style: normal;
      }
      .brand-text {
        font-family: 'Playfair Display Custom', 'Playfair Display', Georgia, serif;
        font-weight: 700;
        font-size: 260px;
        fill: #f97316;
      }
    </style>
  </defs>
  <rect width="512" height="512" rx="108" fill="#0c1424"/>
  <text x="220" y="338" class="brand-text" text-anchor="middle">T</text>
  <circle cx="362" cy="324" r="21" fill="#f97316"/>
</svg>
`;

const outputPath = path.join(process.cwd(), 'public', 'favicon-512.png');

sharp(Buffer.from(svg))
  .png()
  .toFile(outputPath)
  .then(() => {
    console.log('SUCCESS: Generated public/favicon-512.png');
    console.log('File size:', fs.statSync(outputPath).size, 'bytes');
  })
  .catch(err => {
    console.error('Error generating favicon-512.png:', err);
  });
