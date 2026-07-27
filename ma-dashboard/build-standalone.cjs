/* =========================================================================
   build-standalone.cjs
   Inlines style.css and main.js into index.html to produce a single,
   self-contained HTML file.

   Why: iPadOS / iOS Safari is unreliable at loading sibling files (CSS, JS)
   when an HTML file is opened from the Files app, because each local file is
   treated as its own origin. A single file sidesteps that entirely and is
   also far easier to email or drop into a cloud drive.

   Usage:  node build-standalone.cjs
   Output: progressive-ma-dashboard.html
   ========================================================================= */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'progressive-ma-dashboard.html');

const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'main.js'), 'utf8');

// Guard: a literal </script> inside the JS would terminate the inlined block early.
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const bundled = html
  .replace(
    '<link rel="stylesheet" href="style.css" />',
    '<style>\n' + css + '\n</style>'
  )
  .replace(
    '<script src="main.js"></script>',
    '<script>\n' + safeJs + '\n</script>'
  );

// Fail loudly rather than shipping a half-inlined file.
if (bundled.includes('href="style.css"') || bundled.includes('src="main.js"')) {
  console.error('Build failed: could not find the stylesheet/script tags to replace.');
  process.exit(1);
}

fs.writeFileSync(OUT, bundled);
console.log('Wrote ' + path.basename(OUT) + ' (' + Math.round(bundled.length / 1024) + ' KB)');
