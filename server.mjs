import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';

const publicDir=fileURLToPath(new URL('./public/',import.meta.url));
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/homepage.js':'homepage.js','/storage.js':'storage.js','/styles.css':'styles.css'};
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
const digest=s=>createHash('sha256').update(s).digest();
export function createApp({apiKey=process.env.ANTHROPIC_API_KEY,model=process.env.ANTHROPIC_MODEL||'claude-sonnet-4-6',password=process.env.APP_PASSWORD,upstream=fetch}={}) {
 let active=0;
 return http.createServer(async(req,res)=>{
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const fail=(code,message)=>json(code,{error:{message}});
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(password){
   const credentials=Buffer.from((req.headers.authorization||'').replace(/^Basic /,''),'base64').toString();
   const provided=credentials.slice(credentials.indexOf(':')+1);
   if(!req.headers.authorization?.startsWith('Basic ')||!timingSafeEqual(digest(provided),digest(password))){res.setHeader('WWW-Authenticate','Basic realm="Process Studio", charset="UTF-8"');return fail(401,'Anmeldung erforderlich.');}
  }
  try {
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/health'&&req.method==='GET')return json(200,{configured:!!apiKey});
   if(url.pathname==='/api/messages'){
    if(req.method!=='POST')return fail(405,'POST erforderlich.');
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return fail(403,'Unerlaubte Herkunft.');
    if(!req.headers['content-type']?.startsWith('application/json'))return fail(415,'JSON erforderlich.');
    if(!apiKey)return fail(503,'KI ist noch nicht eingerichtet. ANTHROPIC_API_KEY auf dem Server hinterlegen. Das vorbereitete Beispiel funktioniert ohne KI.');
    if(active>=3)return fail(429,'Zu viele gleichzeitige Anfragen. Bitte später nochmals versuchen.');
    active++;
    try{
     let body='',bytes=0;
     for await(const chunk of req){bytes+=chunk.length;if(bytes>500000)return fail(413,'Prozessbeschreibung zu gross.');body+=chunk;}
     let payload;try{payload=JSON.parse(body);}catch{return fail(400,'Ungültiges JSON.');}
     if(!payload||!Array.isArray(payload.messages)||!payload.messages.length||payload.messages.length>20||(payload.system!==undefined&&typeof payload.system!=='string')||!payload.messages.every(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'))return fail(400,'Ungültige KI-Anfrage.');
     const response=await upstream('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model,max_tokens:Math.max(1,Math.min(16000,Number(payload.max_tokens)||4000)),system:payload.system,messages:payload.messages}),signal:AbortSignal.timeout(120000)
     });
     if(!response.ok)return fail(response.status===429?429:502,response.status===429?'KI-Limit erreicht. Bitte später erneut versuchen.':'KI-Dienst nicht verfügbar. API-Schlüssel, Modell und Kontingent auf dem Server prüfen.');
     const result=await response.json();
     if(result.stop_reason==='max_tokens')return fail(422,'Die KI-Antwort wurde zu lang. Bitte den Prozess in kleinere Teilprozesse aufteilen.');
     if(!Array.isArray(result.content))return fail(502,'Ungültige Antwort vom KI-Dienst.');
     return json(200,{content:result.content});
    }finally{active--;}
   }
   if(!['GET','HEAD'].includes(req.method))return fail(405,'Methode nicht erlaubt.');
   const name=files[url.pathname];if(!name)return fail(404,'Nicht gefunden.');
   const content=await readFile(publicDir+name);res.writeHead(200,{'Content-Type':types[name.split('.').pop()]});res.end(req.method==='HEAD'?undefined:content);
  }catch(error){fail(error.name==='TimeoutError'?504:500,error.name==='TimeoutError'?'KI-Anfrage hat zu lange gedauert.':'Anfrage konnte nicht verarbeitet werden.');}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const host=process.env.HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.APP_PASSWORD){console.error('Für Netzwerkbetrieb APP_PASSWORD setzen.');process.exit(1);}
 createApp().listen(Number(process.env.PORT)||3000,host,()=>console.log(`Process Studio läuft auf http://${host}:${process.env.PORT||3000}`));
}
