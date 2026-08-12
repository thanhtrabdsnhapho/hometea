import fs from 'fs';
import path from 'path';
import https from 'https';

const fontDir = path.join(process.cwd(), 'public', 'fonts');
if (!fs.existsSync(fontDir)) fs.mkdirSync(fontDir, { recursive: true });

// Tải 400 và 700 cho Plus Jakarta Sans và Playfair Display
const url = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700&family=Plus+Jakarta+Sans:ital,wght@0,400;0,700&display=swap';

https.get(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
}, (res) => {
  let css = '';
  res.on('data', chunk => css += chunk);
  res.on('end', async () => {
    console.log('Fetched CSS length:', css.length);
    
    // Google Fonts returns unicode-range subset blocks (e.g. vietnamese, latin-ext, latin).
    // We only need the latin and vietnamese blocks or main subsets.
    const blocks = css.match(/@font-face\s*\{[^}]*\}/g) || [];
    console.log('Total font-face blocks found:', blocks.length);
    
    let fontIdx = 0;
    let localCss = '';

    for (const block of blocks) {
      const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)/);
      const familyMatch = block.match(/font-family:\s*([^;]+);/);
      const weightMatch = block.match(/font-weight:\s*([^;]+);/);
      const styleMatch = block.match(/font-style:\s*([^;]+);/);
      const unicodeRange = block.match(/unicode-range:\s*([^;]+);/);

      if (urlMatch) {
        fontIdx++;
        const fontUrl = urlMatch[1];
        const fontFam = (familyMatch ? familyMatch[1] : 'font').replace(/['"]/g, '').trim().replace(/\s+/g, '-');
        const fontWeight = weightMatch ? weightMatch[1].trim() : '400';
        const fontStyle = styleMatch ? styleMatch[1].trim() : 'normal';

        const fileName = `${fontFam.toLowerCase()}-${fontWeight}-${fontStyle}-${fontIdx}.woff2`;
        const localPath = path.join(fontDir, fileName);

        console.log(`Downloading font #${fontIdx}: ${fontFam} (${fontWeight}) -> ${fileName}`);

        await new Promise((resolve, reject) => {
          https.get(fontUrl, (resStream) => {
            const fileStream = fs.createWriteStream(localPath);
            resStream.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve(true);
            });
          }).on('error', reject);
        });

        localCss += `@font-face {\n`;
        localCss += `  font-family: '${fontFam.replace(/-/g, ' ')}';\n`;
        localCss += `  font-style: ${fontStyle};\n`;
        localCss += `  font-weight: ${fontWeight};\n`;
        localCss += `  font-display: swap;\n`;
        localCss += `  src: url('/fonts/${fileName}') format('woff2');\n`;
        if (unicodeRange) {
          localCss += `  unicode-range: ${unicodeRange[1]};\n`;
        }
        localCss += `}\n\n`;
      }
    }

    fs.writeFileSync(path.join(fontDir, 'fonts.css'), localCss);
    console.log('SUCCESS: Generated /public/fonts/fonts.css and saved woff2 files!');
  });
}).on('error', (err) => console.error('Error fetching fonts:', err));
