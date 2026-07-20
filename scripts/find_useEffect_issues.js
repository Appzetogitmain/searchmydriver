const fs = require('fs');
const path = require('path');
function walk(dir) {
  let out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.jsx?$|\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const files = walk(path.join(__dirname, '..', 'frontend', 'src'));
const bad = [];
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (c.includes('useEffect(')) {
    const importsMatch = /import\s+\{[^}]*\buseEffect\b[^}]*\}\s+from\s+['\"]react['\"]/m;
    const importsMatch2 = /import\s+React\s*,\s*\{[^}]*\buseEffect\b[^}]*\}\s+from\s+['\"]react['\"]/m;
    const importsReactOnly = /import\s+React\s*;/m;
    if (importsMatch.test(c) || importsMatch2.test(c)) continue;
    if (importsReactOnly.test(c)) {
      if (c.includes('React.useEffect(')) continue;
    }
    bad.push(f);
  }
}
if (bad.length === 0) console.log('No issues found'); else console.log(bad.join('\n'));
