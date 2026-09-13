// Empacota cada handler num arquivo unico com esbuild.
//
// Por que esbuild e nao `tsc` + node_modules: o pacote da Lambda fica com
// poucos KB em vez de dezenas de MB, e o cold start cai junto. Nao usamos
// Prisma aqui de proposito — o engine binario dele estoura o limite de
// tamanho e piora muito o cold start; para duas queries simples, o driver
// `pg` puro resolve.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  sourcemap: false,
  // O SDK da AWS ja vem no runtime da Lambda — nao empacotar.
  external: ['@aws-sdk/*'],
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['src/handler.ts'], outfile: 'dist/handler.js' });
await build({ ...common, entryPoints: ['src/authorizer.ts'], outfile: 'dist/authorizer.js' });

console.log('build concluido: dist/handler.js e dist/authorizer.js');
