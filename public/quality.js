/* Pure model checks and cycle-aware layout. No function changes the process. */
const ProcessQuality = (() => {
  const types = new Set('startEvent endEvent intermediateEvent userTask serviceTask sendTask receiveTask manualTask scriptTask businessRuleTask subProcess callActivity exclusiveGateway parallelGateway inclusiveGateway eventBasedGateway'.split(' '));
  function assertModel(lc) {
    if (!lc || !Array.isArray(lc.nodes) || !lc.nodes.length || !Array.isArray(lc.edges) || !Array.isArray(lc.lanes) || !lc.lanes.length) throw Error('Das Modell benötigt Rollen, Schritte und Verbindungen. Bitte die Quelle ergänzen.');
    if (lc.nodes.length > 250 || lc.edges.length > 750) throw Error('Das Modell ist zu gross. Bitte in Teilprozesse gliedern.');
    const ids = new Set();
    const id = obj => { if (!obj || typeof obj.id !== 'string' || !/^[A-Za-z_][\w.-]*$/.test(obj.id) || ['__proto__','constructor','prototype'].includes(obj.id) || ids.has(obj.id)) throw Error('Fehlende, ungültige oder doppelte Element-ID. Das Modell wurde nicht verändert.'); ids.add(obj.id); };
    lc.lanes.forEach(l=>{if(typeof l.name!=='string'||(l.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(l.color)))throw Error('Ungültige Rollenbezeichnung oder Farbe.');});
    lc.nodes.forEach(n=>{if(typeof n.label!=='string')throw Error('Ungültige Schrittbezeichnung.');});
    for(const key of ['assumptions','openQuestions'])if(lc[key]!==undefined&&(!Array.isArray(lc[key])||lc[key].some(x=>typeof x!=='string')))throw Error('Ungültige offene Fragen oder Annahmen.');
    lc.lanes.forEach(id); lc.nodes.forEach(id); lc.edges.forEach(id);
    const nodes = new Set(lc.nodes.map(n=>n.id)), lanes = new Set(lc.lanes.map(l=>l.id));
    for (const key of ['externalParticipants','messageFlows','dataObjects']) {
      if (lc[key] !== undefined && !Array.isArray(lc[key])) throw Error('Ungültiges Feld: '+key);
      (lc[key]||[]).forEach(id);
    }
    const exts = new Set((lc.externalParticipants||[]).map(x=>x.id));
    lc.nodes.forEach(n=>{
      if (!types.has(n.type) || !lanes.has(n.lane)) throw Error('Ungültiger Schritttyp oder unklare Rollenzuordnung bei '+(n.label||n.id)+'. Bitte gezielt korrigieren.');
      if (n.boundaryEvents !== undefined && !Array.isArray(n.boundaryEvents)) throw Error('Ungültige Randereignisse.');
      (n.boundaryEvents||[]).forEach(b=>{id(b); if (!nodes.has(b.target) || /Event|Gateway/.test(n.type)) throw Error('Ungültiges Randereignis: '+b.id);});
    });
    lc.edges.forEach(e=>{if (!nodes.has(e.source)||!nodes.has(e.target)) throw Error('Verbindung '+e.id+' verweist auf einen fehlenden Schritt. Keine automatische Reparatur.');});
    (lc.messageFlows||[]).forEach(m=>{if (!(nodes.has(m.source)||exts.has(m.source)) || !(nodes.has(m.target)||exts.has(m.target)) || !(exts.has(m.source)||exts.has(m.target))) throw Error('Ungültiger Nachrichtenfluss: '+m.id);});
    (lc.dataObjects||[]).forEach(d=>{if (!nodes.has(d.node)) throw Error('Datenobjekt ohne gültigen Schritt: '+d.id);});
  }
  function links(lc) { return [...lc.edges,...lc.nodes.flatMap(n=>(n.boundaryEvents||[]).map(b=>({id:b.id,source:n.id,target:b.target})))]; }
  function walk(seeds, edges, reverse=false) {
    const seen=new Set(seeds), todo=[...seeds];
    while(todo.length) {const id=todo.pop();for(const e of edges) if((reverse?e.target:e.source)===id){const next=reverse?e.source:e.target;if(!seen.has(next)){seen.add(next);todo.push(next);}}} return seen;
  }
  function inspect(lc) {
    assertModel(lc);
    const out=[], add=(level,code,message,nodeId)=>out.push({level,code,message,nodeId});
    const starts=lc.nodes.filter(n=>n.type==='startEvent'), ends=lc.nodes.filter(n=>n.type==='endEvent');
    if(!starts.length)add('error','start','Auslöser fehlt: Wann beginnt der Prozess?');
    if(!ends.length)add('error','end','Ergebnis fehlt: Wann ist der Prozess abgeschlossen?');
    const all=links(lc), from=walk(starts.map(n=>n.id),all), to=walk(ends.map(n=>n.id),all,true);
    lc.nodes.forEach(n=>{
      const incoming=lc.edges.filter(e=>e.target===n.id), outgoing=lc.edges.filter(e=>e.source===n.id);
      const label=n.label||n.id;
      if(!from.has(n.id))add('error','unreachable',`«${label}» ist vom Start nicht erreichbar. An welcher Stelle gehört dieser Schritt hin?`,n.id);
      if(!to.has(n.id))add('error','no-end',`Von «${label}» führt kein Weg zu einem Ergebnis. Wie endet dieser Pfad?`,n.id);
      if(n.type==='startEvent'&&incoming.length)add('error','start-input',`Start «${label}» hat eingehende Sequenzflüsse.`,n.id);
      if(n.type==='endEvent'&&outgoing.length)add('error','end-output',`Ende «${label}» hat ausgehende Sequenzflüsse.`,n.id);
      if(/Gateway/.test(n.type)&&outgoing.length<2&&incoming.length<2)add('warning','gateway',`«${label}»: Zweck des Gateways prüfen.`,n.id);
      if(['exclusiveGateway','inclusiveGateway'].includes(n.type)&&outgoing.length>1){
        if(outgoing.some(e=>!e.isDefault&&!String(e.label||'').trim()))add('error','conditions',`«${label}»: Bedingungen der Entscheidungswege ergänzen.`,n.id);
        if(outgoing.filter(e=>e.isDefault).length>1)add('error','default',`«${label}»: Mehrere Sonst-Wege sind nicht eindeutig.`,n.id);
        const labels=outgoing.map(e=>(e.label||'').trim().toLowerCase()).filter(Boolean);
        if(new Set(labels).size<labels.length)add('warning','duplicate-condition',`«${label}»: Entscheidungswege gleich beschriftet.`,n.id);
      }
      if(n.type==='parallelGateway'&&outgoing.some(e=>e.isDefault))add('error','parallel-default',`«${label}»: Ein paralleles Gateway hat keinen Sonst-Weg.`,n.id);
      if(n.type==='eventBasedGateway'&&outgoing.some(e=>{const t=lc.nodes.find(x=>x.id===e.target);return !(t.type==='receiveTask'||(t.type==='intermediateEvent'&&['message','timer','signal'].includes(t.eventType||t.marker)));}))add('error','event-gateway',`«${label}»: Nachfolger müssen auf eine Nachricht oder ein Ereignis warten.`,n.id);
      if(!/Event|Gateway/.test(n.type)&&outgoing.length>1)add('warning','explicit-split',`«${label}»: Mehrere Ausgänge. Nach Inventx-Konvention die Verzweigung explizit modellieren.`,n.id);
      if(n.loop&&outgoing.some(e=>walk([e.target],lc.edges).has(n.id)))add('warning','double-loop',`«${label}»: Schleifenmarker und Rücksprung können zwei Wiederholungen ausdrücken. Absicht prüfen.`,n.id);
    });
    (lc.openQuestions||[]).forEach(q=>add('warning','question',String(q)));
    (lc.assumptions||[]).forEach(q=>add('warning','assumption','Annahme: '+String(q)));
    return out;
  }
  function layers(lc) {
    const state=new Map(), back=new Set(), adjacency=new Map(lc.nodes.map(n=>[n.id,[]]));
    const edges=links(lc);
    edges.forEach(e=>adjacency.get(e.source)?.push(e));
    // Prefer the main flow, then original stable order. Remove only DFS back edges for layout.
    adjacency.forEach(es=>es.sort((a,b)=>Number(!!b.isHappyPath)-Number(!!a.isHappyPath)));
    function visit(id){state.set(id,1);for(const e of adjacency.get(id)||[]){if(state.get(e.target)===1)back.add(e.id);else if(!state.has(e.target))visit(e.target);}state.set(id,2);}
    [...lc.nodes.filter(n=>n.type==='startEvent'),...lc.nodes].forEach(n=>{if(!state.has(n.id))visit(n.id);});
    const degree=new Map(lc.nodes.map(n=>[n.id,0])), col=Object.create(null);
    edges.filter(e=>!back.has(e.id)).forEach(e=>degree.set(e.target,degree.get(e.target)+1));
    const queue=lc.nodes.filter(n=>degree.get(n.id)===0).map(n=>n.id), order=[];
    lc.nodes.forEach(n=>col[n.id]=0);
    while(queue.length){const id=queue.shift();order.push(id);for(const e of adjacency.get(id)||[]){if(back.has(e.id))continue;col[e.target]=Math.max(col[e.target],col[id]+1);degree.set(e.target,degree.get(e.target)-1);if(degree.get(e.target)===0)queue.push(e.target);}}
    return {col,order,back};
  }
  function readability(op) {
    const notes=[];
    [['scope','Geltungsbereich',90],['shortDescription','Kurzbeschreibung',150]].forEach(([k,label,max])=>{
      const text=op[k]||'', words=text.trim().split(/\s+/).filter(Boolean);
      if(!words.length)notes.push(label+' fehlt.');
      if(words.length>max)notes.push(label+': auf das Wesentliche kürzen.');
      if(text.split(/[.!?]+/).some(s=>s.trim().split(/\s+/).length>28))notes.push(label+': lange Sätze aufteilen.');
      if(/\b(CAB|SLA|RACI|ITSM|CMDB)\b/.test(text)&&!/[()]/.test(text))notes.push(label+': Abkürzungen erklären oder vermeiden.');
    });return notes;
  }
  return {assertModel,inspect,layers,readability};
})();
