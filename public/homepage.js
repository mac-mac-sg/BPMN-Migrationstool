function showHome() {
  document.getElementById('home').hidden = false;
  document.getElementById('workspace').hidden = true;
  renderHomeRecent(); window.scrollTo(0,0);
}
function openWorkspace(mode) {
  document.getElementById('home').hidden = true;
  document.getElementById('workspace').hidden = false;
  if (mode) { resetAll(); legacyCtx = null; legacyFlags = []; setMode(mode); }
  window.scrollTo(0,0);
  requestAnimationFrame(() => { if(currentLogicCore) bpmnZoomFit(); });
}
function renderHomeRecent() {
  const container = document.getElementById('home-recent');
  container.replaceChildren();
  document.getElementById('home-count').textContent = `${savedProcesses.length} Prozesse`;
  if (!savedProcesses.length) {
    container.innerHTML = '<div class="recent-empty"><span>▤</span><div><strong>Platz für deine Prozesse</strong><p>Sobald du einen Prozess erstellst, findest du ihn hier wieder.</p></div><button onclick="loadDemo()">Beispiel öffnen →</button></div>';
  }
  savedProcesses.slice(0,6).forEach(p => {
    const btn = document.createElement('button'); btn.className = 'recent-row';
    const name = document.createElement('strong'); name.textContent = p.name;
    const meta = document.createElement('span'); meta.textContent = `${p.nodes} Elemente · ${p.lanes} Rollen · ${relTime(p.updated)} →`;
    btn.append(name,meta); btn.onclick = async () => {openWorkspace(); await loadProcess(p.id);}; container.append(btn);
  });
}
async function loadDemo() {
  openWorkspace('free');
  const lc = {
    processName:'Service Request Management',processId:'K3.2',description:'Standardaufträge strukturiert entgegennehmen, erfüllen und abschliessen.',trigger:'Standardauftrag im Self-Service-Portal',outcome:'Auftrag erfüllt und dokumentiert',owner:'Service Owner',complexity:'einfach',
    lanes:[{id:'l1',name:'ICT Supporter',color:'#54B9CB'},{id:'l2',name:'Service Owner',color:'#45808B'}],
    nodes:[{id:'s',type:'startEvent',label:'Auftrag eingegangen',lane:'l1'},{id:'a',type:'userTask',label:'Auftrag prüfen',lane:'l1'},{id:'g',type:'exclusiveGateway',label:'Vollständig?',lane:'l1'},{id:'b',type:'userTask',label:'Angaben ergänzen lassen',lane:'l1'},{id:'c',type:'userTask',label:'Leistung erbringen',lane:'l2'},{id:'d',type:'userTask',label:'Abschluss dokumentieren',lane:'l1'},{id:'e',type:'endEvent',label:'Auftrag abgeschlossen',lane:'l1'}],
    edges:[{id:'f1',source:'s',target:'a'},{id:'f2',source:'a',target:'g'},{id:'f3',source:'g',target:'c',label:'Ja',isHappyPath:true},{id:'f4',source:'g',target:'b',label:'Nein'},{id:'f5',source:'b',target:'a'},{id:'f6',source:'c',target:'d'},{id:'f7',source:'d',target:'e'}], dataObjects:[],externalParticipants:[],messageFlows:[],risks:[]
  };
  currentLogicCore=lc; currentSourceText='Beispiel: Ein Standardauftrag wird über das Self-Service-Portal erteilt. Der ICT Supporter prüft die Vollständigkeit. Fehlende Angaben lässt er ergänzen und prüft erneut. Der Service Owner erbringt die Leistung. Anschliessend dokumentiert der ICT Supporter den Abschluss.';
  document.getElementById('process-input').value=currentSourceText;
  currentOnepager={processName:lc.processName,version:'Beispiel',date:new Date().toLocaleDateString('de-CH'),scope:'Standardisierte Kundenaufträge aus dem Servicekatalog. CAB-relevante Changes sind nicht Bestandteil dieses Prozesses.',shortDescription:lc.description+' Jeder Standardauftrag folgt einem definierten Workflow. Leistungsumfang, Preis und Lieferzeit werden im Servicekatalog festgelegt.',goals:['Standardaufträge vollständig und nachvollziehbar abwickeln.','Vereinbarte Lieferzeiten einhalten.','Verantwortlichkeiten je Arbeitsschritt klar zuordnen.'],risks:[{label:'Unvollständige Aufträge verzögern die Erfüllung.',severity:'mittel',mitigation:'Pflichtangaben vor Bearbeitung prüfen.'}],steps:lc.nodes.filter(n=>n.type==='userTask').map((n,i)=>({nr:i+1,activity:n.label,description:n.label,input:'Service Request',output:'Aktualisierter Auftrag',system:'BMC Helix',remark:''}))};
  currentRaci={roles:['ICT Supporter','Service Owner'],activities:currentOnepager.steps.map(s=>({nr:s.nr,activity:s.activity,assignments:{'ICT Supporter':s.nr===3?'A':'R','Service Owner':s.nr===3?'R':'A'}}))};
  validateAndRepair(lc); renderBpmn(lc); renderOnepager(currentOnepager); renderRaci(currentRaci); renderXmlTab(lc); showOutputButtons(); switchTab('bpmn');
  document.getElementById('refine-bar').style.display='flex';
  await saveCurrentProcess(currentSourceText,'Vorbereitetes Beispiel');
  setStatus('Vorbereitetes Beispiel geladen — keine KI-Generierung. Export und Ansichten sind nutzbar.','done');
}
document.getElementById('source-file').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f)return;
  if(f.size>500000){setStatus('Datei ist zu gross. Maximal 500 KB.','error');return;}
  document.getElementById('legacy-input').value=await f.text(); previewLegacy(); e.target.value='';
});
// Make the template's click-only controls keyboard accessible.
document.querySelectorAll('.tab,.example-chip').forEach(el=>{
  el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}});
});
if (document.documentElement.dataset.hosting === 'static') {
  document.getElementById('api-status').textContent='○ Online-Vorschau · ohne KI';
  document.getElementById('static-notice').hidden=false;
} else fetch('/api/health').then(r=>r.json()).then(s=>{
  document.getElementById('api-status').textContent=s.configured?'● KI verbunden':'○ Demo · KI noch nicht eingerichtet';
}).catch(()=>document.getElementById('api-status').textContent='○ Server nicht erreichbar');
loadSavedIndex().then(renderHomeRecent);
