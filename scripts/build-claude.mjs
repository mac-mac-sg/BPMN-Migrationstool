import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
let html=await readFile(new URL('public/index.html',root),'utf8');
html=html.replace('<html lang="de">','<html lang="de" data-hosting="claude">');
const css=await readFile(new URL('public/styles.css',root),'utf8');
html=html.replace('<link rel="stylesheet" href="./styles.css">',()=>'<style>'+css+'</style>');
for(const name of ['storage','quality','app','workbench','homepage']) {
 const js=await readFile(new URL('public/'+name+'.js',root),'utf8');
 html=html.replace(`<script src="./${name}.js"></script>`,()=>'<script>\n'+js.replace(/<\/script/gi,'<\\/script')+'\n</script>');
}
html=html.replace('<body>',`<body><!-- CLAUDE IMPORT: Als interaktives KI-gestütztes HTML-Artefakt öffnen. Design und Fachlogik erhalten. processApiFetch nutzt den ursprünglichen Artefakt-Endpunkt; falls die aktuelle Claude-Umgebung einen anderen Aufruf verlangt, ausschliesslich diesen Adapter anpassen. Keine API-Schlüssel anfordern. KI und Speicherung im Ziel-Artefakt testen. -->`);
await mkdir(new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/prozess-migrations-tool.html',root),html);
console.log('Claude HTML bundle created; live Claude runtime verification still required.');
