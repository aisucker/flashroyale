import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
import { build } from 'esbuild';
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], {stdio:'inherit'});
mkdirSync('dist/public', {recursive:true});
for (const file of ['index.html','style.css']) copyFileSync('public/'+file,'dist/public/'+file);
await build({entryPoints:['src/client.ts'],bundle:true,platform:'browser',target:'es2020',outfile:'dist/public/client.js',minify:true});
