/* =========================================================================
   build-artifact.cjs
   Produces the hosted-page variant of the dashboard.

   The hosting wrapper supplies its own <!doctype>, <html>, <head> and <body>,
   so this emits page content only: the title, the inlined stylesheet, the body
   markup, and the inlined script. Same three sources as the standalone build,
   so the two never drift apart.

   Usage:  node build-artifact.cjs
   Output: artifact/dashboard.html
   ========================================================================= */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT_DIR = path.join(DIR, 'artifact');
const OUT = path.join(OUT_DIR, 'dashboard.html');

const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'style.css'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'main.js'), 'utf8');

function extract(re, label) {
  const m = html.match(re);
  if (!m) {
    console.error('Build failed: could not find ' + label + ' in index.html');
    process.exit(1);
  }
  return m[1];
}

const title = extract(/<title>([\s\S]*?)<\/title>/i, '<title>');
let body = extract(/<body[^>]*>([\s\S]*?)<\/body>/i, '<body>');

// Swap the external script tag for the inlined source. A literal </script>
// inside the JS would close the block early, so escape it.
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');
body = body.replace(
  /<script src="main\.js"><\/script>/,
  '<script>\n' + safeJs + '\n</script>'
);

if (body.includes('src="main.js"')) {
  console.error('Build failed: script tag was not inlined.');
  process.exit(1);
}

const out =
  '<title>' + title + '</title>\n' +
  '<style>\n' + css + '\n</style>\n' +
  body.trim() + '\n';

// The wrapper owns the document skeleton; emitting our own would nest documents.
// Matched with a boundary so <header> is not mistaken for <head>.
const skeleton = [/<!doctype/i, /<html[\s>]/i, /<head[\s>]/i, /<body[\s>]/i];
for (const re of skeleton) {
  if (re.test(out)) {
    console.error('Build failed: output still contains a document skeleton tag (' + re + ')');
    process.exit(1);
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out);
console.log('Wrote artifact/dashboard.html (' + Math.round(out.length / 1024) + ' KB)');
