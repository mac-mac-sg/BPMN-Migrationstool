// Static Pages has no API server. Fail clearly without sending process data.
function processApiFetch(url, options) {
  if (document.documentElement.dataset.hosting === 'static') {
    return Promise.resolve(new Response(JSON.stringify({error:{message:'Die KI-Erstellung ist in dieser Online-Vorschau noch nicht verfügbar. Dafür muss ein Backend angebunden werden. Das vorbereitete Beispiel und Exporte sind nutzbar.'}}), {status:503,headers:{'Content-Type':'application/json'}}));
  }
  return fetch(url, options);
}

// ─── Examples ────────────────────────────────────────────────────────────────
const EXAMPLES = [
  `Der Kunde stellt einen Kreditantrag über das Online-Portal der Bank. Der Antrag wird automatisch auf Vollständigkeit geprüft. Bei fehlenden Unterlagen wird der Kunde per E-Mail aufgefordert, diese nachzureichen. Vollständige Anträge werden an den Sachbearbeiter weitergeleitet, der die Bonität prüft. Bei positivem Entscheid erstellt der Sachbearbeiter den Kreditvertrag, der vom Bereichsleiter freigegeben wird. Anschliessend wird der Vertrag dem Kunden digital zugestellt. Bei negativem Entscheid erhält der Kunde eine Ablehnungsbenachrichtigung.`,
  
  `Ein Kunde bestellt ein Produkt im Online-Shop. Das Warenlager prüft die Verfügbarkeit. Ist das Produkt verfügbar, wird die Zahlung verarbeitet. Bei erfolgreicher Zahlung wird der Versandauftrag an die Logistik übermittelt. Die Logistik verpackt und versendet das Paket und übermittelt die Tracking-Nummer. Der Kunde erhält eine Versandbestätigung. Bei nicht vorhandener Ware informiert das Lager den Kunden und bietet eine alternative Lieferzeit an. Bei Zahlungsfehlern wird der Kunde zur Neueingabe aufgefordert.`,
  
  `Ein Benutzer meldet einen IT-Ausfall über das Service-Portal. Der Service Desk erfasst und klassifiziert den Incident. Bei einem kritischen Incident wird sofort ein Major Incident Prozess ausgelöst und der IT-Manager informiert. Normale Incidents werden dem zuständigen 2nd Level Support zugewiesen. Der Techniker analysiert das Problem und setzt eine Lösung um. Nach Behebung wird der Incident geschlossen und der Benutzer informiert. Kann der Techniker das Problem nicht lösen, eskaliert er an den Hersteller.`,
  
  `HR erfasst einen neuen Mitarbeiter im System. Die IT-Abteilung erstellt die Benutzerkonten und richtet das Laptop ein. Die Personalabteilung versendet den Arbeitsvertrag und holt die Unterschrift ein. Am ersten Arbeitstag führt HR eine Einführung durch. Der Vorgesetzte führt das Onboarding-Gespräch und stellt den Abteilungseinführungsplan vor. In der ersten Woche absolviert der Mitarbeiter Pflichtschulungen. Nach 30 Tagen findet ein Probezeitgespräch mit HR und dem Vorgesetzten statt.`,
  
  `Ein Change Request wird vom Antragsteller im ITSM-System erfasst. Der Change Manager prüft den Antrag auf Vollständigkeit und klassifiziert den Change. Standard Changes werden direkt freigegeben. Normal Changes werden dem Change Advisory Board (CAB) vorgelegt, das an der wöchentlichen Sitzung entscheidet. Bei Genehmigung plant der Change Koordinator die Umsetzung. Das technische Team setzt den Change im Wartungsfenster um. Nach der Umsetzung prüft QA die Änderungen. Bei Erfolg schliesst der Change Manager den Ticket. Bei Fehlern wird ein Rollback durchgeführt.`
];

function setExample(idx) {
  document.getElementById('process-input').value = EXAMPLES[idx];
}

// ─── Tab Switching ───────────────────────────────────────────────────────────
function switchTab(name) {
  ['bpmn','onepager','raci','xml','migration','admin'].forEach(t => {
    document.getElementById('tab-'+t).classList.toggle('active', t===name);
    document.getElementById('content-'+t).classList.toggle('active', t===name);
  });
  if (name === 'admin') renderRoleCatalog();
}

// ─── State ───────────────────────────────────────────────────────────────────
let currentLogicCore = null;
let currentBpmnXml = null;
let currentProcessId = null;        // id of the currently loaded saved process
let currentSourceText = '';         // original free-text description
let currentOnepager = null;         // last generated onepager (persisted — B3)
let currentRaci = null;             // last generated RACI (persisted — B3)
let modelHistory = [];              // undo stack of {logicCore, onepager, raci} — C3
const HISTORY_MAX = 10;
let pendingClarifications = null;   // questions awaiting answers
let savedProcesses = [];            // in-memory mirror of stored list
let roleCatalog = [];               // official Inventx roles
let currentFindings = [];           // process-check findings awaiting decision
let currentCheckHistory = { rejected: [], accepted: [] }; // persisted per process
let lastLayout = null;              // computed layout of last render (for BPMN XML export)
let selectedNodeId = null;          // node selected via click (C2)

// ── Official Inventx role catalog (default seed) ──
const DEFAULT_ROLES = [
  "Agile Coach","Bereichsleiter","Business Support Manager","Consultant","Engineering Manager",
  "Financial Controller","ICT Supporter","Leiter InventxLab","Opportunity Owner","Process Owner",
  "Product Portfolio Manager","Scrum Master","Service Owner","Solution Architect","Strategic Marketing Manager",
  "Teamleader","Werkstudent","Application Consultant","Bid Manager","Chief Executive Officer",
  "Contract Owner","Enterprise Architect","Head of Engineering","Information Security Risk & Compliance Officer",
  "Lernender","Platform Delivery Manager","Procurement Manager","Project Manager","Security Champion",
  "Service Portfolio Manager","Solution Requirement Engineer","Strategic Project Manager","Technical Lead",
  "Application Engineer","Business Analyst","Chief Information Security Officer","Cyber Security Analyst",
  "Family Relations Manager","Head of Product","IT Architect","Monitoring","Praktikant","Product Architect",
  "Public Cloud Engineer","Security Consultant","Site Reliability Engineer","Specialist Marketing & Kommunikation",
  "Stream Lead","Test Engineer","Application Manager","Business Consultant","Client Delivery Manager",
  "Cyber Security Architect","Finance & Controlling Specialist","HR Business Partner","L&D Specialist",
  "Monitoring & Alerting Specialist","Praxisbildner","Product Manager","Release Manager","Service Desk Agent",
  "Software Architekt","Stellvertretung","Systems Engineer","Test Manager","Assistant","Business Manager",
  "Cluster Leader","DevOps Engineer","Financial Accountant","HR Specialist","Leiter interne IT / CIO",
  "Operational & IT Risk Manager","Process & Strategy Manager","Product Owner","Sales Manager","Service Engineer",
  "Software Engineer","Strategic Innovation Manager","Talent Acquisition & Attraction","Trainee"
];

function setStatus(msg, type='') {
  const el = document.getElementById('status-bar');
  el.className = 'status-bar' + (type ? ' '+type : '');
  el.innerHTML = type==='running' 
    ? `<div class="spinner"></div><span>${esc(msg)}</span>`
    : `<span>${esc(msg)}</span>`;
}

function resetAll() {
  document.getElementById('process-input').value = '';
  document.getElementById('bpmn-empty').style.display = 'flex';
  document.getElementById('bpmn-svg-wrapper').style.display = 'none';
  document.getElementById('bpmn-svg-wrapper').innerHTML = '';
  document.getElementById('refine-bar').style.display = 'none';
  document.getElementById('onepager-content').innerHTML = `<div class="empty-state">
    <div class="empty-icon">📄</div><h3>Noch kein Onepager</h3>
    <p>Der Prozess-Onepager erscheint nach der Generierung hier.</p>
  </div>`;
  document.getElementById('xml-content').innerHTML = `<div class="empty-state">
    <div class="empty-icon">{ }</div><h3>Noch keine Daten</h3>
    <p>Logic-Core JSON und BPMN XML erscheinen hier nach der Generierung.</p>
  </div>`;
  document.getElementById('raci-content').innerHTML = `<div class="empty-state">
    <div class="empty-icon">🅡</div><h3>Noch keine RACI-Matrix</h3>
    <p>Die RACI-Matrix wird automatisch aus Prozessbeschreibung und Modell abgeleitet.</p>
  </div>`;
  ['btn-check','btn-export-bpmn','btn-confluence','btn-export-png','btn-export-svg','btn-export-xml','btn-copy-xml'].forEach(id =>
    document.getElementById(id).style.display='none');
  currentLogicCore = null; currentBpmnXml = null;
  currentProcessId = null; currentSourceText = '';
  currentOnepager = null; currentRaci = null;
  modelHistory = []; updateUndoButton(); hideDiffPanel();
  currentFindings = [];
  currentCheckHistory = { rejected: [], accepted: [] };
  if (typeof legacyCtx !== 'undefined') { legacyCtx = null; legacyFlags = []; }
  const li = document.getElementById('legacy-input'); if (li) li.value = '';
  const mt = document.getElementById('tab-migration'); if (mt) mt.style.display = 'none';
  const mc = document.getElementById('migration-content');
  if (mc) mc.innerHTML = `<div class="empty-state">
    <div class="empty-icon">⇄</div><h3>Noch kein Migrationsreport</h3>
    <p>Wechsle links auf «Migration», füge eine alte Prozessdokumentation ein und starte die Migration.</p>
  </div>`;
  document.querySelectorAll('.saved-item').forEach(el => el.classList.remove('active'));
  switchTab('bpmn');
  setStatus(MODE === 'migrate'
    ? 'Migrationsmodus — alte Prozessdokumentation einfügen'
    : 'Bereit — Prozessbeschreibung eingeben und generieren');
}

// ─── Main Generate (with optional clarification step) ────────────────────────
async function generate() {
  if (MODE === 'migrate') return migrateGenerate();
  legacyCtx = null;
  const text = document.getElementById('process-input').value.trim();
  if (!text) { setStatus('Bitte zuerst eine Prozessbeschreibung eingeben.', 'error'); return; }

  // If the description changed vs. the loaded process, treat as a NEW process
  if (currentProcessId && text !== currentSourceText) {
    currentProcessId = null;
    currentCheckHistory = { rejected: [], accepted: [] };
    document.querySelectorAll('.saved-item').forEach(el => el.classList.remove('active'));
  }
  currentSourceText = text;

  // Step 0: ask clarifying questions if enabled
  if (document.getElementById('opt-clarify').checked) {
    lockGenerateBtn(true, 'Analysiere…');
    setStatus('Prüfe Beschreibung auf Unklarheiten…', 'running');
    try {
      const questions = await getClarifyingQuestions(text);
      if (questions && questions.length) {
        lockGenerateBtn(false);
        showClarificationModal(questions);
        return; // wait for user — submitClarification() resumes
      }
    } catch(e) {
      console.warn('Clarification step skipped:', e);
    }
  }
  await runGeneration(text, '');
}

// Core generation — optionally augmented with clarification answers
async function runGeneration(text, clarificationContext) {
  lockGenerateBtn(true, 'Generiere…');
  try {
    setStatus('Phase 1/3 — Prozessstruktur wird extrahiert…', 'running');
    let lc = await extractLogicCore(text, clarificationContext);
    let warnings = validateAndRepair(lc);

    // A1: auto-fix structural problems via one repair round-trip
    const fixResult = await autoFixStructure(lc, warnings);
    lc = fixResult.lc; warnings = fixResult.warnings;

    currentLogicCore = lc;
    modelHistory = []; updateUndoButton(); hideDiffPanel();

    setStatus('Phase 2/3 — BPMN Diagramm wird gerendert…', 'running');
    renderBpmn(lc);
    renderXmlTab(lc);
    if (legacyCtx) { renderMigrationReport(currentOnepager); document.getElementById('tab-migration').style.display = ''; }
    showOutputButtons();
    document.getElementById('refine-bar').style.display = 'flex';

    setStatus('Phase 3/3 — Onepager & RACI werden erstellt…', 'running');
    const includeOnepager = document.getElementById('opt-onepager').checked;
    await generateDocuments(text, lc, includeOnepager);

    // Persist
    await saveCurrentProcess(text);

    const gw = lc.nodes.filter(n => n.type.includes('Gateway')).length;
    let msg = `✓ Fertig — ${lc.nodes.length} Knoten, ${gw} Gateways, ${lc.edges.length} Flüsse, ${(lc.lanes||[]).length} Lanes`;
    if (fixResult.fixed) msg += ` · ${fixResult.fixed} Strukturproblem(e) automatisch behoben`;
    if (warnings.length) msg += ` · ${warnings.length} Hinweis(e)`;
    setStatus(msg, 'done');
    if (warnings.length) console.warn('Validierung:', warnings);
  } catch(e) {
    setStatus('Fehler: ' + e.message, 'error');
    console.error(e);
  } finally {
    lockGenerateBtn(false);
  }
}

function lockGenerateBtn(locked, label) {
  const btn = document.getElementById('btn-generate');
  btn.disabled = locked;
  document.getElementById('btn-icon').textContent = locked ? '⏳' : '▶';
  document.getElementById('btn-text').textContent = locked ? (label||'Generiere…') : 'Prozess generieren';
}

function showOutputButtons() {
  ['btn-check','btn-export-bpmn','btn-confluence','btn-export-png','btn-export-svg','btn-export-xml','btn-copy-xml'].forEach(id =>
    document.getElementById(id).style.display='');
}

// ─── Clarification: ask the model what's unclear ─────────────────────────────
async function getClarifyingQuestions(text) {
  const sys = `Du bist ein BPMN-Analyst. Prüfe die Prozessbeschreibung auf Lücken, die für ein präzises Swimlane-Diagramm wichtig sind (unklare Rollen, fehlende Entscheidungsausgänge, unklarer Start/Auslöser, fehlende Fehlerbehandlung, unklares Prozessende).

Gib NUR valides JSON zurück, kein Markdown:
{
  "questions": [
    {
      "id": "q1",
      "question": "Konkrete Rückfrage",
      "hint": "kurze Begründung warum das wichtig ist",
      "options": ["Vorschlag 1", "Vorschlag 2", "Vorschlag 3"]
    }
  ]
}

Regeln:
- Stelle MAXIMAL 3 Fragen, nur zu echten Unklarheiten.
- Wenn die Beschreibung klar und vollständig ist, gib {"questions": []} zurück.
- Biete pro Frage 2-4 plausible Optionen als Auswahlhilfe an (der Nutzer kann auch frei antworten).
- Fragen auf Deutsch (Swiss-Konvention, kein ß).`;

  const response = await processApiFetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: sys,
      messages: [{ role: 'user', content: `Prozessbeschreibung:\n\n${text}` }]
    })
  });
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || 'KI-Anfrage fehlgeschlagen (' + response.status + ')'); }
  const data = await response.json();
  const raw = data.content.map(b => b.text||'').join('').trim()
    .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  const parsed = safeParseJSON(raw, 'Clarify');
  return parsed.questions || [];
}

function showClarificationModal(questions) {
  pendingClarifications = questions;
  const container = document.getElementById('clarify-questions');
  container.innerHTML = questions.map((q, i) => `
    <div class="clarify-q" data-qid="${q.id}">
      <div class="clarify-q-text">
        <span class="clarify-q-num">${i+1}.</span>
        <span>${esc(q.question)}${q.hint ? ` <span class="clarify-q-hint">— ${esc(q.hint)}</span>` : ''}</span>
      </div>
      <div class="clarify-options">
        ${(q.options||[]).map(opt =>
          `<div class="clarify-option" onclick="selectClarifyOption(this, '${q.id}')">${esc(opt)}</div>`
        ).join('')}
      </div>
      <input type="text" class="clarify-freetext" data-qid="${q.id}"
        placeholder="…oder eigene Antwort eingeben (optional)">
    </div>
  `).join('');
  document.getElementById('clarify-modal').style.display = 'flex';
}

function selectClarifyOption(el, qid) {
  // toggle selection within the same question group
  const group = el.parentElement;
  group.querySelectorAll('.clarify-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  // clear freetext if an option chosen
  const ft = group.parentElement.querySelector('.clarify-freetext');
  if (ft) ft.value = '';
}

function collectClarificationAnswers() {
  const answers = [];
  document.querySelectorAll('.clarify-q').forEach(qEl => {
    const qid = qEl.dataset.qid;
    const q = pendingClarifications.find(x => x.id === qid);
    const selected = qEl.querySelector('.clarify-option.selected');
    const freetext = qEl.querySelector('.clarify-freetext').value.trim();
    const answer = freetext || (selected ? selected.textContent : '');
    if (answer) answers.push(`Frage: ${q.question}\nAntwort: ${answer}`);
  });
  return answers;
}

function submitClarification() {
  const answers = collectClarificationAnswers();
  document.getElementById('clarify-modal').style.display = 'none';
  const ctx = answers.length
    ? `\n\nZusätzliche Klärungen vom Nutzer:\n${answers.join('\n')}`
    : '';
  runGeneration(currentSourceText, ctx);
}

function skipClarification() {
  document.getElementById('clarify-modal').style.display = 'none';
  runGeneration(currentSourceText, '');
}

// ─── Refine: iterate on the existing diagram via direct instruction ──────────
async function refineDiagram() {
  const instr = document.getElementById('refine-input').value.trim();
  if (!instr) return;
  if (!currentLogicCore) { setStatus('Erst ein Diagramm generieren.', 'error'); return; }

  const btn = document.getElementById('btn-refine');
  btn.disabled = true;
  document.getElementById('refine-icon').textContent = '⏳';

  try {
    setStatus('Diagramm wird angepasst…', 'running');
    const before = JSON.parse(JSON.stringify(currentLogicCore));
    pushHistory(); // C3: snapshot before change

    const updated = await applyRefinement(currentLogicCore, instr);
    const warnings = validateAndRepair(updated);
    currentLogicCore = updated;
    renderBpmn(updated);
    renderXmlTab(updated);

    // D4: show what changed
    showDiffPanel(diffModels(before, updated));

    setStatus('Onepager & RACI werden aktualisiert…', 'running');
    const includeOnepager = document.getElementById('opt-onepager').checked;
    await generateDocuments(currentSourceText + '\n\nAnpassung: ' + instr, updated, includeOnepager);

    document.getElementById('refine-input').value = '';
    selectedNodeId = null;
    await saveCurrentProcess(currentSourceText, instr);

    const gw = updated.nodes.filter(n => n.type.includes('Gateway')).length;
    let msg = `✓ Angepasst — ${updated.nodes.length} Knoten, ${gw} Gateways, ${updated.edges.length} Flüsse`;
    if (warnings.length) msg += ` · ${warnings.length} Hinweis(e)`;
    setStatus(msg, 'done');
  } catch(e) {
    setStatus('Anpassung fehlgeschlagen: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    document.getElementById('refine-icon').textContent = '✎';
  }
}

async function applyRefinement(logicCore, instruction) {
  const sys = `Du bist ein BPMN 2.0 Experte. Du erhältst ein bestehendes Prozessmodell als Logic-Core JSON und eine Änderungsanweisung. Wende die Änderung an und gib das VOLLSTÄNDIGE, aktualisierte JSON im exakt gleichen Schema zurück.

Regeln:
- Gib NUR valides JSON zurück, kein Markdown, keine Erklärung.
- Behalte bestehende IDs bei, wo möglich. Neue Elemente bekommen neue eindeutige IDs.
- Wahre die Integrität: alle edge.source/target referenzieren existierende node.id, genau 1 startEvent, mindestens 1 endEvent, keine isolierten Knoten.
- XOR-Gateways behalten Kanten-Labels.
- Behalte Lane-Farben aus der Inventx-Palette bei: #45808B, #54B9CB, #F19944, #E4000B, #706F6F, #3F3F3F
- Bewahre bestehende boundaryEvents, dataObjects, externalParticipants und messageFlows, sofern die Änderung sie nicht betrifft.
- Ändere nur, was die Anweisung verlangt; lass den Rest unverändert.`;

  const response = await processApiFetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: sys,
      messages: [{
        role: 'user',
        content: `Bestehendes Modell:\n${JSON.stringify(logicCore)}\n\nÄnderungsanweisung:\n${instruction}`
      }]
    })
  });
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || 'KI-Anfrage fehlgeschlagen (' + response.status + ')'); }
  const data = await response.json();
  const raw = data.content.map(b => b.text||'').join('').trim()
    .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  return safeParseJSON(raw, 'Refine');
}

// ─── Safe JSON Parser with truncation repair ─────────────────────────────────
function safeParseJSON(raw, label) {
  // First try: parse as-is
  try { return JSON.parse(raw); } catch(e1) {}

  // Second try: find the outermost { … } block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch(e2) {}
  }

  // Third try: state-aware repair of truncated JSON
  const partial = start !== -1 ? raw.slice(start) : raw;
  const repaired = repairJSON(partial);
  try { return JSON.parse(repaired); } catch(e3) {
    // Fourth try: truncate to the last COMPLETE array element, then close
    const salvaged = salvageArrays(partial);
    if (salvaged) {
      try { return JSON.parse(salvaged); } catch(e4) {}
    }
    console.error(`[${label}] raw response:`, raw);
    throw new Error(`${label}: JSON konnte nicht geparst werden. Antwort war ${raw.length} Zeichen lang. Details in der Konsole.`);
  }
}

// State-aware bracket/quote tracking — ignores braces inside strings
function repairJSON(str) {
  const stack = [];
  let inString = false, escaped = false;
  let lastValidEnd = -1; // index after last top-level-safe char

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length && stack[stack.length-1] === ch) stack.pop();
    }
  }

  let s = str;
  // If we ended inside a string, close it
  if (inString) s += '"';
  // Remove a dangling trailing comma / partial key-value after last complete token
  s = s.replace(/,\s*$/,'');
  s = s.replace(/:\s*$/,': null');
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Close remaining open structures
  while (stack.length) s += stack.pop();
  return s;
}

// Salvage: cut a truncated top-level array to its last complete element
function salvageArrays(str) {
  // Find "steps" or any array that was likely cut mid-element
  // Strategy: walk and record the index of the last position where the
  // structure was balanced back to depth 1 inside an array.
  let inString = false, escaped = false;
  const stack = [];
  let arrayDepthStarts = [];
  let lastCompleteElementEnd = -1;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();

    // After closing an object that sits directly inside an array, this is a
    // complete element boundary
    if (ch === '}' && stack.length && stack[stack.length-1] === '[') {
      lastCompleteElementEnd = i;
    }
  }

  if (lastCompleteElementEnd === -1) return null;

  // Cut after the last complete element, then close all open arrays/objects
  let s = str.slice(0, lastCompleteElementEnd + 1);
  // Rebuild closing structure based on remaining open brackets
  const st = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') st.push('}');
    else if (ch === '[') st.push(']');
    else if (ch === '}' || ch === ']') { if (st.length) st.pop(); }
  }
  while (st.length) s += st.pop();
  return s;
}

// ─── Phase 1: Extract Logic-Core via Claude API ───────────────────────────────
async function extractLogicCore(text, clarificationContext='') {
  const risks = document.getElementById('opt-risks').checked;

  const systemPrompt = `Du bist ein BPMN 2.0 Experte. Analysiere Prozessbeschreibungen und gib ausschliesslich valides JSON zurück – kein Markdown, keine Erklärungen, kein Backtick-Code-Block.

Gib exakt dieses JSON-Schema zurück:
{
  "processName": "Prozessname (kurz, prägnant)",
  "processId": "optional — Prozess-ID falls im Text erwähnt (z.B. 'K5.2', 'S1.3')",
  "description": "Kurzbeschreibung des Prozesses (2-3 Sätze)",
  "trigger": "Was startet den Prozess",
  "outcome": "Was ist das Ergebnis des Prozesses",
  "owner": "Prozessverantwortlicher (Rolle)",
  "complexity": "einfach|mittel|komplex",
  "lanes": [
    {"id": "lane_1", "name": "Rollenname", "color": "#hexfarbe", "official": true}
  ],
  "nodes": [
    {
      "id": "n1",
      "type": "startEvent|endEvent|intermediateEvent|userTask|serviceTask|sendTask|receiveTask|manualTask|scriptTask|businessRuleTask|subProcess|callActivity|exclusiveGateway|parallelGateway|inclusiveGateway|eventBasedGateway",
      "label": "Verb + Substantiv auf Deutsch",
      "lane": "lane_id",
      "isHappyPath": true,
      "marker": "none|message|timer|signal|error|terminate",
      "eventType": "(nur bei Events) none|message|timer|error|signal — z.B. Start per Nachricht = message",
      "loop": "true wenn die Aktivität wiederholt wird bis Bedingung erfüllt (Rework-Schleife als Marker)",
      "multiInstance": "parallel|sequential — wenn die Aktivität mehrfach für mehrere Objekte ausgeführt wird (z.B. 'je Bereich')",
      "boundaryEvents": [
        {"id": "b1", "type": "timer|error|message|signal", "label": "Auslöser (z.B. 'Frist 5 Tage')", "interrupting": true, "target": "node_id (Zielknoten des Ausnahmepfads)"}
      ]
    }
  ],
  "externalParticipants": [
    {"id": "ext1", "name": "Externer Partner (z.B. 'Kunde', 'Lieferant', 'Behörde')"}
  ],
  "messageFlows": [
    {"id": "m1", "source": "node_id oder ext_id", "target": "node_id oder ext_id", "label": "Nachricht (z.B. 'Antrag', 'Bestätigung')"}
  ],
  "edges": [
    {
      "id": "e1",
      "source": "node_id",
      "target": "node_id",
      "label": "optional — bei XOR/OR-Split-Verzweigungen PFLICHT (z.B. 'Ja'/'Nein')",
      "isHappyPath": true,
      "isDefault": false
    }
  ],
  "dataObjects": [
    {"id": "d1", "label": "Dokument/Datenobjekt (z.B. 'Kreditantrag')", "type": "input|output|store", "node": "node_id (zugehörige Aktivität)"}
  ]${risks ? `,
  "risks": [
    {"label": "Risikobezeichnung", "severity": "hoch|mittel|tief", "mitigation": "Massnahme"}
  ]` : ''}
}

REGELN (strikt einhalten — BPMN 2.0.2 / OMG):
1. STRUKTUR: Genau 1 startEvent, mindestens 1 endEvent. Jeder Pfad endet zwingend in einem endEvent. Vom Start ist jeder Knoten erreichbar; von jedem Knoten ist ein endEvent erreichbar (keine Sackgassen).
2. TASK-TYPEN korrekt wählen (eine Aktivität = ein in sich abgeschlossener Arbeitsschritt):
   - userTask: Mensch arbeitet mit System (prüfen, erfassen, freigeben)
   - manualTask: rein manuelle Tätigkeit ohne System (Dokument unterschreiben)
   - serviceTask: automatisierte System-/Software-Aktion
   - sendTask/receiveTask: Nachricht senden/empfangen
   - businessRuleTask: Entscheidung nach Regelwerk/Bonität/Klassifizierung
   - subProcess: zusammengefasster Teilprozess (nur bei echter Verdichtung mehrerer Schritte)
   - callActivity: Aufruf eines eigenständigen, anderswo definierten Prozesses
3. GATEWAYS (häufigste Fehlerquelle — strikt):
   a) exclusiveGateway (XOR): genau EIN Pfad. Gateway-Label als Frage ("Antrag vollständig?"). JEDE ausgehende Kante trägt ein sich gegenseitig ausschliessendes Bedingungs-Label. Optional genau eine Kante mit "isDefault": true (Sonst-Fall).
   b) parallelGateway (AND): alle Pfade gleichzeitig. KEINE Kanten-Labels. Immer paarweise: AND-Split (1 rein, ≥2 raus) + AND-Join (≥2 rein, 1 raus).
   c) inclusiveGateway (OR): eine oder mehrere Bedingungen zugleich. Kanten-Labels Pflicht, OR-Join schliesst.
   d) SYMMETRIE: Ein Split wird durch einen Join DESSELBEN Typs geschlossen (XOR-Split → XOR-Join, AND-Split → AND-Join). Verzweigte Pfade laufen vor dem End-Event wieder zusammen — ausser ein Pfad endet bewusst in eigenem End-Event (z.B. Abbruch/Ablehnung).
   e) eventBasedGateway: Auf ihn folgen AUSSCHLIESSLICH receiveTask oder intermediateEvent (message/timer) — er wartet auf das erste eintreffende Ereignis.
   f) LABELS: Nur SPLIT-Gateways tragen ein Label (Frage). Zusammenführende Gateways (Joins) bleiben unbeschriftet. Die Bedingungs-Labels der XOR-Ausgänge schliessen sich gegenseitig aus und sind paarweise verschieden.
   g) VERBOTEN: Gateway mit nur 1 Eingang und 1 Ausgang; zwei Gateways direkt hintereinander ohne Aktivität dazwischen; Aktivität mit mehreren ausgehenden Kanten (Verzweigung gehört IMMER auf ein Gateway, nie auf eine Aktivität).
4. EVENTS:
   - startEvent: eventType "message" wenn durch externe Nachricht/Anfrage ausgelöst, "timer" wenn zeit-/terminbasiert, sonst "none".
   - endEvent: eventType "message" wenn der Prozess mit einer Benachrichtigung endet, "error" bei fachlichem Fehlerabbruch, "terminate" bei hartem Prozessabbruch, sonst "none".
   - intermediateEvent: für Ereignisse mitten im Fluss (Warten auf Nachricht/Timer). eventType entsprechend setzen.
   - "marker" und "eventType" konsistent halten.
4b. BOUNDARY EVENTS (Ereignisse am Rand einer Aktivität): Nutze sie für Ausnahmen, die während einer Aktivität auftreten können — z.B. Frist/Timeout (type "timer"), Fehler (type "error"), eingehende Nachricht (type "message"). Hänge sie über "boundaryEvents" an die betroffene Aktivität. "interrupting": true unterbricht die Aktivität (Standardfall, z.B. Abbruch bei Fristüberschreitung), false läuft parallel weiter (z.B. Eskalation/Erinnerung ohne Abbruch). "target" verweist auf den Knoten, der den Ausnahmepfad startet. Typisches Beispiel: Aktivität "Freigabe abwarten" mit Timer-Boundary "Frist 5 Tage" → target "Eskalation auslösen".
4c. DATENOBJEKTE: Erfasse die wichtigsten fachlichen Artefakte (Dokumente, Daten, Formulare) über "dataObjects". type "input" = geht in die Aktivität ein, "output" = entsteht/Ergebnis, "store" = Datenspeicher/Ablage. "node" verweist auf die zugehörige Aktivität. Modelliere nur die 3-8 zentralen Objekte (z.B. "Kreditantrag", "Bonitätsbericht", "Vertrag"), nicht jede Kleinigkeit.
4d. SCHLEIFEN & MEHRFACHAUSFÜHRUNG: Für Rework-Schleifen bevorzuge die explizite Rückwärtskante (XOR-Gateway → zurück zur Aktivität). Setze zusätzlich "loop": true auf der wiederholten Aktivität als visuellen Marker. "multiInstance" nur wenn dieselbe Aktivität für mehrere Objekte parallel/sequenziell läuft (z.B. "Bereichsinputs liefern" je Bereich → "parallel").
4e. EXTERNE PARTNER & MESSAGE FLOWS: Kunde, Lieferant, Behörde oder andere Organisationen sind KEINE Lanes — sie gehören als "externalParticipants" (kollabierte Pools) modelliert. Kommunikation mit ihnen läuft über "messageFlows" (Nachrichtenflüsse zwischen einem Prozessknoten und dem externen Partner). Typisch: Kunde sendet Antrag → messageFlow ext→startEvent/receiveTask; Prozess sendet Bestätigung → messageFlow sendTask→ext. Interne Rollen bleiben Lanes; NIE ein messageFlow zwischen zwei internen Knoten (das ist ein sequenceFlow/edge).
5. LABELS: Aktivitäten im "Verb + Substantiv"-Format (deutsch, Swiss-Konvention ohne ß), max. 4 Wörter, eindeutig und aktiv formuliert ("Antrag prüfen", nicht "Prüfung"). Events als Zustand/Auslöser ("Antrag eingegangen", "Frist abgelaufen").
6. SWIMLANES = VERANTWORTLICHKEIT: 3-6 Lanes. Jede Aktivität liegt in der Lane GENAU der Rolle, die sie ausführt (Responsible). Wechselt die Zuständigkeit, wechselt die Lane. Verwende ausschliesslich Rollen aus diesem offiziellen Inventx-Rollenkatalog (exakte Schreibweise):
${roleCatalog.join(', ')}
Wähle die thematisch passendste offizielle Rolle (z.B. "Service Desk Agent" statt "Support-Mitarbeiter", "Project Manager" statt "Projektleiter"). Setze "official": true. NUR wenn KEINE offizielle Rolle inhaltlich passt, verwende einen beschreibenden Namen und setze "official": false. Lane-Farben aus dieser Inventx-Palette in Reihenfolge: #45808B, #54B9CB, #F19944, #E4000B, #706F6F, #3F3F3F
7. HAPPY PATH: Den Haupterfolgspfad mit isHappyPath:true markieren (Nodes UND Edges). Er verläuft möglichst gradlinig links→rechts; Ausnahme-/Fehlerpfade zweigen ab.
8. GRANULARITÄT: 5-15 Aktivitäten für einen typischen Prozess. Fasse triviale Folgeschritte zusammen, aber zerlege keine Aktivität, die eine Rolle in einem Zug erledigt. Modelliere reale Entscheidungen und Ausnahmen, nicht nur den Idealverlauf.
9. INTEGRITÄT: Alle edge.source/target referenzieren existierende node.id. Keine isolierten Nodes. Jeder Node ausser start/end hat ≥1 eingehende UND ≥1 ausgehende Kante. Eindeutige IDs.

VORGEHEN (intern, zweistufig): Analysiere zuerst still: (a) beteiligte Rollen→Lanes, (b) linearer Happy-Path, (c) Entscheidungspunkte→XOR-Gateways mit Bedingungen, (d) parallele Tätigkeiten→AND-Gateways, (e) Ausnahme-/Fehlerpfade und Schleifen/Rückführungen, (f) Prüfe jeden Split auf zugehörigen Join. Übersetze DANN diese Analyse in das JSON. Gib ausschliesslich das finale JSON aus.`;

  const response = await processApiFetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Prozessbeschreibung:\n\n${text}${clarificationContext||''}` }]
    })
  });

  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || 'KI-Anfrage fehlgeschlagen (' + response.status + ')'); }
  const data = await response.json();
  const raw = data.content.map(b => b.text || '').join('').trim()
    .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();

  return safeParseJSON(raw, 'Logic-Core');
}

// ─── Logic-Core Validation & Auto-Repair ────────────────────────────────────
// Catches malformed API output before rendering — ensures BPMN well-formedness.
function validateAndRepair(lc) {
  const warnings = [];
  lc.lanes = lc.lanes || [];
  lc.nodes = lc.nodes || [];
  lc.edges = lc.edges || [];

  // 1. Ensure at least one lane
  if (lc.lanes.length === 0) {
    lc.lanes.push({ id: 'lane_default', name: 'Prozess', color: '#45808B' });
    warnings.push('Keine Lane definiert — Standard-Lane ergänzt.');
  }
  const laneIds = new Set(lc.lanes.map(l => l.id));

  // 2. Every node must reference a valid lane
  lc.nodes.forEach(n => {
    if (!n.lane || !laneIds.has(n.lane)) {
      n.lane = lc.lanes[0].id;
      warnings.push(`Knoten "${n.label||n.id}" hatte ungültige Lane — der ersten Lane zugewiesen.`);
    }
  });

  // 3. Node IDs must be unique
  const nodeIds = new Set();
  lc.nodes.forEach(n => {
    if (nodeIds.has(n.id)) {
      const newId = n.id + '_' + Math.random().toString(36).slice(2,6);
      warnings.push(`Doppelte Knoten-ID "${n.id}" → "${newId}".`);
      n.id = newId;
    }
    nodeIds.add(n.id);
  });

  // 4. Exactly one start event
  const starts = lc.nodes.filter(n => n.type === 'startEvent');
  if (starts.length === 0) {
    // Promote a node with no incoming edges, or prepend one
    const hasIncoming = new Set(lc.edges.map(e => e.target));
    const candidate = lc.nodes.find(n => !hasIncoming.has(n.id));
    const start = { id:'start_auto', type:'startEvent', label:'Start', lane: lc.nodes[0]?.lane || lc.lanes[0].id, isHappyPath:true, marker:'none' };
    lc.nodes.unshift(start);
    if (candidate) lc.edges.unshift({ id:'e_start_auto', source:'start_auto', target:candidate.id, isHappyPath:true });
    warnings.push('Kein Start-Event — automatisch ergänzt.');
  } else if (starts.length > 1) {
    starts.slice(1).forEach(s => { s.type = 'intermediateEvent'; });
    warnings.push(`${starts.length} Start-Events gefunden — nur das erste behalten, Rest als Zwischenereignis.`);
  }

  // 5. At least one end event
  const ends = lc.nodes.filter(n => n.type === 'endEvent');
  if (ends.length === 0) {
    const hasOutgoing = new Set(lc.edges.map(e => e.source));
    const candidate = lc.nodes.find(n => !hasOutgoing.has(n.id) && n.type !== 'startEvent');
    const end = { id:'end_auto', type:'endEvent', label:'Ende', lane: candidate?.lane || lc.lanes[0].id, marker:'none' };
    lc.nodes.push(end);
    if (candidate) lc.edges.push({ id:'e_end_auto', source:candidate.id, target:'end_auto', isHappyPath:true });
    warnings.push('Kein End-Event — automatisch ergänzt.');
  }

  // 6. Drop edges referencing non-existent nodes
  const validIds = new Set(lc.nodes.map(n => n.id));
  const before = lc.edges.length;
  lc.edges = lc.edges.filter(e => {
    const ok = validIds.has(e.source) && validIds.has(e.target);
    if (!ok) warnings.push(`Fluss ${e.source}→${e.target} entfernt (Knoten existiert nicht).`);
    return ok;
  });

  // 7. Ensure edge IDs exist & unique
  const edgeIds = new Set();
  lc.edges.forEach((e, i) => {
    if (!e.id || edgeIds.has(e.id)) e.id = 'e_' + i + '_' + Math.random().toString(36).slice(2,5);
    edgeIds.add(e.id);
  });

  // 8. Detect orphan nodes (no edges at all) — warn only
  const connected = new Set();
  lc.edges.forEach(e => { connected.add(e.source); connected.add(e.target); });
  lc.nodes.forEach(n => {
    if (!connected.has(n.id) && lc.nodes.length > 1) {
      warnings.push(`Knoten "${n.label||n.id}" ist nicht verbunden.`);
    }
  });

  // 9. Normalize lane colors to Inventx palette if missing
  const IX = ['#45808B','#54B9CB','#F19944','#E4000B','#706F6F','#3F3F3F'];
  lc.lanes.forEach((l, i) => { if (!l.color || !/^#[0-9a-fA-F]{6}$/.test(l.color)) l.color = IX[i % IX.length]; });

  // 9b. Gateway connectivity & well-formedness (BPMN)
  const outCount = {}, inCount = {};
  lc.nodes.forEach(n => { outCount[n.id] = 0; inCount[n.id] = 0; });
  lc.edges.forEach(e => { outCount[e.source] = (outCount[e.source]||0)+1; inCount[e.target] = (inCount[e.target]||0)+1; });
  const nodeById = {};
  lc.nodes.forEach(n => { nodeById[n.id] = n; });

  lc.nodes.forEach(n => {
    if (!n.type.includes('Gateway')) return;
    const out = outCount[n.id] || 0;
    const inc = inCount[n.id] || 0;
    const isSplit = out >= 2;
    const isJoin  = inc >= 2;
    if (!isSplit && !isJoin) {
      warnings.push(`Gateway "${n.label||n.id}" hat nur 1 Ein- und 1 Ausgang — als Aktivität sinnvoller oder Verzweigung fehlt.`);
    }
    if (n.type === 'exclusiveGateway' && isSplit) {
      const branches = lc.edges.filter(e => e.source === n.id);
      const unlabeled = branches.filter(e => !e.label || !e.label.trim());
      // tolerate one unlabeled branch if it's the explicit default
      const nonDefaultUnlabeled = unlabeled.filter(e => !e.isDefault);
      if (nonDefaultUnlabeled.length) {
        warnings.push(`XOR-Gateway "${n.label||n.id}": ${nonDefaultUnlabeled.length} Verzweigung(en) ohne Bedingungs-Label.`);
      }
    }
    if (n.type === 'parallelGateway' && isSplit) {
      // AND-split branches must NOT carry condition labels
      const labeled = lc.edges.filter(e => e.source === n.id && e.label && e.label.trim());
      if (labeled.length) {
        warnings.push(`AND-Gateway "${n.label||n.id}": parallele Pfade dürfen keine Bedingungs-Labels haben.`);
      }
    }
  });

  // 9c. Activity with multiple outgoing edges → branching belongs on a gateway
  lc.nodes.forEach(n => {
    const isActivity = !n.type.includes('Gateway') && !n.type.includes('Event');
    if (isActivity && (outCount[n.id]||0) >= 2) {
      warnings.push(`Aktivität "${n.label||n.id}" hat mehrere Ausgänge — Verzweigung gehört auf ein Gateway.`);
    }
  });

  // 9d. Two gateways directly chained without activity between
  lc.edges.forEach(e => {
    const s = nodeById[e.source], t = nodeById[e.target];
    if (s && t && s.type.includes('Gateway') && t.type.includes('Gateway')) {
      // allowed only if it's a split immediately followed by another split type (rare) — warn
      warnings.push(`Zwei Gateways direkt verbunden (${s.label||s.id}→${t.label||t.id}) — meist fehlt eine Aktivität dazwischen.`);
    }
  });

  // 9e. Split/Join balance per gateway type
  const splitsByType = {}, joinsByType = {};
  lc.nodes.forEach(n => {
    if (!n.type.includes('Gateway')) return;
    if ((outCount[n.id]||0) >= 2) splitsByType[n.type] = (splitsByType[n.type]||0)+1;
    if ((inCount[n.id]||0) >= 2)  joinsByType[n.type] = (joinsByType[n.type]||0)+1;
  });
  ['parallelGateway','inclusiveGateway'].forEach(gt => {
    const s = splitsByType[gt]||0, j = joinsByType[gt]||0;
    if (s > j) warnings.push(`${gt}: ${s} Split(s), aber nur ${j} Join(s) — Zusammenführung fehlt evtl.`);
  });

  // 9f. Reachability: erst deterministisch reparieren, dann erst warnen
  repairReachability(lc, warnings);

  // 9g. Boundary events: must attach to an activity and target a valid node
  const validIds2 = new Set(lc.nodes.map(n => n.id));
  lc.nodes.forEach(n => {
    if (!Array.isArray(n.boundaryEvents)) return;
    const isActivity = !n.type.includes('Gateway') && !n.type.includes('Event');
    if (n.boundaryEvents.length && !isActivity) {
      warnings.push(`Boundary-Event an "${n.label||n.id}" ignoriert — nur an Aktivitäten erlaubt.`);
      n.boundaryEvents = [];
      return;
    }
    n.boundaryEvents = n.boundaryEvents.filter(b => {
      if (b.target && !validIds2.has(b.target)) {
        warnings.push(`Boundary-Event "${b.label||b.id}" zeigt auf unbekannten Knoten — entfernt.`);
        return false;
      }
      if (b.interrupting === undefined) b.interrupting = true;
      if (!b.id) b.id = 'b_' + Math.random().toString(36).slice(2,6);
      return true;
    });
  });

  // 9h. Data objects: must reference a valid node
  if (Array.isArray(lc.dataObjects)) {
    lc.dataObjects = lc.dataObjects.filter(d => {
      if (d.node && !validIds2.has(d.node)) {
        warnings.push(`Datenobjekt "${d.label||d.id}" zeigt auf unbekannten Knoten — entfernt.`);
        return false;
      }
      if (!d.id) d.id = 'd_' + Math.random().toString(36).slice(2,6);
      if (!['input','output','store'].includes(d.type)) d.type = 'input';
      return true;
    });
  } else {
    lc.dataObjects = [];
  }

  // 9i. Event-based gateway: successors must be receive-type
  lc.nodes.forEach(n => {
    if (n.type !== 'eventBasedGateway') return;
    lc.edges.filter(e => e.source === n.id).forEach(e => {
      const t = nodeById[e.target];
      const ok = t && (t.type === 'receiveTask' || t.type === 'intermediateEvent');
      if (!ok) warnings.push(`Event-based Gateway "${n.label||n.id}": Nachfolger "${t?.label||e.target}" muss receiveTask oder intermediateEvent sein.`);
    });
  });

  // 9j. Happy path connectivity: happy edges must form a path start → end
  const happyStart = lc.nodes.find(n => n.type === 'startEvent');
  if (happyStart) {
    const hAdj = {};
    lc.nodes.forEach(n => hAdj[n.id] = []);
    lc.edges.filter(e => e.isHappyPath).forEach(e => { if (hAdj[e.source]) hAdj[e.source].push(e.target); });
    const hReach = new Set([happyStart.id]);
    const hStack = [happyStart.id];
    while (hStack.length) {
      const cur = hStack.pop();
      (hAdj[cur]||[]).forEach(nx => { if (!hReach.has(nx)) { hReach.add(nx); hStack.push(nx); } });
    }
    const reachesEnd = lc.nodes.some(n => n.type === 'endEvent' && hReach.has(n.id));
    if (!reachesEnd && lc.edges.some(e => e.isHappyPath)) {
      warnings.push('Happy Path ist unterbrochen — er führt nicht durchgängig vom Start zu einem End-Event.');
    }
  }

  // 9k. Label lint (deterministic conventions)
  lc.nodes.forEach(n => {
    const isActivity = !n.type.includes('Gateway') && !n.type.includes('Event');
    const lbl = (n.label||'').trim();
    if (isActivity && lbl && lbl.split(/\s+/).length === 1) {
      warnings.push(`Aktivität "${lbl}": Label sollte "Verb + Substantiv" sein (z.B. "${lbl} prüfen").`);
    }
    // Join gateways should be unlabeled
    if (n.type.includes('Gateway') && (inCount[n.id]||0) >= 2 && (outCount[n.id]||0) <= 1 && lbl) {
      warnings.push(`Join-Gateway "${lbl}": zusammenführende Gateways bleiben unbeschriftet — Label entfernt.`);
      n.label = '';
    }
  });
  // XOR split labels must be pairwise distinct
  lc.nodes.filter(n => n.type === 'exclusiveGateway' && (outCount[n.id]||0) >= 2).forEach(n => {
    const lbls = lc.edges.filter(e => e.source === n.id).map(e => (e.label||'').trim().toLowerCase()).filter(Boolean);
    if (new Set(lbls).size < lbls.length) {
      warnings.push(`XOR-Gateway "${n.label||n.id}": Ausgangs-Labels sind nicht eindeutig unterscheidbar.`);
    }
  });

  // 9l. External participants & message flows integrity
  lc.externalParticipants = Array.isArray(lc.externalParticipants) ? lc.externalParticipants : [];
  lc.externalParticipants.forEach(x => { if (!x.id) x.id = 'ext_' + Math.random().toString(36).slice(2,6); });
  const extIds = new Set(lc.externalParticipants.map(x => x.id));
  lc.messageFlows = Array.isArray(lc.messageFlows) ? lc.messageFlows.filter(m => {
    const sOk = validIds2.has(m.source) || extIds.has(m.source);
    const tOk = validIds2.has(m.target) || extIds.has(m.target);
    const hasExt = extIds.has(m.source) || extIds.has(m.target);
    if (!sOk || !tOk) { warnings.push(`Message Flow "${m.label||m.id}" mit unbekanntem Endpunkt — entfernt.`); return false; }
    if (!hasExt) { warnings.push(`Message Flow "${m.label||m.id}" zwischen zwei internen Knoten — als Sequenzfluss modellieren, entfernt.`); return false; }
    if (!m.id) m.id = 'm_' + Math.random().toString(36).slice(2,6);
    return true;
  }) : [];
  // Heuristic: lane named like a typical external party → hint
  const extHints = /^(kunde|kundin|lieferant|behörde|partner|extern)/i;
  lc.lanes.forEach(l => {
    if (extHints.test(l.name||'')) {
      warnings.push(`Lane "${l.name}" wirkt wie ein externer Partner — als externalParticipant mit messageFlows modellieren.`);
    }
  });

  // 10. Verify each lane against the official role catalog (authoritative)
  lc.lanes.forEach(l => {
    l.official = isOfficialRole(l.name);
    if (!l.official) warnings.push(`Rolle "${l.name}" ist nicht im offiziellen Katalog erfasst.`);
  });

  return warnings;
}

// ─── Phase 2: Render BPMN SVG (OMG 2.0.2 compliant) ─────────────────────────
function renderBpmn(lc) {
  const lanes  = lc.lanes  || [];
  const nodes  = lc.nodes  || [];
  const edges  = lc.edges  || [];

  // ── OMG-compliant dimension constants ──────────────────────────────────────
  const POOL_HDR  = 30;   // vertical pool label strip
  const LANE_HDR  = 28;   // vertical lane label strip
  const LANE_H    = 160;  // lane height (enough for labels below nodes)
  const NODE_W    = 120;  // task width  (OMG: 100px min)
  const NODE_H    = 56;   // task height (OMG: 80px min — we scale proportionally)
  const GW        = 44;   // gateway diamond half-diagonal
  const EV_R      = 18;   // event circle radius
  const COL_W     = 170;  // column width (node + spacing)
  const PAD_X     = 24;   // left/right padding inside lane
  const PAD_Y     = 20;   // top padding before first lane row

  // ── 1. Topological sort (Kahn's algorithm) ────────────────────────────────
  const inDeg = {}, adj = {};
  nodes.forEach(n => { inDeg[n.id] = 0; adj[n.id] = []; });
  edges.forEach(e => {
    if (adj[e.source] !== undefined)  adj[e.source].push(e.target);
    if (inDeg[e.target] !== undefined) inDeg[e.target]++;
  });
  const queue = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
  const topoOrder = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id); topoOrder.push(id);
    (adj[id]||[]).forEach(t => { if (--inDeg[t] <= 0 && !seen.has(t)) queue.push(t); });
  }
  nodes.forEach(n => { if (!seen.has(n.id)) topoOrder.push(n.id); });

  // ── 2. Assign columns via longest-path layering ───────────────────────────
  // Each node gets column = max(predecessors' column) + 1
  const col = {};
  topoOrder.forEach(id => { col[id] = 0; });
  topoOrder.forEach(id => {
    (adj[id]||[]).forEach(t => { col[t] = Math.max(col[t]||0, (col[id]||0) + 1); });
  });

  // ── 3. Within each (lane × column) cell, assign row slot — with
  //       barycentric ordering to reduce edge crossings ──────────────────────
  // Build predecessor map for barycenter computation
  const preds = {};
  nodes.forEach(n => { preds[n.id] = []; });
  edges.forEach(e => { if (preds[e.target]) preds[e.target].push(e.source); });

  // Group node ids by lane+column cell
  const cells = {}; // key → [ids]
  topoOrder.forEach(id => {
    const n = nodes.find(n => n.id === id);
    const lane = n?.lane || lanes[0]?.id || 'l0';
    const c = col[id] || 0;
    const key = `${lane}_${c}`;
    (cells[key] = cells[key] || []).push(id);
  });

  // For each cell, sort members by barycenter of predecessor slots (stable)
  const slotOf = {};
  const cellCount = {};
  // process columns left→right so predecessor slots are already known
  const maxColLocal = Math.max(0, ...topoOrder.map(id => col[id]||0));
  for (let c = 0; c <= maxColLocal; c++) {
    Object.keys(cells).filter(k => k.endsWith('_'+c)).forEach(key => {
      const members = cells[key];
      members.sort((a, b) => {
        const ba = baryCenter(a), bb = baryCenter(b);
        return ba - bb;
      });
      members.forEach((id, i) => { slotOf[id] = i; });
      cellCount[key] = members.length;
    });
  }
  function baryCenter(id) {
    const ps = preds[id] || [];
    if (!ps.length) return 0.5;
    const avg = ps.reduce((s,p) => s + (slotOf[p] ?? 0.5), 0) / ps.length;
    return avg;
  }

  // ── 4. Lane row indices ───────────────────────────────────────────────────
  const laneIdx = {};
  lanes.forEach((l, i) => { laneIdx[l.id] = i; });

  // Compute dynamic lane heights: each lane needs room for its tallest column
  const laneMaxSlots = {};
  lanes.forEach(l => { laneMaxSlots[l.id] = 1; });
  nodes.forEach(n => {
    const lid = n.lane || lanes[0]?.id;
    const c   = col[n.id] || 0;
    const key = `${lid}_${c}`;
    laneMaxSlots[lid] = Math.max(laneMaxSlots[lid]||1, cellCount[key]||1);
  });
  const SLOT_H = NODE_H + 44; // vertical spacing — room for data objects above & boundary flows below
  const laneH  = {}; // actual pixel height per lane
  // Lanes that host data objects or boundary events need extra vertical room
  const lanesWithExtras = new Set();
  (lc.dataObjects||[]).forEach(d => { const h = nodes.find(n=>n.id===d.node); if (h) lanesWithExtras.add(h.lane); });
  nodes.forEach(n => { if (Array.isArray(n.boundaryEvents) && n.boundaryEvents.length) lanesWithExtras.add(n.lane); });
  lanes.forEach(l => {
    const base = Math.max(LANE_H, laneMaxSlots[l.id] * SLOT_H + PAD_Y*2);
    laneH[l.id] = base + (lanesWithExtras.has(l.id) ? 56 : 0);
  });

  // Cumulative Y offset per lane
  const laneY = {};
  // External participants: collapsed pool strips above the main pool
  const exts = lc.externalParticipants || [];
  const EXT_H = 34, EXT_GAP = 8;
  const extOffset = exts.length ? exts.length * (EXT_H + EXT_GAP) + 14 : 0;

  let cumY = PAD_Y + extOffset;
  lanes.forEach(l => { laneY[l.id] = cumY; cumY += laneH[l.id]; });

  // ── 5. Compute node centre positions ─────────────────────────────────────
  const pos = {}; // id → {cx, cy, w, h, isEvent, isGateway}
  nodes.forEach(n => {
    const lid   = n.lane || lanes[0]?.id;
    const isEv  = n.type.includes('Event');
    const isGw  = n.type.includes('Gateway');
    const lh    = laneH[lid] || LANE_H;
    const slots = laneMaxSlots[lid] || 1;
    const slot  = slotOf[n.id] || 0;
    const c     = col[n.id] || 0;

    // cx: column-based, shifted right of lane headers
    const cx = POOL_HDR + LANE_HDR + PAD_X + c * COL_W + COL_W/2;

    // cy: vertically centred within slot inside lane
    const slotSpacing = lh / (slots + 1);
    const cy = (laneY[lid] || 0) + slotSpacing * (slot + 1);

    const w  = isEv ? EV_R*2 : isGw ? GW*2 : NODE_W;
    const h  = isEv ? EV_R*2 : isGw ? GW*2 : NODE_H;
    pos[n.id] = { cx, cy, w, h, isEv, isGw };
  });

  // ── 6. SVG dimensions ─────────────────────────────────────────────────────
  const maxCol  = Math.max(0, ...Object.values(col));
  const SVG_W   = POOL_HDR + LANE_HDR + PAD_X*2 + (maxCol + 1) * COL_W + 20;
  const SVG_H   = cumY + PAD_Y;

  const LANE_FILLS = ['#eef4f5','#f5f9fa','#fdf6ef','#f7f7f7','#fbeef0','#eef7f9'];

  // ── 7. Build SVG ──────────────────────────────────────────────────────────
  let svg = `<svg xmlns="http://www.w3.org/2000/svg"
    width="${SVG_W}" height="${SVG_H}"
    viewBox="0 0 ${SVG_W} ${SVG_H}"
    style="font-family:Calibri,Segoe UI,sans-serif;background:#fff;display:block;">
  <defs>
    <marker id="seq-end" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
      <path d="M0,0 L0,10 L10,5 z" fill="#3F3F3F"/>
    </marker>
    <marker id="seq-hp-end" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
      <path d="M0,0 L0,10 L10,5 z" fill="#45808B"/>
    </marker>
    <marker id="seq-def-start" markerWidth="8" markerHeight="8" refX="0" refY="4" orient="auto">
      <line x1="0" y1="0" x2="5" y2="8" stroke="#3F3F3F" stroke-width="1.5"/>
    </marker>
    <marker id="data-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,1 L6,4 L0,7" fill="none" stroke="#706F6F" stroke-width="1"/>
    </marker>
    <marker id="msg-arrow" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="white" stroke="#706F6F" stroke-width="1.2"/>
    </marker>
    <filter id="sh" x="-8%" y="-8%" width="116%" height="130%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#00000018"/>
    </filter>
  </defs>`;

  // ── External participant pools (collapsed, above main pool) ──
  exts.forEach((x, i) => {
    const ey = 8 + i * (EXT_H + EXT_GAP);
    svg += `<rect x="0" y="${ey}" width="${SVG_W}" height="${EXT_H}" rx="4"
      fill="#EFEFEF" stroke="#706F6F" stroke-width="1.5"/>`;
    svg += `<text x="${SVG_W/2}" y="${ey + EXT_H/2}" text-anchor="middle" dominant-baseline="central"
      fill="#3F3F3F" font-size="11" font-weight="700" letter-spacing="0.5">${escSvg(x.name)} <tspan font-weight="400" font-style="italic" fill="#706F6F">(extern)</tspan></text>`;
  });

  // ── Pool outer border (below external pools) ──
  const poolY = extOffset;
  svg += `<rect x="0" y="${poolY}" width="${SVG_W}" height="${SVG_H - poolY}" rx="4" fill="#f9fafb" stroke="#3F3F3F" stroke-width="2"/>`;

  // ── Pool label strip (vertical left bar) ──
  const poolTitle = (lc.processId ? lc.processId + ' · ' : '') + (lc.processName||'Prozess');
  svg += `<rect x="0" y="${poolY}" width="${POOL_HDR}" height="${SVG_H - poolY}" fill="#3F3F3F" stroke="#3F3F3F" stroke-width="1"/>`;
  svg += `<text transform="translate(${POOL_HDR/2},${poolY + (SVG_H - poolY)/2}) rotate(-90)"
    text-anchor="middle" dominant-baseline="central"
    fill="white" font-size="11" font-weight="700" letter-spacing="0.8">
    ${escSvg(poolTitle)}
  </text>`;

  // ── Lanes ──
  lanes.forEach((lane, i) => {
    const lh   = laneH[lane.id] || LANE_H;
    const ly   = laneY[lane.id] || 0;
    const fill = LANE_FILLS[i % LANE_FILLS.length];

    // Lane background
    svg += `<rect x="${POOL_HDR}" y="${ly}" width="${SVG_W - POOL_HDR}" height="${lh}"
      fill="${fill}" stroke="#CBCBCB" stroke-width="1"/>`;

    // Lane label strip — unofficial roles flagged with red dashed border
    const laneColor = lane.color || '#CBCBCB';
    const unofficial = lane.official === false;
    svg += `<rect x="${POOL_HDR}" y="${ly}" width="${LANE_HDR}" height="${lh}"
      fill="${laneColor}" opacity="0.55"
      stroke="${unofficial ? '#E4000B' : '#CBCBCB'}"
      stroke-width="${unofficial ? 2 : 1}"
      ${unofficial ? 'stroke-dasharray="4,3"' : ''}/>`;
    const labelText = unofficial ? lane.name + '  ⚠ nicht erfasst' : lane.name;
    svg += `<text transform="translate(${POOL_HDR + LANE_HDR/2},${ly + lh/2}) rotate(-90)"
      text-anchor="middle" dominant-baseline="central"
      fill="${unofficial ? '#E4000B' : '#3F3F3F'}" font-size="11"
      font-weight="600" ${unofficial ? 'font-style="italic"' : ''}>
      ${escSvg(labelText)}
    </text>`;
  });

  // ── Edges (drawn BEFORE nodes so nodes paint over) ───────────────────────
  edges.forEach(e => {
    const s = pos[e.source], t = pos[e.target];
    if (!s || !t) return;

    const hp    = !!e.isHappyPath;
    const color = hp ? '#45808B' : '#3F3F3F';
    const sw    = hp ? 2 : 1.5;
    const mkEnd = hp ? 'url(#seq-hp-end)' : 'url(#seq-end)';

    const sCol = col[e.source] ?? 0;
    const tCol = col[e.target] ?? 0;
    const isForward  = tCol > sCol;     // normal left→right flow
    const isBackward = tCol < sCol;     // loop / rework edge
    const sameCol    = tCol === sCol;

    // Half-extents for port computation
    const sHalfW = s.isEv ? EV_R : s.isGw ? GW : NODE_W/2;
    const sHalfH = s.isEv ? EV_R : s.isGw ? GW : NODE_H/2;
    const tHalfW = t.isEv ? EV_R : t.isGw ? GW : NODE_W/2;
    const tHalfH = t.isEv ? EV_R : t.isGw ? GW : NODE_H/2;

    let d, labelX, labelY;

    if (isForward) {
      // Exit right edge of source, enter left edge of target — orthogonal
      const x1 = s.cx + sHalfW, y1 = s.cy;
      const x2 = t.cx - tHalfW, y2 = t.cy;
      if (Math.abs(y1 - y2) < 6) {
        d = `M${x1},${y1} L${x2},${y2}`;
      } else {
        const mx = x1 + Math.max(20, (x2 - x1) / 2);
        d = `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`;
      }
      labelX = x1 + Math.max(20, (x2 - x1) / 2);
      labelY = Math.abs(y1-y2) < 6 ? y1 - 8 : (y1 + y2) / 2;
    } else if (isBackward) {
      // Loop: exit bottom of source, route below, enter bottom of target
      const x1 = s.cx, y1 = s.cy + sHalfH;
      const x2 = t.cx, y2 = t.cy + tHalfH;
      const dropY = Math.max(y1, y2) + 26;
      d = `M${x1},${y1} L${x1},${dropY} L${x2},${dropY} L${x2},${y2}`;
      labelX = (x1 + x2) / 2;
      labelY = dropY + 10;
    } else {
      // Same column (stacked): exit bottom→top or side depending on slot order
      const goingDown = t.cy > s.cy;
      const x1 = s.cx, y1 = s.cy + (goingDown ? sHalfH : -sHalfH);
      const x2 = t.cx, y2 = t.cy + (goingDown ? -tHalfH : tHalfH);
      if (Math.abs(x1 - x2) < 6) {
        d = `M${x1},${y1} L${x2},${y2}`;
      } else {
        const my = (y1 + y2) / 2;
        d = `M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`;
      }
      labelX = (x1 + x2) / 2 + 8;
      labelY = (y1 + y2) / 2;
    }

    svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"
      marker-end="${mkEnd}" stroke-linejoin="round"
      ${isBackward ? 'stroke-dasharray="6,3"' : ''}/>`;

    // Default-path marker: small diagonal slash near the source (BPMN convention)
    if (e.isDefault) {
      const dm = d.match(/^M([\d.]+),([\d.]+)/);
      if (dm) {
        const px = parseFloat(dm[1]), py = parseFloat(dm[2]);
        const ox = isForward ? 12 : 0, oy = isForward ? 0 : 12;
        svg += `<line x1="${px+ox-4}" y1="${py+oy-4}" x2="${px+ox+4}" y2="${py+oy+4}"
          stroke="${color}" stroke-width="1.5"/>`;
      }
    }

    // Edge label
    if (e.label) {
      const lw = Math.max(36, e.label.length * 6);
      svg += `<rect x="${labelX-lw/2-2}" y="${labelY-9}" width="${lw+4}" height="13"
        fill="white" rx="2" opacity="0.92"/>`;
      svg += `<text x="${labelX}" y="${labelY+1}" text-anchor="middle"
        fill="${color}" font-size="9" font-weight="${hp?'600':'400'}">
        ${escSvg(e.label)}
      </text>`;
    }
  });

  // ── Nodes (drawn AFTER edges) — clickable for targeted refinement (C2) ────
  nodes.forEach(n => {
    const p = pos[n.id];
    if (!p) return;
    const {cx, cy, isEv, isGw} = p;
    const label    = n.label || '';
    const isStart  = n.type === 'startEvent';
    const isEnd    = n.type === 'endEvent';
    const isInter  = n.type.includes('intermediate') || n.type.includes('Intermediate');
    const isHappy  = !!n.isHappyPath;
    // marker comes from explicit marker OR eventType (for start/end/intermediate events)
    const marker   = (n.marker && n.marker !== 'none' ? n.marker : (n.eventType || 'none')).toLowerCase();

    // Clickable group wrapper
    svg += `<g class="bpmn-node${selectedNodeId===n.id?' bpmn-node-sel':''}" data-node-id="${escSvg(n.id)}"
      onclick="selectNode('${escSvg(n.id)}', '${escSvg((label||'').replace(/'/g,'’'))}')" style="cursor:pointer;">`;

    // ── Events ──────────────────────────────────────────────────────────────
    if (isEv) {
      const fill   = isEnd ? '#fbeef0' : isStart ? '#eef7f9' : '#fff';
      const stroke = isEnd ? '#E4000B' : isStart ? '#54B9CB' : '#706F6F';
      const sw     = isEnd ? 4 : isStart ? 2.5 : 2;

      // Outer circle
      svg += `<circle cx="${cx}" cy="${cy}" r="${EV_R}" fill="${fill}"
        stroke="${stroke}" stroke-width="${sw}" filter="url(#sh)"/>`;

      // Intermediate: double ring
      if (isInter) {
        svg += `<circle cx="${cx}" cy="${cy}" r="${EV_R-4}" fill="none"
          stroke="${stroke}" stroke-width="1.2"/>`;
      }

      // End event: filled inner circle
      if (isEnd) {
        svg += `<circle cx="${cx}" cy="${cy}" r="${EV_R-6}" fill="#E4000B"/>`;
      }

      // ── OMG-compliant event markers ────────────────────────────────────
      const ms = EV_R * 0.55; // marker scale
      if (marker === 'message') {
        // Envelope outline
        svg += `<rect x="${cx-ms}" y="${cy-ms*0.65}" width="${ms*2}" height="${ms*1.3}"
          fill="${isEnd?'#E4000B':'none'}" stroke="${stroke}" stroke-width="1.2" rx="1"/>`;
        // Envelope V-line
        svg += `<polyline points="${cx-ms},${cy-ms*0.65} ${cx},${cy+ms*0.1} ${cx+ms},${cy-ms*0.65}"
          fill="none" stroke="${isEnd?'white':stroke}" stroke-width="1.2"/>`;
      } else if (marker === 'timer') {
        svg += `<circle cx="${cx}" cy="${cy}" r="${ms}" fill="none" stroke="${stroke}" stroke-width="1.2"/>`;
        // Clock hands
        svg += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy-ms+2}" stroke="${stroke}" stroke-width="1.5"/>`;
        svg += `<line x1="${cx}" y1="${cy}" x2="${cx+ms*0.5}" y2="${cy+ms*0.3}" stroke="${stroke}" stroke-width="1.5"/>`;
        // Tick marks
        for (let a = 0; a < 360; a += 90) {
          const rad = a * Math.PI/180;
          svg += `<line x1="${cx + (ms-1)*Math.cos(rad)}" y1="${cy + (ms-1)*Math.sin(rad)}"
            x2="${cx + ms*Math.cos(rad)}" y2="${cy + ms*Math.sin(rad)}"
            stroke="${stroke}" stroke-width="1"/>`;
        }
      } else if (marker === 'error') {
        svg += `<path d="M${cx-ms*0.5},${cy+ms*0.6} L${cx-ms*0.1},${cy-ms*0.2}
          L${cx+ms*0.2},${cy+ms*0.1} L${cx+ms*0.5},${cy-ms*0.6}"
          fill="none" stroke="${isEnd?'white':stroke}" stroke-width="1.5"/>`;
      } else if (marker === 'signal') {
        svg += `<polygon points="${cx},${cy-ms*0.8} ${cx+ms*0.7},${cy+ms*0.5} ${cx-ms*0.7},${cy+ms*0.5}"
          fill="${isEnd?stroke:'none'}" stroke="${stroke}" stroke-width="1.2"/>`;
      } else if (marker === 'terminate') {
        svg += `<circle cx="${cx}" cy="${cy}" r="${ms*0.7}" fill="${stroke}"/>`;
      }

      // Label below
      svg += renderWrappedLabel(cx, cy + EV_R + 13, label, 18, '#3F3F3F', 9, false);
    }

    // ── Gateways ────────────────────────────────────────────────────────────
    else if (isGw) {
      svg += `<polygon points="${cx},${cy-GW} ${cx+GW},${cy} ${cx},${cy+GW} ${cx-GW},${cy}"
        fill="white" stroke="#F19944" stroke-width="2" filter="url(#sh)"/>`;

      const gis = GW * 0.38; // inner symbol size
      if (n.type === 'exclusiveGateway') {
        // OMG: bold X
        svg += `<line x1="${cx-gis}" y1="${cy-gis}" x2="${cx+gis}" y2="${cy+gis}" stroke="#F19944" stroke-width="3"/>`;
        svg += `<line x1="${cx+gis}" y1="${cy-gis}" x2="${cx-gis}" y2="${cy+gis}" stroke="#F19944" stroke-width="3"/>`;
      } else if (n.type === 'parallelGateway') {
        // OMG: bold +
        svg += `<line x1="${cx-gis}" y1="${cy}" x2="${cx+gis}" y2="${cy}" stroke="#F19944" stroke-width="3"/>`;
        svg += `<line x1="${cx}" y1="${cy-gis}" x2="${cx}" y2="${cy+gis}" stroke="#F19944" stroke-width="3"/>`;
      } else if (n.type === 'inclusiveGateway') {
        // OMG: circle with border
        svg += `<circle cx="${cx}" cy="${cy}" r="${gis}" fill="none" stroke="#F19944" stroke-width="2.5"/>`;
      } else if (n.type === 'eventBasedGateway') {
        // OMG: circle + pentagon
        svg += `<circle cx="${cx}" cy="${cy}" r="${gis+2}" fill="none" stroke="#F19944" stroke-width="1.5"/>`;
        svg += `<circle cx="${cx}" cy="${cy}" r="${gis}" fill="none" stroke="#F19944" stroke-width="1"/>`;
      } else if (n.type === 'complexGateway') {
        // OMG: asterisk *
        for (let a = 0; a < 180; a += 45) {
          const rad = a * Math.PI/180;
          svg += `<line x1="${cx - gis*Math.cos(rad)}" y1="${cy - gis*Math.sin(rad)}"
            x2="${cx + gis*Math.cos(rad)}" y2="${cy + gis*Math.sin(rad)}"
            stroke="#F19944" stroke-width="2"/>`;
        }
      }
      // Label below diamond
      svg += renderWrappedLabel(cx, cy + GW + 13, label, 16, '#C77A2E', 9, false);
    }

    // ── Tasks ────────────────────────────────────────────────────────────────
    else {
      const x    = cx - NODE_W/2;
      const y    = cy - NODE_H/2;
      const fill = isHappy ? '#eef4f5' : '#ffffff';
      const strk = isHappy ? '#45808B' : '#3F3F3F';
      const sw   = isHappy ? 2 : 1.5;
      const isCA = n.type === 'callActivity'; // Call Activity: thick border

      svg += `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}"
        rx="5" ry="5" fill="${fill}" stroke="${strk}"
        stroke-width="${isCA ? 4 : sw}" filter="url(#sh)"/>`;

      // SubProcess: inner rounded rect
      if (n.type === 'subProcess') {
        svg += `<rect x="${x+3}" y="${y+3}" width="${NODE_W-6}" height="${NODE_H-6}"
          rx="3" fill="none" stroke="${strk}" stroke-width="1" opacity="0.4"/>`;
        // [+] marker at bottom centre
        svg += `<rect x="${cx-8}" y="${y+NODE_H-13}" width="16" height="11" rx="2"
          fill="white" stroke="${strk}" stroke-width="1"/>`;
        svg += `<text x="${cx}" y="${y+NODE_H-5}" text-anchor="middle"
          fill="${strk}" font-size="10" font-weight="700">+</text>`;
      }

      // ── OMG task type marker (top-left corner) ───────────────────────────
      const TASK_ICONS = {
        userTask:         drawUserTaskIcon,
        serviceTask:      drawServiceTaskIcon,
        scriptTask:       drawScriptTaskIcon,
        sendTask:         drawSendTaskIcon,
        receiveTask:      drawReceiveTaskIcon,
        manualTask:       drawManualTaskIcon,
        businessRuleTask: drawBusinessRuleIcon,
      };
      if (TASK_ICONS[n.type]) {
        svg += TASK_ICONS[n.type](x + 6, y + 5, strk);
      }

      // ── Loop/MI markers at bottom centre ─────────────────────────────────
      if (n.loopType === 'standard' || n.loop) {
        svg += `<path d="M${cx-6},${y+NODE_H-7} A7,7 0 1,1 ${cx+6},${y+NODE_H-7}"
          fill="none" stroke="${strk}" stroke-width="1.5"
          marker-end="url(#seq-end)"/>`;
      }
      if (n.multiInstance === 'parallel') {
        for (let i=-1;i<=1;i++) {
          svg += `<line x1="${cx+i*4}" y1="${y+NODE_H-12}" x2="${cx+i*4}" y2="${y+NODE_H-4}"
            stroke="${strk}" stroke-width="1.5"/>`;
        }
      }
      if (n.multiInstance === 'sequential') {
        for (let i=-1;i<=1;i++) {
          svg += `<line x1="${cx-7}" y1="${y+NODE_H-5-i*4}" x2="${cx+7}" y2="${y+NODE_H-5-i*4}"
            stroke="${strk}" stroke-width="1.5"/>`;
        }
      }

      // ── Task label (centred, word-wrapped) ──────────────────────────────
      const hasIcon = !!TASK_ICONS[n.type];
      const labelX  = hasIcon ? cx + 6 : cx;
      const labelW  = hasIcon ? NODE_W - 20 : NODE_W - 10;
      svg += renderWrappedLabel(labelX, cy, label, labelW, '#3F3F3F', 10, true);
    }

    svg += `</g>`; // close clickable node group
  });

  // ── Data Objects (drawn near their associated activity) ───────────────────
  (lc.dataObjects || []).forEach((dobj, i) => {
    const host = pos[dobj.node];
    if (!host) return;
    // Place above the activity (inputs/left, outputs/right), stagger to avoid overlap
    const dw = 26, dh = 32;
    const isOutput = dobj.type === 'output';
    const dx = host.cx + (isOutput ? 34 : -34) + (i % 2) * 6;
    const dy = host.cy - NODE_H/2 - 30;
    const fold = 8;

    // Association (dashed line activity → data object)
    svg += `<path d="M${host.cx},${host.cy - NODE_H/2} L${dx},${dy + dh}"
      fill="none" stroke="#706F6F" stroke-width="1" stroke-dasharray="3,2"
      marker-end="${dobj.type==='output' ? 'url(#data-arrow)' : ''}"/>`;

    if (dobj.type === 'store') {
      // Data store: cylinder
      svg += `<path d="M${dx-dw/2},${dy+4} a${dw/2},4 0 0,1 ${dw},0 v${dh-8} a${dw/2},4 0 0,1 -${dw},0 Z"
        fill="#fff" stroke="#706F6F" stroke-width="1.2"/>
        <path d="M${dx-dw/2},${dy+4} a${dw/2},4 0 0,0 ${dw},0" fill="none" stroke="#706F6F" stroke-width="1.2"/>`;
    } else {
      // Document: page with folded corner
      svg += `<path d="M${dx-dw/2},${dy} h${dw-fold} l${fold},${fold} v${dh-fold} h-${dw} Z"
        fill="#fff" stroke="#706F6F" stroke-width="1.2"/>
        <path d="M${dx+dw/2-fold},${dy} v${fold} h${fold} Z" fill="#f0f0f0" stroke="#706F6F" stroke-width="1"/>`;
      // input/output arrow inside
      const ac = dobj.type === 'output' ? '#45808B' : '#706F6F';
      svg += `<path d="M${dx-5},${dy+dh/2+2} h7 m-3,-3 l3,3 l-3,3"
        fill="none" stroke="${ac}" stroke-width="1.2"/>`;
    }
    // Label below the data object
    svg += renderWrappedLabel(dx, dy + dh + 9, dobj.label||'', 60, '#706F6F', 8, false);
  });

  // ── Boundary Events (drawn on the activity border) ────────────────────────
  nodes.forEach(n => {
    if (!Array.isArray(n.boundaryEvents) || !n.boundaryEvents.length) return;
    const host = pos[n.id];
    if (!host) return;
    const bn = n.boundaryEvents.length;
    n.boundaryEvents.forEach((b, i) => {
      // Position along the bottom edge of the activity
      const bx = host.cx - NODE_W/2 + (NODE_W * (i+1)) / (bn+1);
      const by = host.cy + NODE_H/2;
      const r = 11;
      const interrupting = b.interrupting !== false;
      // Double circle (boundary), dashed if non-interrupting
      svg += `<circle cx="${bx}" cy="${by}" r="${r}" fill="#fff"
        stroke="#3F3F3F" stroke-width="1.5" ${interrupting ? '' : 'stroke-dasharray="3,2"'}/>
        <circle cx="${bx}" cy="${by}" r="${r-3}" fill="none"
        stroke="#3F3F3F" stroke-width="1" ${interrupting ? '' : 'stroke-dasharray="3,2"'}/>`;
      // Marker symbol
      const bt = (b.type||'timer').toLowerCase();
      const ms = r * 0.5;
      if (bt === 'timer') {
        svg += `<circle cx="${bx}" cy="${by}" r="${ms}" fill="none" stroke="#3F3F3F" stroke-width="1"/>
          <line x1="${bx}" y1="${by}" x2="${bx}" y2="${by-ms+1}" stroke="#3F3F3F" stroke-width="1"/>
          <line x1="${bx}" y1="${by}" x2="${bx+ms*0.5}" y2="${by+ms*0.4}" stroke="#3F3F3F" stroke-width="1"/>`;
      } else if (bt === 'error') {
        svg += `<path d="M${bx-ms*0.6},${by+ms*0.6} L${bx-ms*0.1},${by-ms*0.3} L${bx+ms*0.3},${by+ms*0.2} L${bx+ms*0.6},${by-ms*0.6}"
          fill="none" stroke="#E4000B" stroke-width="1.3"/>`;
      } else if (bt === 'message') {
        svg += `<rect x="${bx-ms}" y="${by-ms*0.7}" width="${ms*2}" height="${ms*1.4}" fill="none" stroke="#3F3F3F" stroke-width="1"/>
          <polyline points="${bx-ms},${by-ms*0.7} ${bx},${by+ms*0.1} ${bx+ms},${by-ms*0.7}" fill="none" stroke="#3F3F3F" stroke-width="1"/>`;
      } else if (bt === 'signal') {
        svg += `<polygon points="${bx},${by-ms*0.8} ${bx+ms*0.7},${by+ms*0.5} ${bx-ms*0.7},${by+ms*0.5}" fill="none" stroke="#F19944" stroke-width="1.2"/>`;
      }
      // Exception flow: from boundary event to its target
      const tgt = pos[b.target];
      if (tgt) {
        const ty = tgt.cy + (tgt.isEv ? EV_R : tgt.isGw ? GW : NODE_H/2);
        const dropY = by + 22;
        svg += `<path d="M${bx},${by+r} L${bx},${dropY} L${tgt.cx},${dropY} L${tgt.cx},${ty}"
          fill="none" stroke="#E4000B" stroke-width="1.3" stroke-dasharray="5,3"
          marker-end="url(#seq-end)"/>`;
        if (b.label) {
          const lw = Math.max(36, b.label.length * 5.5);
          svg += `<rect x="${bx - lw/2}" y="${dropY-13}" width="${lw}" height="12" fill="white" rx="2" opacity="0.9"/>
            <text x="${bx}" y="${dropY-4}" text-anchor="middle" fill="#E4000B" font-size="8.5">${escSvg(b.label)}</text>`;
        }
      }
    });
  });

  // ── Message Flows (dashed, open arrow — BPMN convention) ──────────────────
  const extY = {};
  exts.forEach((x, i) => { extY[x.id] = { top: 8 + i * (EXT_H + EXT_GAP), bottom: 8 + i * (EXT_H + EXT_GAP) + EXT_H }; });

  (lc.messageFlows || []).forEach(mf => {
    const sExt = extY[mf.source], tExt = extY[mf.target];
    const sNode = pos[mf.source], tNode = pos[mf.target];
    let x1, y1, x2, y2;

    if (sExt && tNode) {
      // external → process node (e.g. Kunde sendet Antrag)
      x1 = tNode.cx; y1 = sExt.bottom;
      x2 = tNode.cx; y2 = tNode.cy - tNode.h/2;
    } else if (sNode && tExt) {
      // process node → external (e.g. Bestätigung an Kunde)
      x1 = sNode.cx; y1 = sNode.cy - sNode.h/2;
      x2 = sNode.cx; y2 = tExt.bottom;
    } else {
      return; // both external or unresolvable — skip drawing
    }

    // Open circle at source, dashed line, open arrow at target
    svg += `<circle cx="${x1}" cy="${y1}" r="4" fill="white" stroke="#706F6F" stroke-width="1.2"/>`;
    svg += `<path d="M${x1},${y1 + (y2>y1?4:-4)} L${x2},${y2}" fill="none"
      stroke="#706F6F" stroke-width="1.3" stroke-dasharray="7,4" marker-end="url(#msg-arrow)"/>`;

    if (mf.label) {
      const ly = (y1 + y2) / 2;
      const lw = Math.max(36, mf.label.length * 5.8);
      svg += `<rect x="${x1 - lw/2 - 2}" y="${ly - 8}" width="${lw + 4}" height="13" fill="white" rx="2" opacity="0.92"/>`;
      svg += `<text x="${x1}" y="${ly + 2}" text-anchor="middle" fill="#706F6F" font-size="9" font-style="italic">${escSvg(mf.label)}</text>`;
    }
  });

  svg += '</svg>';

  const wrapper = document.getElementById('bpmn-svg-wrapper');
  wrapper.innerHTML = `
    <div class="bpmn-legend" id="bpmn-legend">
      <div class="legend-title" onclick="document.getElementById('bpmn-legend').classList.toggle('collapsed')">
        <span>BPMN-Legende</span><span class="legend-chevron">▾</span>
      </div>
      <div class="legend-body">
        <div class="legend-row"><svg width="22" height="22"><circle cx="11" cy="11" r="8" fill="#eef7f9" stroke="#54B9CB" stroke-width="2.5"/></svg> Start-Ereignis</div>
        <div class="legend-row"><svg width="22" height="22"><circle cx="11" cy="11" r="8" fill="#fbeef0" stroke="#E4000B" stroke-width="3.5"/></svg> End-Ereignis</div>
        <div class="legend-row"><svg width="22" height="22"><rect x="2" y="5" width="18" height="12" rx="2" fill="#eef4f5" stroke="#45808B" stroke-width="1.5"/></svg> Aufgabe (Happy Path)</div>
        <div class="legend-row"><svg width="22" height="22"><rect x="2" y="5" width="18" height="12" rx="2" fill="#fff" stroke="#3F3F3F" stroke-width="1.5"/></svg> Aufgabe (Alternativ)</div>
        <div class="legend-row"><svg width="22" height="22"><polygon points="11,2 20,11 11,20 2,11" fill="#fff" stroke="#F19944" stroke-width="2"/><line x1="7" y1="7" x2="15" y2="15" stroke="#F19944" stroke-width="2"/><line x1="15" y1="7" x2="7" y2="15" stroke="#F19944" stroke-width="2"/></svg> XOR-Gateway (Entscheidung)</div>
        <div class="legend-row"><svg width="22" height="22"><polygon points="11,2 20,11 11,20 2,11" fill="#fff" stroke="#F19944" stroke-width="2"/><line x1="6" y1="11" x2="16" y2="11" stroke="#F19944" stroke-width="2"/><line x1="11" y1="6" x2="11" y2="16" stroke="#F19944" stroke-width="2"/></svg> AND-Gateway (parallel)</div>
        <div class="legend-row"><svg width="22" height="22"><rect x="3" y="4" width="6" height="14" fill="#CBCBCB" stroke="#E4000B" stroke-width="1.5" stroke-dasharray="3,2"/></svg> Rolle nicht im Katalog</div>
        <div class="legend-row"><svg width="22" height="22"><circle cx="11" cy="11" r="8" fill="#fff" stroke="#3F3F3F" stroke-width="1.5"/><circle cx="11" cy="11" r="5" fill="none" stroke="#3F3F3F" stroke-width="1"/></svg> Boundary-Event (Ausnahme)</div>
        <div class="legend-row"><svg width="22" height="22"><path d="M5,3 h8 l3,3 v13 h-14 Z" fill="#fff" stroke="#706F6F" stroke-width="1.2"/></svg> Datenobjekt (Input/Output)</div>
        <div class="legend-row"><svg width="22" height="22"><circle cx="3" cy="11" r="2.5" fill="#fff" stroke="#706F6F" stroke-width="1"/><line x1="6" y1="11" x2="15" y2="11" stroke="#706F6F" stroke-width="1.2" stroke-dasharray="4,2"/><path d="M15,8 L20,11 L15,14 Z" fill="#fff" stroke="#706F6F" stroke-width="1"/></svg> Message Flow (extern)</div>
      </div>
    </div>
    <div class="bpmn-zoom-controls">
      <button class="zoom-btn" onclick="bpmnZoom(-0.15)" title="Verkleinern">−</button>
      <span class="zoom-level" id="zoom-level">100%</span>
      <button class="zoom-btn" onclick="bpmnZoom(0.15)" title="Vergrössern">+</button>
      <button class="zoom-btn" onclick="bpmnZoomFit()" title="Einpassen">⤢</button>
      <button class="zoom-btn" onclick="bpmnZoomReset()" title="100%">1:1</button>
    </div>
    <div class="bpmn-viewport" id="bpmn-viewport">
      <div class="bpmn-canvas-inner" id="bpmn-canvas-inner">${svg}</div>
    </div>`;
  wrapper.style.display = 'block';
  document.getElementById('bpmn-empty').style.display = 'none';
  currentBpmnXml = svg;

  // Store layout for BPMN 2.0 XML export (D1)
  lastLayout = { pos, laneY, laneH, SVG_W, SVG_H, POOL_HDR, LANE_HDR, NODE_W, NODE_H, GW, EV_R,
    extOffset, EXT_H, EXT_GAP, extY };

  // Init zoom/pan
  bpmnViewState = { zoom: 1, panX: 0, panY: 0, baseW: SVG_W, baseH: SVG_H };
  applyBpmnTransform();
  setupBpmnPan();
  setTimeout(bpmnZoomFit, 50);
}

// ── Zoom / Pan state & handlers ──────────────────────────────────────────────
let bpmnViewState = { zoom: 1, panX: 0, panY: 0, baseW: 0, baseH: 0 };

// ── C2: Node selection → targeted refinement ────────────────────────────────
function selectNode(id, label) {
  const input = document.getElementById('refine-input');
  if (selectedNodeId === id) {
    // Deselect on second click
    selectedNodeId = null;
    document.querySelectorAll('.bpmn-node-sel').forEach(g => g.classList.remove('bpmn-node-sel'));
    if (input && input.value.startsWith('Knoten «')) input.value = '';
    return;
  }
  selectedNodeId = id;
  document.querySelectorAll('.bpmn-node-sel').forEach(g => g.classList.remove('bpmn-node-sel'));
  const g = document.querySelector(`.bpmn-node[data-node-id="${id}"]`);
  if (g) g.classList.add('bpmn-node-sel');
  if (input) {
    input.value = `Knoten «${label}»: `;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
  setStatus(`Knoten «${label}» ausgewählt — Anweisung eingeben (z.B. umbenennen, löschen, Schritt danach einfügen)`, '');
}

function applyBpmnTransform() {
  const inner = document.getElementById('bpmn-canvas-inner');
  if (!inner) return;
  const { zoom, panX, panY } = bpmnViewState;
  inner.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  inner.style.transformOrigin = '0 0';
  const lvl = document.getElementById('zoom-level');
  if (lvl) lvl.textContent = Math.round(zoom * 100) + '%';
}

function bpmnZoom(delta) {
  bpmnViewState.zoom = Math.max(0.2, Math.min(3, bpmnViewState.zoom + delta));
  applyBpmnTransform();
}

function bpmnZoomReset() {
  bpmnViewState.zoom = 1; bpmnViewState.panX = 0; bpmnViewState.panY = 0;
  applyBpmnTransform();
}

function bpmnZoomFit() {
  const vp = document.getElementById('bpmn-viewport');
  if (!vp) return;
  const pad = 40;
  const scaleX = (vp.clientWidth - pad) / bpmnViewState.baseW;
  const scaleY = (vp.clientHeight - pad) / bpmnViewState.baseH;
  bpmnViewState.zoom = Math.max(0.2, Math.min(2, Math.min(scaleX, scaleY)));
  bpmnViewState.panX = Math.max(0, (vp.clientWidth - bpmnViewState.baseW * bpmnViewState.zoom) / 2);
  bpmnViewState.panY = 20;
  applyBpmnTransform();
}

function setupBpmnPan() {
  const vp = document.getElementById('bpmn-viewport');
  if (!vp) return;
  let dragging = false, sx = 0, sy = 0, px = 0, py = 0;

  vp.addEventListener('mousedown', e => {
    dragging = true; sx = e.clientX; sy = e.clientY;
    px = bpmnViewState.panX; py = bpmnViewState.panY;
    vp.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    bpmnViewState.panX = px + (e.clientX - sx);
    bpmnViewState.panY = py + (e.clientY - sy);
    applyBpmnTransform();
  });
  window.addEventListener('mouseup', () => { dragging = false; vp.style.cursor = 'grab'; });

  // Ctrl+wheel to zoom, plain wheel to scroll-pan vertically
  vp.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      bpmnZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }
  }, { passive: false });
}

// ── Word-wrap label helper ───────────────────────────────────────────────────
// cx/cy = anchor, maxW = wrap width in chars (pixel approx), centred = true → cy is midpoint
function renderWrappedLabel(cx, cy, text, maxW, color, fontSize, centred) {
  if (!text) return '';
  const approxCharW = fontSize * 0.58;
  const charsPerLine = Math.max(8, Math.floor(maxW / approxCharW));
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  words.forEach(w => {
    if (cur && (cur + ' ' + w).length > charsPerLine) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  });
  if (cur) lines.push(cur);

  const lineH   = fontSize + 3;
  const totalH  = lines.length * lineH;
  const startY  = centred ? cy - totalH/2 + lineH*0.75 : cy;

  return lines.map((line, i) =>
    `<text x="${cx}" y="${startY + i*lineH}" text-anchor="middle"
      dominant-baseline="auto" fill="${color}"
      font-size="${fontSize}" font-weight="500">${escSvg(line)}</text>`
  ).join('');
}

// ── OMG Task type icons (SVG path fragments, top-left at ox,oy) ──────────────
function drawUserTaskIcon(ox, oy, c) {
  return `<circle cx="${ox+7}" cy="${oy+5}" r="4" fill="none" stroke="${c}" stroke-width="1.2"/>
    <path d="M${ox+1},${oy+14} C${ox+1},${oy+10} ${ox+13},${oy+10} ${ox+13},${oy+14}"
      fill="none" stroke="${c}" stroke-width="1.2"/>`;
}
function drawServiceTaskIcon(ox, oy, c) {
  // Gear / cog symbol
  const cx=ox+7, cy2=oy+7, r=4, ri=2.2;
  let g = `<circle cx="${cx}" cy="${cy2}" r="${ri}" fill="none" stroke="${c}" stroke-width="1.2"/>`;
  for (let a=0;a<360;a+=60) {
    const rad=a*Math.PI/180;
    g += `<rect x="${cx+r*Math.cos(rad)-1}" y="${cy2+r*Math.sin(rad)-1}"
      width="2" height="2" fill="${c}" transform="rotate(${a},${cx},${cy2})"/>`;
  }
  g += `<circle cx="${cx}" cy="${cy2}" r="${r}" fill="none" stroke="${c}" stroke-width="1.5"/>`;
  return g;
}
function drawScriptTaskIcon(ox, oy, c) {
  return `<rect x="${ox+2}" y="${oy+1}" width="10" height="13" rx="1"
    fill="none" stroke="${c}" stroke-width="1.2"/>
    <line x1="${ox+4}" y1="${oy+4}" x2="${ox+10}" y2="${oy+4}" stroke="${c}" stroke-width="1"/>
    <line x1="${ox+4}" y1="${oy+7}" x2="${ox+10}" y2="${oy+7}" stroke="${c}" stroke-width="1"/>
    <line x1="${ox+4}" y1="${oy+10}" x2="${ox+9}" y2="${oy+10}" stroke="${c}" stroke-width="1"/>`;
}
function drawSendTaskIcon(ox, oy, c) {
  return `<rect x="${ox+1}" y="${oy+3}" width="12" height="9" rx="1"
    fill="${c}" stroke="${c}" stroke-width="1"/>
    <polyline points="${ox+1},${oy+3} ${ox+7},${oy+8} ${ox+13},${oy+3}"
      fill="none" stroke="white" stroke-width="1.2"/>`;
}
function drawReceiveTaskIcon(ox, oy, c) {
  return `<rect x="${ox+1}" y="${oy+3}" width="12" height="9" rx="1"
    fill="none" stroke="${c}" stroke-width="1.2"/>
    <polyline points="${ox+1},${oy+3} ${ox+7},${oy+8} ${ox+13},${oy+3}"
      fill="none" stroke="${c}" stroke-width="1.2"/>`;
}
function drawManualTaskIcon(ox, oy, c) {
  return `<path d="M${ox+2},${oy+8} L${ox+2},${oy+5} L${ox+10},${oy+2} L${ox+12},${oy+4} L${ox+5},${oy+6}"
    fill="none" stroke="${c}" stroke-width="1.2"/>
    <path d="M${ox+2},${oy+8} L${ox+12},${oy+8} L${ox+12},${oy+13} L${ox+2},${oy+13} Z"
    fill="none" stroke="${c}" stroke-width="1.2"/>`;
}
function drawBusinessRuleIcon(ox, oy, c) {
  return `<rect x="${ox+1}" y="${oy+2}" width="12" height="11" rx="1"
    fill="none" stroke="${c}" stroke-width="1.2"/>
    <rect x="${ox+1}" y="${oy+2}" width="12" height="4" fill="${c}" opacity="0.3"/>
    <line x1="${ox+1}" y1="${oy+9}" x2="${ox+13}" y2="${oy+9}" stroke="${c}" stroke-width="0.8"/>
    <line x1="${ox+5}" y1="${oy+6}" x2="${ox+5}" y2="${oy+13}" stroke="${c}" stroke-width="0.8"/>`;
}

function escSvg(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Phase 3: Generate Documents (Onepager + RACI in ONE call — D2) ─────────
async function generateDocuments(originalText, lc, includeOnepager) {
  const risks = document.getElementById('opt-risks').checked;
  const laneNames = (lc.lanes||[]).map(l => l.name).join(', ');
  const activityNodes = (lc.nodes||[]).filter(n =>
    !n.type.includes('Gateway') && n.type !== 'startEvent' && n.type !== 'endEvent');
  const actList = activityNodes.map((n,i)=>`${i+1}. ${n.label} [Rolle: ${(lc.lanes||[]).find(l=>l.id===n.lane)?.name||'?'}, Typ: ${n.type}]`).join('\n');

  const onepagerSchema = `"onepager": {
    "processName": "Prozessname",
    "version": "1.0",
    "date": "${new Date().toLocaleDateString('de-CH')}",
    "scope": "Geltungsbereich: für wen und wo gilt dieser Prozess (Organisationseinheiten, Standorte, Systeme, Leistungsarten) und was ist ausdrücklich NICHT enthalten — 2-4 Sätze",
    "shortDescription": "Ausführliche Kurzbeschreibung (4-6 Sätze): Zweck des Prozesses, Auslöser, grober Ablauf in Etappen, beteiligte Rollen, Ergebnis und Nutzen für das Unternehmen",
    "goals": ["Prozessziel 1 (konkret, ergebnisorientiert)", "Prozessziel 2", "Prozessziel 3"],
    "risks": [{"label": "Prozessrisiko", "severity": "hoch|mittel|tief", "mitigation": "Gegenmassnahme/Kontrolle"}],
    "steps": [{"nr": 1, "activity": "Aktivität", "description": "Was konkret passiert (1-2 Sätze)", "input": "Eingehende Artefakte/Daten", "output": "Entstehende Artefakte/Ergebnis", "system": "IT-System (oder Rolle falls manuell)", "remark": "Bedingung/Frist/Hinweis oder leer"}]${legacyCtx ? `,
    "provenance": {"scope":"uebernommen|umformuliert|zusammengefasst|angereichert|generiert|luecke", "shortDescription":"...", "goals":"...", "risks":"...", "steps":"..."},
    "provenanceNotes": {"scope":"1 Satz: woraus entstanden", "shortDescription":"...", "goals":"...", "risks":"...", "steps":"..."},
    "openPoints": ["Punkt, den der Process Owner pruefen oder ergaenzen muss"],
    "dropped": [{"content":"Inhalt aus der Altdokumentation ohne Platz im neuen Template", "reason":"warum", "suggestion":"Detailkonzept|Prozessregister|verwerfen"}],
    "suspect": [{"content":"auffaelliger Altinhalt", "reason":"z.B. stammt inhaltlich aus einem anderen Prozess"}]` : ''}
  },`;

  const legacyBlock = legacyCtx ? `

=== MIGRATIONSKONTEXT — ALTE PROZESSDOKUMENTATION ===
Dies ist eine MIGRATION vom alten ins neue Prozessdokumentations-Template. Die folgenden Felder stammen aus der bestehenden Dokumentation und sind die primaere Quelle. Vorhandene Substanz wird uebernommen, nicht neu erfunden.

${legacyFieldsAsText(legacyCtx)}
=====================================================
` : '';

  const prompt = `Du hast folgenden Prozess analysiert:

Prozessname: ${lc.processName}
Beschreibung: ${lc.description||''}
Swimlanes/Rollen: ${laneNames}

Aktivitäten im Modell (in Reihenfolge):
${actList}

Originalbeschreibung:
${originalText}
${legacyBlock}
Verfügbare offizielle Rollen:
${roleCatalog.join(', ')}

Erstelle ${includeOnepager ? 'einen Prozess-Onepager nach Inventx-Vorgabe UND eine RACI-Matrix' : 'eine RACI-Matrix'}. Antworte NUR mit JSON, kein Markdown, keine Backticks:

{
  ${includeOnepager ? onepagerSchema : ''}
  "raci": {
    "roles": ["Rolle1", "Rolle2"],
    "activities": [{"nr": 1, "activity": "Aktivitätsname", "assignments": {"Rolle1": "R", "Rolle2": "A"}}],
    "notes": "optionaler Hinweis zu Annahmen"
  }
}

Regeln Onepager:
- "scope" ist der Geltungsbereich und steht VOR dem Steckbrief: Wer/welche Einheiten sind betroffen, welche Systeme/Leistungsarten umfasst er, und was ist ausdrücklich ausgeschlossen (Abgrenzung).
- shortDescription, goals und risks bilden den "Steckbrief". Die shortDescription soll aussagekräftig sein (4-6 Sätze) und den Prozess so beschreiben, dass ein Aussenstehender ihn versteht — nicht nur ein Einzeiler.
- "steps" bildet JEDE fachliche Aktivität ab (Reihenfolge wie im Modell). Gateways/Events sind KEINE eigene Zeile; ihre Logik fliesst in "remark" ein (z.B. "nur bei positivem Entscheid").
- "input"/"output": konkrete Artefakte benennen. "system": echtes System (CRM, ITSM-Tool, E-Mail) oder Rolle bei manuellen Schritten.
- ${risks ? 'Mindestens 2-3 Prozessrisiken ableiten.' : 'risks darf leer sein.'}
${legacyCtx ? `
Regeln Migration (zwingend):
- QUELLENTREUE: Wo die Altdokumentation Substanz liefert, uebernimm sie inhaltlich. Formuliere sprachlich sauber, aber erfinde keine abweichenden Aussagen. Nichts Wesentliches darf verloren gehen.
- "goals" = logische Zusammenfuehrung von "Prozessziel" UND "Kritische Erfolgsfaktoren" der Altdokumentation zu ergebnisorientierten Zielen. Erfolgsfaktoren sind als Ziel zu formulieren (Beispiel: "Hoher Automatisierungsgrad" wird zu "Patches werden weitestgehend automatisiert ausgerollt"). Keine Dopplungen.
- "scope": Die Altdokumentation kennt keinen Geltungsbereich. Leite einen ENTWURF ab aus Prozessziel, Definitionen, Abgrenzungen, betroffenen Systemen, Kunden und Plattformen. Nenne auch, was NICHT enthalten ist. Setze provenance.scope auf "generiert".
- "Definitionen/Begrifflichkeiten" haben im neuen Template kein eigenes Kapitel: Arbeite sie dort ein, wo sie tragen — abgrenzende Begriffe in "scope", erklaerende Begriffe in "shortDescription". Was nicht sinnvoll integrierbar ist, kommt nach "dropped" mit suggestion "Detailkonzept".
- "steps": Basis sind die Prozessschritte der Altdokumentation. Input, Output, System und Bemerkung fehlen dort und sind abzuleiten — Input/Output aus der Schrittlogik und den Input-/Output-Triggern, System aus der Applikationen- und Tools-Tabelle. Wo eine Ableitung nicht belastbar ist, schreibe "?" statt zu raten, und nimm den Punkt in "openPoints" auf.
- ACHTUNG Fremdinhalte: Alte Dokumentationen enthalten teils Copy-Paste aus anderen Prozessen (etwa eine Rolle "Incident Manager" in einem Service-Request-Prozess). Uebernimm solche Inhalte NICHT stillschweigend — trage sie in "suspect" ein.
- Wenn die alte Prozessschritte-Tabelle keine echten Schritte enthaelt, sondern Phasen oder Namen anderer Prozesse, dann leite daraus echte Aktivitaeten ab und vermerke das in "openPoints".
- "provenance" je Feld ehrlich setzen: "uebernommen" nur wenn die Altdoku den Inhalt wirklich hergab, "umformuliert" bei sprachlicher Ueberarbeitung, "zusammengefasst" beim Merge mehrerer Quellfelder, "angereichert" wenn Altinhalt plus Ergaenzung, "generiert" wenn allein aus Fachwissen, "luecke" wenn weder Quelle noch belastbare Ableitung existiert.
- "openPoints": alles, was der Process Owner bestaetigen oder liefern muss (fehlende Risiken, unklare Systeme, veraltete Verweise, tbd-Eintraege).
- Nutze allgemein verfuegbares Fachwissen (ITIL 4, ISO/IEC 20000, ISO 27001, COBIT) zur Anreicherung — aber klar als "generiert" gekennzeichnet, nie als Aussage der Altdokumentation getarnt.` : ''}

Regeln RACI:
- RACI: R=Responsible (führt aus), A=Accountable (verantwortlich, genau EIN A pro Aktivität), C=Consulted, I=Informed.
- Rollen = Swimlanes des Modells; weitere offizielle Rollen nur wenn klar konsultiert/informiert.
- Genau EIN "A" pro Aktivität, mindestens ein "R". Nur beteiligte Rollen in "assignments".
- Die RACI-Aktivitäten entsprechen 1:1 den "steps" (gleiche Nummerierung).

Deutsch, Swiss-Konvention (kein ß). Kurz und präzise.`;

  const response = await processApiFetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || 'KI-Anfrage fehlgeschlagen (' + response.status + ')'); }
  const data = await response.json();
  const raw = data.content.map(b => b.text||'').join('').trim()
    .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();

  const docs = safeParseJSON(raw, 'Dokumente');
  if (includeOnepager && docs.onepager) {
    currentOnepager = docs.onepager;
    renderOnepager(currentOnepager);
  }
  if (docs.raci) {
    currentRaci = docs.raci;
    renderRaci(currentRaci);
  }
}

// ─── Render Onepager ──────────────────────────────────────────────────────────
function renderOnepager(op) {
  let html = `<div class="onepager">
    <div class="op-header">
      <div class="op-badge">📋 Prozess-Onepager</div>
      <div class="op-title">${esc(op.processName)}</div>
    </div>
    <div class="op-meta-row">
      <div class="op-meta-item"><div class="op-meta-label">Version</div><div class="op-meta-value">${esc(op.version||'1.0')}</div></div>
      <div class="op-meta-item"><div class="op-meta-label">Stand</div><div class="op-meta-value">${esc(op.date)}</div></div>
    </div>
    <div class="op-body">`;

  // ── GELTUNGSBEREICH (vor dem Steckbrief) ──
  if (op.scope) {
    html += `<div>
      <div class="op-section-title">Geltungsbereich${provBadge(op,'scope')}</div>
      <div class="op-scope">${esc(op.scope)}</div>
    </div>`;
  }

  // ── STECKBRIEF ──
  html += `<div>
    <div class="op-section-title">Steckbrief</div>
    <div class="op-steckbrief">`;

  // Kurzbeschreibung
  html += `<div class="op-sb-block">
    <div class="op-sb-label">Kurzbeschreibung${provBadge(op,'shortDescription')}</div>
    <div class="op-text">${esc(op.shortDescription||op.goal||'')}</div>
  </div>`;

  // Prozessziele
  if (op.goals && op.goals.length) {
    html += `<div class="op-sb-block">
      <div class="op-sb-label">Prozessziele${provBadge(op,'goals')}</div>
      <ul class="op-goal-list">
        ${op.goals.map(g => `<li>${esc(g)}</li>`).join('')}
      </ul>
    </div>`;
  }

  // Prozessrisiken
  if (op.risks && op.risks.length) {
    html += `<div class="op-sb-block">
      <div class="op-sb-label">Prozessrisiken${provBadge(op,'risks')}</div>
      <div class="op-risks">
        ${op.risks.map(r => `
          <div class="op-risk">
            <div class="risk-badge risk-${(r.severity||'mittel').toLowerCase()}">${(r.severity||'mittel').toUpperCase()}</div>
            <div><strong style="font-size:12px">${esc(r.label)}</strong>${r.mitigation ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">→ ${esc(r.mitigation)}</div>` : ''}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  html += `</div></div>`; // end steckbrief

  // ── PROZESSSCHRITTE (Tabelle) ──
  if (op.steps && op.steps.length) {
    html += `<div>
      <div class="op-section-title">Prozessschritte${provBadge(op,'steps')}</div>
      <div class="op-table-wrap">
        <table class="op-table">
          <thead>
            <tr>
              <th class="col-nr">Nr.</th>
              <th class="col-act">Aktivität</th>
              <th class="col-desc">Beschreibung</th>
              <th class="col-io">Input</th>
              <th class="col-io">Output</th>
              <th class="col-sys">System</th>
              <th class="col-rem">Bemerkung</th>
            </tr>
          </thead>
          <tbody>`;
    op.steps.forEach((s, i) => {
      html += `<tr>
        <td class="col-nr">${s.nr||i+1}</td>
        <td class="col-act"><strong>${esc(s.activity||s.title||'')}</strong></td>
        <td>${esc(s.description||'')}</td>
        <td>${esc(s.input||'—')}</td>
        <td>${esc(s.output||'—')}</td>
        <td>${esc(s.system||'—')}</td>
        <td class="col-rem">${esc(s.remark||'')}</td>
      </tr>`;
    });
    html += `</tbody></table></div></div>`;
  }

  html += `</div></div>`;

  document.getElementById('onepager-content').innerHTML = html;
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── XML Tab ─────────────────────────────────────────────────────────────────
function renderXmlTab(lc) {
  const json = JSON.stringify(lc, null, 2);
  document.getElementById('xml-content').innerHTML = `
    <div style="margin-bottom:12px">
      <div class="section-label" style="margin-bottom:6px">Logic-Core JSON (BPMN Generator Format)</div>
      <div class="xml-display" id="xml-display">${escHtml(json)}</div>
    </div>`;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Exports ──────────────────────────────────────────────────────────────────
function slugName() {
  return (currentLogicCore?.processName||'prozess')
    .replace(/[^\wäöüÄÖÜ\s-]/g,'').replace(/\s+/g,'-').toLowerCase();
}

function exportSVG() {
  if (!currentBpmnXml) return;
  const blob = new Blob([currentBpmnXml], {type:'image/svg+xml;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slugName()+'-bpmn.svg';
  a.click();
  URL.revokeObjectURL(a.href);
}

// High-resolution PNG raster for PowerPoint / Confluence
function exportPNG() {
  if (!currentBpmnXml) return;
  setStatus('PNG wird gerendert…', 'running');
  const svgEl = document.querySelector('#bpmn-svg-wrapper svg');
  const w = parseFloat(svgEl.getAttribute('width'));
  const h = parseFloat(svgEl.getAttribute('height'));
  const scale = 3; // 3× for crisp output

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slugName()+'-bpmn.png';
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus('✓ PNG exportiert (3× Auflösung)', 'done');
    }, 'image/png');
  };
  img.onerror = () => setStatus('PNG-Export fehlgeschlagen', 'error');
  img.src = url;
}

// ─── D1: BPMN 2.0 XML Export (Camunda / bpmn.io / ADONIS-kompatibel) ─────────
function escXml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function exportBpmnXml() {
  if (!currentLogicCore || !lastLayout) { setStatus('Erst ein Diagramm generieren.', 'error'); return; }
  const lc = currentLogicCore;
  const L = lastLayout;
  const pid = 'Process_1';

  // Element type mapping
  const typeMap = {
    startEvent:'startEvent', endEvent:'endEvent', intermediateEvent:'intermediateCatchEvent',
    userTask:'userTask', serviceTask:'serviceTask', sendTask:'sendTask', receiveTask:'receiveTask',
    manualTask:'manualTask', scriptTask:'scriptTask', businessRuleTask:'businessRuleTask',
    subProcess:'subProcess', callActivity:'callActivity',
    exclusiveGateway:'exclusiveGateway', parallelGateway:'parallelGateway',
    inclusiveGateway:'inclusiveGateway', eventBasedGateway:'eventBasedGateway'
  };
  const evDef = t => t==='message' ? '<bpmn:messageEventDefinition/>'
    : t==='timer' ? '<bpmn:timerEventDefinition/>'
    : t==='error' ? '<bpmn:errorEventDefinition/>'
    : t==='signal' ? '<bpmn:signalEventDefinition/>'
    : t==='terminate' ? '<bpmn:terminateEventDefinition/>' : '';

  // incoming/outgoing per node
  const inc = {}, out = {};
  lc.edges.forEach(e => {
    (out[e.source] = out[e.source]||[]).push(e.id);
    (inc[e.target] = inc[e.target]||[]).push(e.id);
  });

  // default flows per gateway
  const defaultOf = {};
  lc.edges.forEach(e => { if (e.isDefault) defaultOf[e.source] = e.id; });

  // ── Process elements ──
  let elems = '';
  lc.nodes.forEach(n => {
    const tag = typeMap[n.type] || 'task';
    const ev = (n.eventType || n.marker || 'none').toLowerCase();
    const defAttr = defaultOf[n.id] ? ` default="${escXml(defaultOf[n.id])}"` : '';
    elems += `    <bpmn:${tag} id="${escXml(n.id)}" name="${escXml(n.label||'')}"${defAttr}>\n`;
    (inc[n.id]||[]).forEach(e => elems += `      <bpmn:incoming>${escXml(e)}</bpmn:incoming>\n`);
    (out[n.id]||[]).forEach(e => elems += `      <bpmn:outgoing>${escXml(e)}</bpmn:outgoing>\n`);
    if (tag.includes('Event') && ev !== 'none') elems += `      ${evDef(ev)}\n`;
    elems += `    </bpmn:${tag}>\n`;

    // Boundary events attached to this activity
    (n.boundaryEvents||[]).forEach(b => {
      elems += `    <bpmn:boundaryEvent id="${escXml(b.id)}" name="${escXml(b.label||'')}" attachedToRef="${escXml(n.id)}" cancelActivity="${b.interrupting!==false}">\n`;
      if (b.target) elems += `      <bpmn:outgoing>flow_${escXml(b.id)}</bpmn:outgoing>\n`;
      elems += `      ${evDef((b.type||'timer').toLowerCase())}\n    </bpmn:boundaryEvent>\n`;
      if (b.target) elems += `    <bpmn:sequenceFlow id="flow_${escXml(b.id)}" sourceRef="${escXml(b.id)}" targetRef="${escXml(b.target)}"/>\n`;
    });
  });
  lc.edges.forEach(e => {
    elems += `    <bpmn:sequenceFlow id="${escXml(e.id)}" name="${escXml(e.label||'')}" sourceRef="${escXml(e.source)}" targetRef="${escXml(e.target)}"/>\n`;
  });
  (lc.dataObjects||[]).forEach(d => {
    elems += `    <bpmn:dataObjectReference id="${escXml(d.id)}" name="${escXml(d.label||'')}" dataObjectRef="${escXml(d.id)}_obj"/>\n    <bpmn:dataObject id="${escXml(d.id)}_obj"/>\n`;
  });

  // ── Lanes ──
  let laneXml = '    <bpmn:laneSet id="LaneSet_1">\n';
  lc.lanes.forEach(l => {
    laneXml += `      <bpmn:lane id="${escXml(l.id)}" name="${escXml(l.name)}">\n`;
    lc.nodes.filter(n => n.lane === l.id).forEach(n => {
      laneXml += `        <bpmn:flowNodeRef>${escXml(n.id)}</bpmn:flowNodeRef>\n`;
    });
    laneXml += `      </bpmn:lane>\n`;
  });
  laneXml += '    </bpmn:laneSet>\n';

  // ── Diagram Interchange (DI) ──
  let di = '';
  lc.lanes.forEach(l => {
    di += `      <bpmndi:BPMNShape id="${escXml(l.id)}_di" bpmnElement="${escXml(l.id)}" isHorizontal="true">
        <dc:Bounds x="${L.POOL_HDR}" y="${Math.round(L.laneY[l.id]||0)}" width="${L.SVG_W - L.POOL_HDR}" height="${Math.round(L.laneH[l.id]||160)}"/>
      </bpmndi:BPMNShape>\n`;
  });
  lc.nodes.forEach(n => {
    const p = L.pos[n.id];
    if (!p) return;
    di += `      <bpmndi:BPMNShape id="${escXml(n.id)}_di" bpmnElement="${escXml(n.id)}">
        <dc:Bounds x="${Math.round(p.cx - p.w/2)}" y="${Math.round(p.cy - p.h/2)}" width="${Math.round(p.w)}" height="${Math.round(p.h)}"/>
      </bpmndi:BPMNShape>\n`;
    (n.boundaryEvents||[]).forEach((b, i) => {
      const bn = n.boundaryEvents.length;
      const bx = p.cx - L.NODE_W/2 + (L.NODE_W * (i+1)) / (bn+1);
      const by = p.cy + L.NODE_H/2;
      di += `      <bpmndi:BPMNShape id="${escXml(b.id)}_di" bpmnElement="${escXml(b.id)}">
        <dc:Bounds x="${Math.round(bx-11)}" y="${Math.round(by-11)}" width="22" height="22"/>
      </bpmndi:BPMNShape>\n`;
    });
  });
  lc.edges.forEach(e => {
    const s = L.pos[e.source], t = L.pos[e.target];
    if (!s || !t) return;
    di += `      <bpmndi:BPMNEdge id="${escXml(e.id)}_di" bpmnElement="${escXml(e.id)}">
        <di:waypoint x="${Math.round(s.cx + s.w/2)}" y="${Math.round(s.cy)}"/>
        <di:waypoint x="${Math.round(t.cx - t.w/2)}" y="${Math.round(t.cy)}"/>
      </bpmndi:BPMNEdge>\n`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    id="Definitions_1"
    targetNamespace="http://inventx.ch/bpmn"
    exporter="Inventx BPMN Prozess-Generator" exporterVersion="1.1">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Participant_main" name="${escXml(lc.processName||'Prozess')}" processRef="${pid}"/>
${(lc.externalParticipants||[]).map(x =>
    `    <bpmn:participant id="${escXml(x.id)}" name="${escXml(x.name)}"/>`).join('\n')}
${(lc.messageFlows||[]).map(m =>
    `    <bpmn:messageFlow id="${escXml(m.id)}" name="${escXml(m.label||'')}" sourceRef="${escXml(m.source)}" targetRef="${escXml(m.target)}"/>`).join('\n')}
  </bpmn:collaboration>
  <bpmn:process id="${pid}" name="${escXml(lc.processName||'Prozess')}" isExecutable="false">
${laneXml}${elems}  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="Participant_main_di" bpmnElement="Participant_main" isHorizontal="true">
        <dc:Bounds x="0" y="${Math.round(L.extOffset||0)}" width="${L.SVG_W}" height="${L.SVG_H - Math.round(L.extOffset||0)}"/>
      </bpmndi:BPMNShape>
${(lc.externalParticipants||[]).map(x => {
    const e = (L.extY||{})[x.id] || {top: 8};
    return `      <bpmndi:BPMNShape id="${escXml(x.id)}_di" bpmnElement="${escXml(x.id)}" isHorizontal="true">
        <dc:Bounds x="0" y="${Math.round(e.top)}" width="${L.SVG_W}" height="${L.EXT_H||34}"/>
      </bpmndi:BPMNShape>`;
  }).join('\n')}
${(lc.messageFlows||[]).map(m => {
    const eS = (L.extY||{})[m.source], eT = (L.extY||{})[m.target];
    const nS = L.pos[m.source], nT = L.pos[m.target];
    let wp = '';
    if (eS && nT) wp = `<di:waypoint x="${Math.round(nT.cx)}" y="${Math.round(eS.bottom)}"/><di:waypoint x="${Math.round(nT.cx)}" y="${Math.round(nT.cy - nT.h/2)}"/>`;
    else if (nS && eT) wp = `<di:waypoint x="${Math.round(nS.cx)}" y="${Math.round(nS.cy - nS.h/2)}"/><di:waypoint x="${Math.round(nS.cx)}" y="${Math.round(eT.bottom)}"/>`;
    else return '';
    return `      <bpmndi:BPMNEdge id="${escXml(m.id)}_di" bpmnElement="${escXml(m.id)}">${wp}</bpmndi:BPMNEdge>`;
  }).filter(Boolean).join('\n')}
${di}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

  const blob = new Blob([xml], {type:'application/xml'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slugName()+'.bpmn';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('✓ BPMN 2.0 XML exportiert — öffnet in Camunda, bpmn.io, ADONIS', 'done');
}

// ─── D3: Confluence Storage Format Export (Onepager + RACI) ──────────────────
function exportConfluence() {
  if (!currentOnepager && !currentRaci) { setStatus('Erst Onepager/RACI generieren.', 'error'); return; }
  const op = currentOnepager;
  let x = '';

  if (op) {
    const M = (legacyCtx && legacyCtx.meta) ? legacyCtx.meta : {};

    x += `<h2>1  Geltungsbereich</h2>\n<p>${escXml(op.scope||'')}</p>\n`;

    x += `<h2>2  Prozesssteckbrief</h2>\n`;
    x += `<table><tbody><tr><th>Status</th><th>Review-Instanz</th><th>Prozess Owner</th></tr>`;
    x += `<tr><td>${escXml(M.status||'')}</td><td>${escXml(M.review||'')}</td><td>${escXml(M.owner||'')}</td></tr></tbody></table>\n`;

    const goalCell = (op.goals && op.goals.length) ? `<ul>${op.goals.map(g=>`<li>${escXml(g)}</li>`).join('')}</ul>` : '';
    const riskCell = (op.risks && op.risks.length) ? `<ul>${op.risks.map(r=>`<li>${escXml(r.label)}${r.mitigation?` — ${escXml(r.mitigation)}`:''}</li>`).join('')}</ul>` : '';
    x += `<table><tbody>`;
    x += `<tr><th>Prozessbezeichnung</th><td>${escXml(op.processName||'')}</td></tr>`;
    x += `<tr><th>Kurzbeschreibung</th><td>${escXml(op.shortDescription||'')}</td></tr>`;
    x += `<tr><th>Prozessziele</th><td>${goalCell}</td></tr>`;
    x += `<tr><th>Prozessrisiken</th><td>${riskCell}</td></tr>`;
    x += `</tbody></table>\n`;

    x += `<h2>3  Vereinfachtes Prozessmodell</h2>\n`;
    x += `<p><em>Vorschlag aus der Migration — BPMN separat als SVG exportieren und hier einfuegen.</em></p>\n`;

    if (op.steps && op.steps.length) {
      x += `<h2>4  Prozessschritte</h2>\n<p>Ergänzende Beschreibung der Aktivitäten:</p>\n`;
      x += `<table><tbody><tr><th>#</th><th>Aktivität</th><th>Beschreibung</th><th>Input</th><th>Output</th><th>System</th><th>Bemerkungen</th></tr>`;
      x += op.steps.map((s,i)=>`<tr><td>(${s.nr||i+1})</td><td>${escXml(s.activity||'')}</td><td>${escXml(s.description||'')}</td><td>${escXml(s.input||'')}</td><td>${escXml(s.output||'')}</td><td>${escXml(s.system||'')}</td><td>${escXml(s.remark||'')}</td></tr>`).join('');
      x += `</tbody></table>\n`;
    }

    x += `<h2>5  Weiterführende Links</h2>\n`;
    x += `<table><tbody><tr><th>Thema</th><th>Typ</th><th>Link</th></tr>`;
    const links = buildLinkRows();
    x += (links.length ? links.map(l=>`<tr><td>${escXml(l.thema)}</td><td>${escXml(l.typ)}</td><td>${escXml(l.link)}</td></tr>`).join('')
                       : `<tr><td></td><td></td><td></td></tr>`);
    x += `</tbody></table>\n`;

    x += `<h3><em>Technische Verweise (werden durch Prozessmanagement erfasst)</em></h3>\n`;
    x += `<table><tbody><tr><th>Kategorie</th><th>Hauptprozess</th><th>Prozessgruppe</th></tr>`;
    x += `<tr><td>${escXml(M.kategorie||'')}</td><td>${escXml(M.hauptprozess||'')}</td><td>${escXml(M.prozessgruppe||'')}</td></tr></tbody></table>\n`;

    if (legacyCtx && ((op.openPoints||[]).length || (op.dropped||[]).length || (op.suspect||[]).length)) {
      x += `<h2><em>Anhang Migration — vor Freigabe zu klären, nicht Bestandteil der Prozessdokumentation</em></h2>\n`;
      if ((op.openPoints||[]).length) x += `<h3>Offene Punkte</h3><ul>${op.openPoints.map(p=>`<li>${escXml(p)}</li>`).join('')}</ul>\n`;
      if ((op.suspect||[]).length) x += `<h3>Auffällige Altinhalte</h3><ul>${op.suspect.map(p=>`<li>${escXml(p.content)} — ${escXml(p.reason)}</li>`).join('')}</ul>\n`;
      if ((op.dropped||[]).length) x += `<h3>Nicht übernommene Inhalte</h3><ul>${op.dropped.map(p=>`<li>${escXml(p.content)} — ${escXml(p.reason)}${p.suggestion?` (${escXml(p.suggestion)})`:''}</li>`).join('')}</ul>\n`;
    }
  }

  if (currentRaci?.roles?.length && currentRaci?.activities?.length) {
    const roles = currentRaci.roles;
    x += `<h2>RACI-Matrix</h2><table><tbody><tr><th>Nr.</th><th>Aktivität</th>${roles.map(r=>`<th>${escXml(r)}</th>`).join('')}</tr>`;
    x += currentRaci.activities.map((a,i)=>`<tr><td>${a.nr||i+1}</td><td>${escXml(a.activity)}</td>${roles.map(r=>`<td>${escXml((a.assignments||{})[r]||'')}</td>`).join('')}</tr>`).join('');
    x += `</tbody></table>\n`;
    if (currentRaci.notes) x += `<p><em>${escXml(currentRaci.notes)}</em></p>\n`;
  }

  const blob = new Blob([x], {type:'text/xml;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = slugName()+'-confluence.xml';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('✓ Confluence Storage Format exportiert — via «Einfügen > Markup» in Confluence einfügen', 'done');
}

function exportXML() {  if (!currentLogicCore) return;
  const json = JSON.stringify(currentLogicCore, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (currentLogicCore?.processName||'prozess').replace(/\s+/g,'-').toLowerCase()+'-logic-core.json';
  a.click();
}

function copyXML() {
  if (!currentLogicCore) return;
  navigator.clipboard.writeText(JSON.stringify(currentLogicCore, null, 2))
    .then(() => setStatus('JSON in Zwischenablage kopiert', 'done'))
    .catch(() => setStatus('Kopieren fehlgeschlagen', 'error'));
}

// ─── Role Catalog Management (Admin tab) ─────────────────────────────────────
const ROLE_STORE = 'bpmn:roles';

async function loadRoleCatalog() {
  try {
    const res = await window.storage.get(ROLE_STORE);
    roleCatalog = res ? JSON.parse(res.value) : [...DEFAULT_ROLES];
  } catch(e) {
    roleCatalog = [...DEFAULT_ROLES];
  }
  // De-dup + sort
  roleCatalog = [...new Set(roleCatalog)].sort((a,b)=>a.localeCompare(b,'de'));
  renderRoleCatalog();
}

async function persistRoles() {
  const r = await safeStorageSet(ROLE_STORE, JSON.stringify(roleCatalog));
  if (r && !r.ok) setStatus('⚠ Rollenkatalog konnte nicht gespeichert werden.', 'error');
}

function renderRoleCatalog() {
  const list = document.getElementById('admin-role-list');
  if (!list) return;
  const filter = (document.getElementById('role-filter')?.value || '').toLowerCase();
  document.getElementById('role-count').textContent = roleCatalog.length;
  const shown = roleCatalog.filter(r => r.toLowerCase().includes(filter));
  list.innerHTML = shown.map(r => `
    <div class="role-card">
      <span class="role-card-name" title="${esc(r)}">${esc(r)}</span>
      <button class="role-del" title="Rolle löschen" onclick="deleteRole('${esc(r).replace(/'/g,"\\'")}')">×</button>
    </div>
  `).join('') || `<div class="saved-empty" style="grid-column:1/-1">Keine Rolle gefunden</div>`;
}

async function addRole() {
  const input = document.getElementById('new-role-input');
  const name = input.value.trim();
  if (!name) return;
  if (roleCatalog.some(r => r.toLowerCase() === name.toLowerCase())) {
    setStatus('Rolle existiert bereits.', 'error');
    return;
  }
  roleCatalog.push(name);
  roleCatalog.sort((a,b)=>a.localeCompare(b,'de'));
  input.value = '';
  await persistRoles();
  renderRoleCatalog();
}

async function deleteRole(name) {
  roleCatalog = roleCatalog.filter(r => r !== name);
  await persistRoles();
  renderRoleCatalog();
}

// Check whether a lane name maps to an official role (fuzzy, case-insensitive)
function isOfficialRole(name) {
  if (!name) return false;
  const n = name.toLowerCase().trim();
  return roleCatalog.some(r => r.toLowerCase() === n);
}

// ─── Process Check (analysis + restructuring proposals) ──────────────────────
// ─── Deterministic pre-metrics for the process check (reduce hallucination) ──
function computeProcessMetrics(lc) {
  const nodes = lc.nodes || [];
  const edges = lc.edges || [];
  const lanes = lc.lanes || [];
  const nodeById = {};
  nodes.forEach(n => nodeById[n.id] = n);

  const isActivity = n => !n.type.includes('Gateway') && !n.type.includes('Event');
  const activities = nodes.filter(isActivity);
  const gateways = nodes.filter(n => n.type.includes('Gateway'));

  // Longest-path layering (Kahn, cycles ignored) — same approach as renderer
  const inDeg = {}, adj = {};
  nodes.forEach(n => { inDeg[n.id] = 0; adj[n.id] = []; });
  edges.forEach(e => {
    if (adj[e.source] !== undefined) adj[e.source].push(e.target);
    if (inDeg[e.target] !== undefined) inDeg[e.target]++;
  });
  const q = nodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
  const topo = []; const seen = new Set();
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id); topo.push(id);
    (adj[id]||[]).forEach(t => { if (--inDeg[t] <= 0 && !seen.has(t)) q.push(t); });
  }
  const col = {};
  topo.forEach(id => col[id] = 0);
  topo.forEach(id => (adj[id]||[]).forEach(t => { col[t] = Math.max(col[t]||0, (col[id]||0)+1); }));
  const longestPath = Math.max(0, ...Object.values(col)) + 1;

  // Handoffs: edges crossing lane boundaries
  const handoffs = edges.filter(e => {
    const s = nodeById[e.source], t = nodeById[e.target];
    return s && t && s.lane !== t.lane;
  }).length;

  // Rework loops: backward edges (target column < source column)
  const reworkLoops = edges.filter(e => (col[e.target]||0) < (col[e.source]||0)).length;

  // Automation share
  const autoTypes = ['serviceTask','scriptTask','businessRuleTask'];
  const autoCount = activities.filter(n => autoTypes.includes(n.type)).length;
  const autoShare = activities.length ? Math.round(100 * autoCount / activities.length) : 0;

  // Lane workload distribution
  const perLane = {};
  lanes.forEach(l => perLane[l.name] = 0);
  activities.forEach(n => {
    const ln = lanes.find(l => l.id === n.lane)?.name;
    if (ln !== undefined) perLane[ln] = (perLane[ln]||0) + 1;
  });

  const xorSplits = gateways.filter(n => n.type==='exclusiveGateway' && edges.filter(e=>e.source===n.id).length >= 2).length;
  const boundaryCount = nodes.reduce((s,n) => s + (Array.isArray(n.boundaryEvents) ? n.boundaryEvents.length : 0), 0);

  return {
    activities: activities.length,
    gateways: gateways.length,
    xorSplits,
    lanes: lanes.length,
    handoffs,
    longestPath,
    reworkLoops,
    autoShare,
    boundaryCount,
    dataObjects: (lc.dataObjects||[]).length,
    externalParticipants: (lc.externalParticipants||[]).length,
    messageFlows: (lc.messageFlows||[]).length,
    perLane
  };
}

function metricsAsText(m) {
  return `FAKTEN (deterministisch berechnet — nutze sie als Grundlage für Score und Befunde):
- Aktivitäten: ${m.activities} | Gateways: ${m.gateways} (davon ${m.xorSplits} XOR-Splits) | Lanes: ${m.lanes}
- Handoffs (Lane-Wechsel im Fluss): ${m.handoffs}
- Längster Pfad: ${m.longestPath} Ebenen | Rework-Schleifen: ${m.reworkLoops}
- Automatisierungsgrad: ${m.autoShare}% (service/script/businessRule-Tasks)
- Boundary Events: ${m.boundaryCount} | Datenobjekte: ${m.dataObjects} | Externe Partner: ${m.externalParticipants} (${m.messageFlows} Message Flows)
- Aktivitäten je Lane: ${Object.entries(m.perLane).map(([l,c])=>`${l}: ${c}`).join(', ')}
Interpretationshinweise: >4 Handoffs deutet auf Koordinationsaufwand; 0 Boundary Events bei Fristen-relevanten Prozessen = fehlende Ausnahmebehandlung; eine Lane mit >60% der Aktivitäten = Klumpenrisiko; 0% Automatisierung bei repetitiven Schritten = Potenzial.`;
}

async function runProcessCheck() {
  if (!currentLogicCore) { setStatus('Erst ein Diagramm generieren.', 'error'); return; }
  const btn = document.getElementById('btn-check');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = '⏳ Prüfe…';
  setStatus('Prozess-Check läuft…', 'running');

  try {
    const result = await analyzeProcess(currentLogicCore, currentSourceText);
    currentFindings = (result.findings || []).map((f, i) => ({ ...f, _id: 'f'+i, _decision: null }));
    showCheckModal(result);
    setStatus(`✓ Prozess-Check: ${currentFindings.length} Befund(e)`, 'done');
  } catch(e) {
    setStatus('Prozess-Check fehlgeschlagen: ' + e.message, 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

async function analyzeProcess(lc, sourceText) {
  const sys = `Du bist ein erfahrener BPMN- und Prozess-Auditor bei Inventx. Analysiere das Prozessmodell kritisch auf:
- LOGIK: fehlende/unerreichbare Pfade, Gateways ohne Zusammenführung, Sackgassen, fehlende Fehlerbehandlung
- EFFIZIENZ: unnötige Schritte, Wartezeiten, Doppelarbeit, Medienbrüche, Automatisierungspotenzial
- ROLLEN: mangelnde Funktionstrennung (z.B. Ausführung und Kontrolle in einer Hand), unklare Zuständigkeit, Vier-Augen-Prinzip bei kritischen Schritten
- OPTIMIERUNG: Parallelisierung, Zusammenlegung, Vereinfachung
- RISIKO: Compliance, fehlende Kontrollen, Single Point of Failure

Gib NUR valides JSON zurück, kein Markdown:
{
  "score": 0-100,
  "summary": "1-2 Sätze Gesamteinschätzung",
  "findings": [
    {
      "category": "logik|effizienz|rollen|optimierung|risiko",
      "severity": "hoch|mittel|tief",
      "title": "Kurzer Titel des Befunds",
      "problem": "Was ist das konkrete Problem im Modell",
      "proposal": "Konkreter Umbau-Vorschlag",
      "instruction": "Präzise, umsetzbare Anweisung zum Umbau des Logic-Core (so wie man sie einem BPMN-Editor geben würde) — z.B. 'Füge nach Knoten X ein exclusiveGateway Y ein das ...'"
    }
  ]
}

Regeln:
- Maximal 6 Befunde, nach Wichtigkeit (hoch zuerst).
- Jeder Befund braucht eine konkrete, anwendbare "instruction".
- Wenn der Prozess sauber ist, gib wenige oder keine findings zurück und einen hohen score.
- Nutze die mitgelieferten FAKTEN als Beleg — zitiere konkrete Zahlen in "problem" wo passend.
- Vom Nutzer BEREITS ABGELEHNTE Befunde (siehe Liste) NICHT erneut oder in umformulierter Form vorschlagen.
- Deutsch, Swiss-Konvention (kein ß).`;

  const response = await processApiFetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: sys,
      messages: [{
        role: 'user',
        content: `${metricsAsText(computeProcessMetrics(lc))}\n\nProzessmodell (Logic-Core):\n${JSON.stringify(lc)}\n\nUrsprüngliche Beschreibung:\n${sourceText||'(keine)'}${
  currentCheckHistory.rejected.length
    ? `\n\nBereits abgelehnte Befunde (NICHT erneut vorschlagen):\n${currentCheckHistory.rejected.map(r=>`- ${r.title} [${r.category}]`).join('\n')}`
    : ''}${
  currentCheckHistory.accepted.length
    ? `\n\nBereits umgesetzte Umbauten (als erledigt betrachten):\n${currentCheckHistory.accepted.map(r=>`- ${r.title}`).join('\n')}`
    : ''}`
      }]
    })
  });
  if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || 'KI-Anfrage fehlgeschlagen (' + response.status + ')'); }
  const data = await response.json();
  const raw = data.content.map(b => b.text||'').join('').trim()
    .replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  return safeParseJSON(raw, 'ProcessCheck');
}

function showCheckModal(result) {
  const body = document.getElementById('check-body');
  const scoreColor = result.score >= 75 ? 'var(--ix-blue)' : result.score >= 50 ? 'var(--ix-orange)' : 'var(--ix-red)';

  let html = `<div class="check-summary">
    <span class="check-score">Prozess-Reife: <span style="color:${scoreColor}">${result.score ?? '–'}/100</span></span><br>
    ${esc(result.summary||'')}
  </div>`;

  const histCount = currentCheckHistory.rejected.length + currentCheckHistory.accepted.length;
  if (histCount) {
    html += `<div style="font-size:11px;color:var(--text-muted);padding:2px 4px;">
      ℹ Frühere Entscheidungen berücksichtigt: ${currentCheckHistory.accepted.length} umgesetzt, ${currentCheckHistory.rejected.length} abgelehnt (werden nicht erneut vorgeschlagen).
    </div>`;
  }

  if (!currentFindings.length) {
    html += `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">
      ✓ Keine wesentlichen strukturellen Probleme gefunden.</div>`;
  } else {
    html += `<div style="font-size:11px;color:var(--text-muted);padding:0 4px 2px;">
      Wähle je Befund «Annehmen» oder «Ablehnen». Optional kannst du eine Anweisung ergänzen, die beim Umbau berücksichtigt wird.
    </div>`;
    currentFindings.forEach(f => {
      const cat = (f.category||'optimierung').toLowerCase();
      html += `<div class="finding" id="finding-${f._id}" data-fid="${f._id}">
        <div class="finding-head">
          <span class="finding-cat cat-${cat}">${cat}</span>
          <div class="finding-titlewrap">
            <span class="finding-title">${esc(f.title)}</span>
            <span class="finding-sev sev-${(f.severity||'mittel').toLowerCase()}">${(f.severity||'mittel').toUpperCase()}</span>
          </div>
        </div>
        <div class="finding-body">
          <span class="lbl">Problem:</span> ${esc(f.problem)}
          <div class="finding-proposal"><span class="lbl">Vorschlag:</span> ${esc(f.proposal)}</div>
        </div>
        <div class="finding-comment-wrap">
          <textarea class="finding-comment" data-fid="${f._id}" rows="1"
            placeholder="Kommentar / eigene Anweisung zu diesem Befund (optional)">${esc(f._comment||'')}</textarea>
        </div>
        <div class="finding-actions">
          <button type="button" class="fbtn accept" data-fid="${f._id}" data-decision="accept">✓ Annehmen</button>
          <button type="button" class="fbtn reject" data-fid="${f._id}" data-decision="reject">✕ Ablehnen</button>
        </div>
      </div>`;
    });
  }

  body.innerHTML = html;
  wireCheckModalEvents();
  document.getElementById('check-modal').style.display = 'flex';
  updateApplyButton();
}

// Event delegation — robust against inline-handler restrictions
function wireCheckModalEvents() {
  const body = document.getElementById('check-body');
  if (!body || body.dataset.wired === '1') return;
  body.dataset.wired = '1';

  body.addEventListener('click', ev => {
    const btn = ev.target.closest('.fbtn');
    if (!btn) return;
    ev.preventDefault();
    decideFinding(btn.dataset.fid, btn.dataset.decision);
  });

  body.addEventListener('input', ev => {
    const ta = ev.target.closest('.finding-comment');
    if (!ta) return;
    const f = currentFindings.find(x => x._id === ta.dataset.fid);
    if (f) f._comment = ta.value;
    // auto-grow
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
}

function decideFinding(id, decision) {
  const f = currentFindings.find(x => x._id === id);
  if (!f) return;
  f._decision = f._decision === decision ? null : decision;
  const el = document.getElementById('finding-'+id);
  if (!el) return;
  el.classList.toggle('accepted', f._decision === 'accept');
  el.classList.toggle('rejected', f._decision === 'reject');
  const a = el.querySelector('.fbtn.accept'), r = el.querySelector('.fbtn.reject');
  if (a) a.classList.toggle('active', f._decision === 'accept');
  if (r) r.classList.toggle('active', f._decision === 'reject');
  updateApplyButton();
}

function updateApplyButton() {
  const n = currentFindings.filter(f => f._decision === 'accept').length;
  const btn = document.getElementById('btn-apply-check');
  btn.disabled = n === 0;
  btn.innerHTML = `<span>✓</span> ${n} Umbau${n!==1?'ten':''} anwenden`;
}

function recordCheckDecisions() {
  let changed = false;
  currentFindings.forEach(f => {
    const entry = { title: f.title, category: f.category, severity: f.severity,
      comment: (f._comment||'').trim() || undefined, ts: Date.now() };
    if (f._decision === 'reject' && !currentCheckHistory.rejected.some(r => r.title === f.title)) {
      currentCheckHistory.rejected.push(entry); changed = true;
    }
    if (f._decision === 'accept' && !currentCheckHistory.accepted.some(r => r.title === f.title)) {
      currentCheckHistory.accepted.push(entry); changed = true;
    }
  });
  return changed;
}

function closeCheckModal() {
  document.getElementById('check-modal').style.display = 'none';
  const body = document.getElementById('check-body');
  if (body) body.dataset.wired = '';   // re-wire on next open
  if (recordCheckDecisions() && currentProcessId) {
    saveCurrentProcess(currentSourceText).catch(()=>{});
  }
}

async function applyAcceptedFindings() {
  const accepted = currentFindings.filter(f => f._decision === 'accept');
  if (!accepted.length) return;
  closeCheckModal();

  const combinedInstruction = accepted
    .map((f,i) => {
      const c = (f._comment||'').trim();
      return `${i+1}. ${f.instruction}${c ? `\n   Zusätzliche Vorgabe des Nutzers (hat Vorrang): ${c}` : ''}`;
    })
    .join('\n');

  const btn = document.getElementById('btn-refine');
  if (btn) { btn.disabled = true; }

  try {
    setStatus(`Wende ${accepted.length} Umbau-Vorschlag(e) an…`, 'running');
    const before = JSON.parse(JSON.stringify(currentLogicCore));
    pushHistory(); // C3

    const updated = await applyRefinement(currentLogicCore,
      `Wende folgende Prozess-Optimierungen am Modell an:\n${combinedInstruction}`);
    const warnings = validateAndRepair(updated);
    currentLogicCore = updated;
    renderBpmn(updated);
    renderXmlTab(updated);
    showDiffPanel(diffModels(before, updated)); // D4

    setStatus('Onepager & RACI werden aktualisiert…', 'running');
    const includeOnepager = document.getElementById('opt-onepager').checked;
    await generateDocuments(currentSourceText, updated, includeOnepager);
    await saveCurrentProcess(currentSourceText, 'Prozess-Check Umbau');
    setStatus(`✓ ${accepted.length} Optimierung(en) angewendet`, 'done');
  } catch(e) {
    setStatus('Umbau fehlgeschlagen: ' + e.message, 'error');
    console.error(e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── RACI Matrix rendering (data comes from generateDocuments) ──────────────
function renderRaci(raci) {
  const roles = raci.roles || [];
  const acts = raci.activities || [];
  if (!roles.length || !acts.length) {
    document.getElementById('raci-content').innerHTML =
      `<div class="empty-state"><div class="empty-icon">🅡</div><h3>Keine RACI-Daten</h3></div>`;
    return;
  }

  // Roles not in official catalog → flag
  const unofficial = roles.filter(r => !isOfficialRole(r));

  let html = `<div class="raci-wrap">
    <div class="raci-title">RACI-Matrix — ${esc(currentLogicCore?.processName||'Prozess')}</div>
    <div class="raci-sub">Automatisch abgeleitet aus Prozessmodell und Beschreibung. Genau ein «A» (Accountable) pro Aktivität.</div>
    <div class="raci-legend">
      <div class="raci-legend-item"><span class="raci-badge raci-R">R</span> Responsible — führt aus</div>
      <div class="raci-legend-item"><span class="raci-badge raci-A">A</span> Accountable — verantwortlich</div>
      <div class="raci-legend-item"><span class="raci-badge raci-C">C</span> Consulted — konsultiert</div>
      <div class="raci-legend-item"><span class="raci-badge raci-I">I</span> Informed — informiert</div>
    </div>
    <div class="raci-table-wrap">
      <table class="raci-table">
        <thead><tr>
          <th class="act-nr">Nr.</th>
          <th style="text-align:left">Aktivität</th>
          ${roles.map(r => `<th class="rotate"><div>${esc(r)}${!isOfficialRole(r)?' ⚠':''}</div></th>`).join('')}
        </tr></thead>
        <tbody>`;
  acts.forEach((a, i) => {
    html += `<tr>
      <td class="act-nr">${a.nr||i+1}</td>
      <td class="act-cell">${esc(a.activity)}</td>
      ${roles.map(r => {
        const v = (a.assignments||{})[r] || '';
        return `<td>${v ? `<span class="raci-cell-badge raci-${v}">${v}</span>` : ''}</td>`;
      }).join('')}
    </tr>`;
  });
  html += `</tbody></table></div>`;

  if (unofficial.length) {
    html += `<div class="raci-warn">⚠ Nicht im offiziellen Rollenkatalog: <strong>${unofficial.map(esc).join(', ')}</strong>. Im Admin-Tab erfassen oder im Modell durch eine offizielle Rolle ersetzen.</div>`;
  }

  // Cross-artifact consistency: 'R' should match the executing lane in the model
  if (currentLogicCore) {
    const actNodes = (currentLogicCore.nodes||[]).filter(n =>
      !n.type.includes('Gateway') && n.type !== 'startEvent' && n.type !== 'endEvent');
    const laneNameOf = id => (currentLogicCore.lanes||[]).find(l => l.id === id)?.name || '';
    const mismatches = [];
    acts.forEach((a, i) => {
      const node = actNodes[i];
      if (!node) return;
      const laneName = laneNameOf(node.lane);
      const rRoles = Object.entries(a.assignments||{}).filter(([,v]) => v === 'R').map(([r]) => r);
      if (laneName && rRoles.length && !rRoles.includes(laneName)) {
        mismatches.push(`Nr. ${a.nr||i+1} «${a.activity}»: R=${rRoles.join('/')}, Lane=${laneName}`);
      }
    });
    if (mismatches.length) {
      html += `<div class="raci-warn">⚠ RACI↔Modell-Abweichung — das «R» entspricht nicht der ausführenden Lane:<br>${mismatches.slice(0,5).map(esc).join('<br>')}${mismatches.length>5?`<br>… und ${mismatches.length-5} weitere`:''}</div>`;
    }
  }
  if (raci.notes) {
    html += `<div class="raci-sub" style="margin-top:12px"><strong>Hinweis:</strong> ${esc(raci.notes)}</div>`;
  }
  html += `</div>`;

  document.getElementById('raci-content').innerHTML = html;
}

// ─── C3: Undo (model history) ────────────────────────────────────────────────
function pushHistory() {
  if (!currentLogicCore) return;
  modelHistory.push({
    logicCore: JSON.parse(JSON.stringify(currentLogicCore)),
    onepager: currentOnepager ? JSON.parse(JSON.stringify(currentOnepager)) : null,
    raci: currentRaci ? JSON.parse(JSON.stringify(currentRaci)) : null,
    sourceText: currentSourceText
  });
  if (modelHistory.length > HISTORY_MAX) modelHistory.shift();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  if (btn) btn.disabled = modelHistory.length === 0;
}

async function undoModel() {
  if (!modelHistory.length) return;
  const snap = modelHistory.pop();
  currentLogicCore = snap.logicCore;
  currentOnepager = snap.onepager;
  currentRaci = snap.raci;
  if (snap.sourceText !== undefined) {
    currentSourceText = snap.sourceText;
    document.getElementById('process-input').value = currentSourceText;
  }
  renderBpmn(currentLogicCore);
  renderXmlTab(currentLogicCore);
  if (currentOnepager) renderOnepager(currentOnepager);
  if (currentRaci) renderRaci(currentRaci);
  hideDiffPanel();
  updateUndoButton();
  await saveCurrentProcess(currentSourceText, 'Rückgängig');
  setStatus('↶ Letzter Umbau rückgängig gemacht', 'done');
}

// ─── B2/D5: Sync description with current model ──────────────────────────────
async function syncDescription() {
  if (!currentLogicCore) { setStatus('Erst ein Diagramm generieren.', 'error'); return; }
  const btn = document.getElementById('btn-sync');
  btn.disabled = true;
  try {
    setStatus('Beschreibung wird aus dem Modell neu erzeugt…', 'running');
    const response = await processApiFetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Formuliere aus diesem BPMN-Prozessmodell eine präzise Freitext-Prozessbeschreibung (Fliesstext, deutsch, Swiss-Konvention ohne ß, 1-2 Absätze). Beschreibe Ablauf, Rollen, Entscheidungen und Ausnahmen so, dass aus dem Text das Modell rekonstruierbar wäre. Gib NUR den Beschreibungstext zurück, keine Überschrift, kein Markdown.\n\nModell:\n${JSON.stringify(currentLogicCore)}\n\nBisherige Beschreibung (Stil-Referenz):\n${currentSourceText||'(keine)'}`
        }]
      })
    });
    if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err.error?.message || 'KI-Anfrage fehlgeschlagen (' + response.status + ')'); }
    const data = await response.json();
    const newText = data.content.map(b => b.text||'').join('').trim();
    if (!newText) throw new Error('Leere Antwort');

    pushHistory(); // snapshot incl. old sourceText
    currentSourceText = newText;
    document.getElementById('process-input').value = newText;
    await saveCurrentProcess(newText, 'Beschreibung synchronisiert');
    setStatus('⇄ Beschreibung mit Modell synchronisiert', 'done');
  } catch(e) {
    setStatus('Sync fehlgeschlagen: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// ─── A1: Auto-Fix-Loop (structural warnings → model repair) ─────────────────

/* ══════════════════════════════════════════════════════════════════════════════
   Deterministische Reparatur nicht erreichbarer Knoten.

   Typischer Fall: das Modell erzeugt einen Ausnahmezweig (Eskalation, Rückweisung,
   Fehlerbehandlung), vergisst aber die eingehende Kante. Statt das nur zu melden
   und ein zerrissenes Diagramm stehen zu lassen, wird der Zweig angehängt:

   - Ankerknoten ist der letzte VOR dem Waisenzweig liegende erreichbare Knoten
     (die Knotenreihenfolge im Logic-Core folgt der Erzählreihenfolge).
   - Ist der Anker bereits ein Gateway, wird nur eine beschriftete Kante ergänzt.
   - Ist der Anker eine Aktivität mit genau einem Ausgang, wird ein XOR-Gateway
     eingezogen, damit kein impliziter Split entsteht.
   - Offene Enden des angehängten Zweigs werden auf ein End-Event geführt.

   Was sich nicht plausibel anhängen lässt, bleibt als Warnung stehen.
══════════════════════════════════════════════════════════════════════════════ */
function reachableFrom(lc, startId) {
  const adj = {};
  lc.nodes.forEach(n => adj[n.id] = []);
  lc.edges.forEach(e => { if (adj[e.source]) adj[e.source].push(e.target); });
  const seen = new Set([startId]), stack = [startId];
  while (stack.length) {
    const cur = stack.pop();
    (adj[cur] || []).forEach(nx => { if (!seen.has(nx)) { seen.add(nx); stack.push(nx); } });
  }
  return seen;
}

function repairReachability(lc, warnings) {
  const start = lc.nodes.find(n => n.type === 'startEvent');
  if (!start) return;

  let reach = reachableFrom(lc, start.id);
  let orphans = lc.nodes.filter(n => !reach.has(n.id));
  if (!orphans.length) return;

  const order = new Map(lc.nodes.map((n, i) => [n.id, i]));
  const uid = (p) => { let i = 1; while (lc.nodes.some(n => n.id === p + i) || lc.edges.some(e => e.id === p + i)) i++; return p + i; };
  const repaired = [], reported = new Set();
  let guard = 0;

  while (orphans.length && guard++ < 20) {
    const orphanIds = new Set(orphans.map(n => n.id));
    // Wurzeln des Waisenzweigs: keine Vorgänger ausserhalb des Waisenzweigs
    const roots = orphans.filter(n =>
      !lc.edges.some(e => e.target === n.id && !orphanIds.has(e.source)));
    const root = roots.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))[0];
    if (!root) break;

    // Ankersuche, in dieser Reihenfolge:
    //   1. unvollständiges XOR/OR-Gateway (Split mit nur einem Ausgang) — der fehlende Zweig gehört dorthin
    //   2. letzter erreichbarer Knoten derselben Lane vor dem Waisenknoten
    //   3. letzter erreichbarer Knoten überhaupt
    const cand = lc.nodes
      .filter(n => reach.has(n.id) && n.type !== 'endEvent'
                && (order.get(n.id) ?? 0) < (order.get(root.id) ?? 0))
      .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));
    const openSplit = cand.find(n =>
      /exclusiveGateway|inclusiveGateway/.test(n.type)
      && lc.edges.filter(e => e.source === n.id).length < 2);
    const anchor = openSplit || cand.find(n => n.lane === root.lane) || cand[0];

    if (!anchor) {
      warnings.push(`Knoten "${root.label || root.id}" ist vom Start nicht erreichbar und liess sich nicht automatisch anbinden.`);
      reported.add(root.id);
      orphans = orphans.filter(n => n.id !== root.id);
      continue;
    }

    const outs = lc.edges.filter(e => e.source === anchor.id);

    if (anchor.type.includes('Gateway')) {
      outs.forEach(e => { if (!e.label) e.label = 'Standard'; });
      lc.edges.push({ id: uid('e_fix_'), source: anchor.id, target: root.id,
                      label: 'Ausnahme', isHappyPath: false });
      repaired.push(`"${root.label || root.id}" an Gateway "${anchor.label || anchor.id}" angebunden`);
    } else {
      // XOR-Gateway einziehen, damit kein impliziter Split entsteht
      const gwId = uid('gw_fix_');
      lc.nodes.push({ id: gwId, type: 'exclusiveGateway', label: 'Ausnahme?',
                      lane: anchor.lane, isHappyPath: false, marker: 'none' });
      outs.forEach(e => { e.source = gwId; if (!e.label) e.label = 'nein'; });
      lc.edges.push({ id: uid('e_fix_'), source: anchor.id, target: gwId, isHappyPath: !!anchor.isHappyPath });
      lc.edges.push({ id: uid('e_fix_'), source: gwId, target: root.id, label: 'ja', isHappyPath: false });
      order.set(gwId, (order.get(anchor.id) ?? 0) + 0.5);
      repaired.push(`"${root.label || root.id}" über neues XOR-Gateway nach "${anchor.label || anchor.id}" angebunden`);
    }

    reach = reachableFrom(lc, start.id);
    orphans = lc.nodes.filter(n => !reach.has(n.id));
  }

  // Offene Enden der reparierten Zweige auf ein End-Event führen
  if (repaired.length) {
    const ends = lc.nodes.filter(n => n.type === 'endEvent');
    lc.nodes.forEach(n => {
      if (n.type === 'endEvent' || n.type.includes('Gateway')) return;
      if (lc.edges.some(e => e.source === n.id)) return;
      let end = ends[0];
      if (!end) {
        end = { id: uid('end_fix_'), type: 'endEvent', label: 'Ende', lane: n.lane, marker: 'none' };
        lc.nodes.push(end); ends.push(end);
      }
      lc.edges.push({ id: uid('e_fix_'), source: n.id, target: end.id, isHappyPath: false });
      repaired.push(`Offenes Ende nach "${n.label || n.id}" auf End-Event geführt`);
    });
  }

  if (repaired.length) {
    warnings.push(`Nicht erreichbare Zweige automatisch angebunden: ${repaired.join('; ')}. Fachliche Richtigkeit der Verzweigung bitte prüfen.`);
  }
  lc.nodes.filter(n => !reach.has(n.id) && !reported.has(n.id)).forEach(n => {
    warnings.push(`Knoten "${n.label || n.id}" ist vom Start nicht erreichbar.`);
  });
}

function structuralWarnings(warnings) {
  const patterns = [/Gateway/i, /erreichbar/i, /Ausgänge/i, /Verzweigung/i, /Join/i, /Split/i, /Boundary/i, /Start-Event/i, /End-Event/i, /entfernt/i, /verbunden/i];
  const exclude = [/Katalog/i, /^Rolle "/i, /automatisch angebunden/i, /Offenes Ende/i];
  return warnings.filter(w =>
    patterns.some(p => p.test(w)) && !exclude.some(p => p.test(w)));
}

async function autoFixStructure(lc, warnings) {
  const structural = structuralWarnings(warnings);
  if (!structural.length) return { lc, warnings, fixed: 0 };

  setStatus(`${structural.length} Strukturproblem(e) erkannt — automatische Korrektur…`, 'running');
  try {
    const fixed = await applyRefinement(lc,
      `Behebe folgende BPMN-Strukturprobleme am Modell (ohne den fachlichen Inhalt zu verändern):\n${structural.map((w,i)=>`${i+1}. ${w}`).join('\n')}`);
    const w2 = validateAndRepair(fixed);
    const s2 = structuralWarnings(w2);
    if (s2.length < structural.length) {
      return { lc: fixed, warnings: w2, fixed: structural.length - s2.length };
    }
  } catch(e) {
    console.warn('Auto-Fix fehlgeschlagen:', e);
  }
  return { lc, warnings, fixed: 0 };
}

// ─── D4: Model diff after refinements ────────────────────────────────────────
function diffModels(oldLc, newLc) {
  const oldNodes = new Map((oldLc.nodes||[]).map(n => [n.id, n]));
  const newNodes = new Map((newLc.nodes||[]).map(n => [n.id, n]));
  const oldEdges = new Set((oldLc.edges||[]).map(e => e.source+'→'+e.target));
  const newEdges = new Set((newLc.edges||[]).map(e => e.source+'→'+e.target));
  const oldLanes = new Set((oldLc.lanes||[]).map(l => l.name));
  const newLanes = new Set((newLc.lanes||[]).map(l => l.name));

  const addedNodes = [...newNodes.values()].filter(n => !oldNodes.has(n.id)).map(n => n.label||n.id);
  const removedNodes = [...oldNodes.values()].filter(n => !newNodes.has(n.id)).map(n => n.label||n.id);
  const renamedNodes = [...newNodes.values()]
    .filter(n => oldNodes.has(n.id) && (oldNodes.get(n.id).label||'') !== (n.label||''))
    .map(n => `${oldNodes.get(n.id).label} → ${n.label}`);
  const addedEdges = [...newEdges].filter(e => !oldEdges.has(e)).length;
  const removedEdges = [...oldEdges].filter(e => !newEdges.has(e)).length;
  const addedLanes = [...newLanes].filter(l => !oldLanes.has(l));
  const removedLanes = [...oldLanes].filter(l => !newLanes.has(l));

  return { addedNodes, removedNodes, renamedNodes, addedEdges, removedEdges, addedLanes, removedLanes,
    isEmpty: !addedNodes.length && !removedNodes.length && !renamedNodes.length && !addedEdges && !removedEdges && !addedLanes.length && !removedLanes.length };
}

function showDiffPanel(diff) {
  const panel = document.getElementById('diff-panel');
  if (!panel || diff.isEmpty) { hideDiffPanel(); return; }
  const rows = [];
  if (diff.addedNodes.length)   rows.push(`<span class="diff-add">＋ Knoten:</span> ${diff.addedNodes.map(esc).join(', ')}`);
  if (diff.removedNodes.length) rows.push(`<span class="diff-del">− Knoten:</span> ${diff.removedNodes.map(esc).join(', ')}`);
  if (diff.renamedNodes.length) rows.push(`<span class="diff-ren">✎ Umbenannt:</span> ${diff.renamedNodes.map(esc).join('; ')}`);
  if (diff.addedEdges)          rows.push(`<span class="diff-add">＋ ${diff.addedEdges} Fluss/Flüsse</span>`);
  if (diff.removedEdges)        rows.push(`<span class="diff-del">− ${diff.removedEdges} Fluss/Flüsse</span>`);
  if (diff.addedLanes.length)   rows.push(`<span class="diff-add">＋ Lane:</span> ${diff.addedLanes.map(esc).join(', ')}`);
  if (diff.removedLanes.length) rows.push(`<span class="diff-del">− Lane:</span> ${diff.removedLanes.map(esc).join(', ')}`);
  panel.innerHTML = `
    <div class="diff-title">Änderungen am Modell
      <button class="diff-close" onclick="hideDiffPanel()">×</button>
    </div>
    <div class="diff-rows">${rows.map(r => `<div class="diff-row">${r}</div>`).join('')}</div>`;
  panel.style.display = 'block';
}

function hideDiffPanel() {
  const panel = document.getElementById('diff-panel');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
}

// ─── Robust storage wrapper: serialized writes + retry + payload trimming ────
let _storageQueue = Promise.resolve();

function safeStorageSet(key, value) {
  _storageQueue = _storageQueue.catch(() => {}).then(async () => {
    try { await window.storage.set(key, value); return {ok:true}; }
    catch(error) { return {ok:false,error}; }
  });
  return _storageQueue;
}

// ─── Persistence: saved process list (window.storage) ───────────────────────
const STORE_INDEX = 'bpmn:index';

async function loadSavedIndex() {
  try {
    const res = await window.storage.get(STORE_INDEX);
    savedProcesses = res ? JSON.parse(res.value) : [];
  } catch(e) {
    savedProcesses = [];
  }
  renderSavedList();
}

async function persistIndex() {
  await safeStorageSet(STORE_INDEX, JSON.stringify(savedProcesses));
}

async function saveCurrentProcess(sourceText, lastEdit) {
  if (!currentLogicCore) return;
  const now = Date.now();
  const name = currentLogicCore.processName || 'Unbenannter Prozess';

  if (!currentProcessId) {
    currentProcessId = 'p_' + now.toString(36) + Math.random().toString(36).slice(2,5);
  }

  // Store full payload separately — incl. onepager & RACI (B3)
  const payload = {
    id: currentProcessId,
    name,
    sourceText,
    logicCore: currentLogicCore,
    onepager: currentOnepager,
    raci: currentRaci,
    checkHistory: currentCheckHistory,
    mode: MODE, legacyCtx, legacyFlags,
    updated: now
  };
  const res = await safeStorageSet('bpmn:proc:' + currentProcessId, JSON.stringify(payload));
  if (!res || !res.ok) {
    setStatus('⚠ Speichern fehlgeschlagen — Arbeit bleibt in dieser Sitzung erhalten, Export empfohlen.', 'error');
    return;
  }
  if (res.trimmed) {
    console.warn('Payload gekürzt gespeichert (Onepager/RACI ausgelassen).');
  }

  // Update index entry
  const existing = savedProcesses.find(p => p.id === currentProcessId);
  const meta = {
    id: currentProcessId,
    name,
    updated: now,
    nodes: currentLogicCore.nodes.length,
    lanes: (currentLogicCore.lanes||[]).length,
    lastEdit: lastEdit || ''
  };
  if (existing) Object.assign(existing, meta);
  else savedProcesses.unshift(meta);

  // Keep most-recent first
  savedProcesses.sort((a,b) => b.updated - a.updated);
  await persistIndex();
  renderSavedList();
}

function renderSavedList() {
  const list = document.getElementById('saved-list');
  const count = document.getElementById('saved-count');
  count.textContent = savedProcesses.length;
  if (!savedProcesses.length) {
    list.innerHTML = `<div class="saved-empty">Noch keine gespeicherten Prozesse</div>`;
    return;
  }
  list.innerHTML = savedProcesses.map(p => `
    <div class="saved-item ${p.id===currentProcessId?'active':''}" onclick="loadProcess('${p.id}')">
      <div class="saved-item-body">
        <div class="saved-item-name">${esc(p.name)}</div>
        <div class="saved-item-meta">${p.nodes} Knoten · ${p.lanes} Lanes · ${relTime(p.updated)}</div>
      </div>
      <button class="saved-item-del" title="Löschen"
        onclick="event.stopPropagation(); deleteProcess('${p.id}')">×</button>
    </div>
  `).join('');
}

function relTime(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'gerade eben';
  if (diff < 3600) return Math.floor(diff/60) + ' Min.';
  if (diff < 86400) return Math.floor(diff/3600) + ' Std.';
  const d = new Date(ts);
  return d.toLocaleDateString('de-CH', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

async function loadProcess(id) {
  try {
    const res = await window.storage.get('bpmn:proc:' + id);
    if (!res) { setStatus('Prozess nicht gefunden.', 'error'); return; }
    const payload = JSON.parse(res.value);

    resetAll();
    setMode(payload.mode || 'free');
    legacyCtx = payload.legacyCtx || null; legacyFlags = payload.legacyFlags || [];
    currentProcessId = id;
    currentLogicCore = payload.logicCore;
    currentSourceText = payload.sourceText || '';
    currentOnepager = payload.onepager || null;
    currentRaci = payload.raci || null;
    currentCheckHistory = payload.checkHistory || { rejected: [], accepted: [] };
    modelHistory = []; updateUndoButton(); hideDiffPanel();
    document.getElementById('process-input').value = currentSourceText;

    validateAndRepair(currentLogicCore);
    renderBpmn(currentLogicCore);
    renderXmlTab(currentLogicCore);

    // B3: use persisted documents; regenerate ONLY if missing
    if (currentOnepager) {
      renderOnepager(currentOnepager);
    }
    if (currentRaci) {
      renderRaci(currentRaci);
    }
    if (!currentOnepager || !currentRaci) {
      setStatus('Dokumente werden ergänzt…', 'running');
      const includeOnepager = document.getElementById('opt-onepager').checked && !currentOnepager;
      try {
        await generateDocuments(currentSourceText, currentLogicCore, includeOnepager);
        await saveCurrentProcess(currentSourceText);
      } catch(e){ console.warn('Dokument-Ergänzung fehlgeschlagen', e); }
    }

    if (legacyCtx) { renderMigrationReport(currentOnepager); document.getElementById('tab-migration').style.display = ''; }
    showOutputButtons();
    document.getElementById('refine-bar').style.display = 'flex';
    switchTab('bpmn');
    renderSavedList();
    setStatus(`✓ «${payload.name}» geladen — bereit zum Weiterbearbeiten`, 'done');
  } catch(e) {
    setStatus('Laden fehlgeschlagen: ' + e.message, 'error');
    console.error(e);
  }
}

async function deleteProcess(id) {
  try {
    await window.storage.delete('bpmn:proc:' + id);
  } catch(e) {}
  savedProcesses = savedProcesses.filter(p => p.id !== id);
  await persistIndex();
  if (currentProcessId === id) { currentProcessId = null; }
  renderSavedList();
  setStatus('Prozess gelöscht.', '');
}


/* ══════════════════════════════════════════════════════════════════════════════
   MIGRATIONSMODUS — altes Prozessdokumentations-Template  →  neues Template
   Wiederverwendet die bestehende Pipeline: die Altdokumentation wird geparst,
   zu einer strukturierten Quellbeschreibung verdichtet und durch dieselbe
   Logic-Core → BPMN → Onepager Strecke geschickt. Zusätzlich wird pro Zielfeld
   die Herkunft mitgeführt und ein Migrationsreport erzeugt.
══════════════════════════════════════════════════════════════════════════════ */

let MODE = 'free';
let legacyCtx = null;        // geparste Altdokumentation
let legacyFlags = [];        // deterministische Befunde vor dem Modellaufruf

function setMode(m) {
  MODE = m;
  document.getElementById('mode-free').classList.toggle('active', m === 'free');
  document.getElementById('mode-migrate').classList.toggle('active', m === 'migrate');
  document.getElementById('block-free').style.display    = (m === 'free')    ? '' : 'none';
  document.getElementById('block-migrate').style.display = (m === 'migrate') ? '' : 'none';
  document.getElementById('btn-text').textContent = (m === 'migrate') ? 'Migrieren' : 'Prozess generieren';
  setStatus(m === 'migrate'
    ? 'Migrationsmodus — alte Prozessdokumentation einfügen'
    : 'Bereit — Prozessbeschreibung eingeben und generieren', '');
}

/* ── Kapitel des alten Templates ─────────────────────────────────────────── */
const LEGACY_LABELS = [
  { key:'basis',    match:['basisinformationen'] },
  { key:'personen', match:['personen'] },
  { key:'ueberblick', match:['prozessüberblick','prozessuberblick','prozessueberblick'] },
  { key:'ziel',     match:['prozessziel'] },
  { key:'defs',     match:['definitionen/begrifflichkeiten','definitionen','begrifflichkeiten'] },
  { key:'input',    match:['input-trigger (auslöser des prozesses)','input-trigger','input/trigger'] },
  { key:'output',   match:['output-trigger (resultat des prozesses)','output-trigger','output/trigger'] },
  { key:'kef',      match:['kritische erfolgsfaktoren','kritische erfolgsfaktoren:'] },
  { key:'schritte', match:['prozessschritte'] },
  { key:'rollen',   match:['rollen-/funktionsbeschreibungen','rollen-/funktionsbeschreibung','rollen'] },
  { key:'abh',      match:['abhängigkeiten zu anderen prozessen','abhängigkeiten'] },
  { key:'vor',      match:['vorgelagerte prozesse'] },
  { key:'nach',     match:['nachgelagerte prozesse'] },
  { key:'risiken',  match:['prozessrisiken'] },
  { key:'apps',     match:['applikationen / tools','applikationen/tools','applikationen'] },
  { key:'links',    match:['links und dokumente'] }
];

const LEGACY_TITLES = {
  basis:'Basisinformationen', personen:'Personen', ueberblick:'Prozessüberblick',
  ziel:'Prozessziel', defs:'Definitionen/Begrifflichkeiten', input:'Input-Trigger',
  output:'Output-Trigger', kef:'Kritische Erfolgsfaktoren', schritte:'Prozessschritte',
  rollen:'Rollen-/Funktionsbeschreibungen', abh:'Abhängigkeiten', vor:'Vorgelagerte Prozesse',
  nach:'Nachgelagerte Prozesse', risiken:'Prozessrisiken', apps:'Applikationen / Tools',
  links:'Links und Dokumente'
};

function normLabel(line) {
  return line
    .replace(/^[#>\s*|_-]+/, '')
    .replace(/[|*_#]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function labelKeyFor(line) {
  const n = normLabel(line);
  if (!n || n.length > 60) return null;
  for (const L of LEGACY_LABELS) {
    if (L.match.includes(n)) return L.key;
  }
  return null;
}

/* Zerlegt die Altdokumentation in Kapitel.
   pdfOrder = true: Der Kapiteltitel steht NACH dem Inhalt (typisch für PDF-Textextraktion). */
function parseLegacyDoc(raw, pdfOrder) {
  const lines = raw.split(/\r?\n/);
  const anchors = [];
  lines.forEach((ln, i) => {
    const k = labelKeyFor(ln);
    if (k) anchors.push({ key:k, line:i });
  });

  const sections = {};
  if (!anchors.length) {
    sections._unparsed = raw.trim();
    return { sections, meta: extractLegacyMeta(raw), title: guessTitle(raw), raw, anchors:0 };
  }

  if (!pdfOrder) {
    anchors.forEach((a, idx) => {
      const from = a.line + 1;
      const to = (idx + 1 < anchors.length) ? anchors[idx + 1].line : lines.length;
      const body = lines.slice(from, to).join('\n').trim();
      sections[a.key] = (sections[a.key] ? sections[a.key] + '\n' + body : body);
    });
  } else {
    anchors.forEach((a, idx) => {
      const from = (idx === 0) ? 0 : anchors[idx - 1].line + 1;
      const body = lines.slice(from, a.line).join('\n').trim();
      sections[a.key] = (sections[a.key] ? sections[a.key] + '\n' + body : body);
    });
  }

  Object.keys(sections).forEach(k => {
    sections[k] = cleanSection(sections[k]);
    if (!sections[k]) delete sections[k];
  });

  return { sections, meta: extractLegacyMeta(raw), title: guessTitle(raw), raw, anchors: anchors.length };
}

function cleanSection(t) {
  return (t || '')
    .replace(/^\s*\|?\s*-{3,}\s*\|?.*$/gm, '')          // Markdown-Tabellentrenner
    .replace(/^\s*(Fehler beim Laden der Erweiterung!|view)\s*$/gmi, '')
    .replace(/^\s*(Aktuelle Version|v\.\s*\d+)\b.*$/gm, '') // Versionshistorie
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function guessTitle(raw) {
  const first = raw.split(/\r?\n/).find(l => l.trim().length > 3) || '';
  return first.replace(/^#+\s*/, '').replace(/\\/g, '').trim();
}

/* Oberste Ebenen des alten Prozessbaums — dient nur der Rekonstruktion
   abgeschnittener PDF-Spalten. Wird im Report als «abgeleitet» ausgewiesen. */
const LEGACY_STRUCTURE = {
  '8':   { kategorie:'Kernprozesse', haupt:'8 - IT Service Management', gruppe:'' },
  '8.1': { kategorie:'Kernprozesse', haupt:'8 - IT Service Management', gruppe:'8.1 - Service Design' },
  '8.2': { kategorie:'Kernprozesse', haupt:'8 - IT Service Management', gruppe:'8.2 - Service Transition' },
  '8.3': { kategorie:'Kernprozesse', haupt:'8 - IT Service Management', gruppe:'8.3 - Service Operation' },
  '8.4': { kategorie:'Kernprozesse', haupt:'8 - IT Service Management', gruppe:'8.4 - Continual Service Improvement' }
};

function extractLegacyMeta(raw) {
  const m = {};
  const flat = raw.replace(/\r/g, '');

  // Kategorie / Hauptprozess / Prozessgruppe
  let hit = flat.match(/\|\s*(Kernprozesse|Managementprozesse|Supportprozesse)\s*\|\s*([^|]+)\|\s*([^|]+)\|/i);
  if (hit) { m.kategorie = hit[1].trim(); m.hauptprozess = hit[2].trim(); m.prozessgruppe = hit[3].trim(); }
  else {
    const k = flat.match(/(Kernprozesse|Managementprozesse|Supportprozesse)\s*\n?\s*([0-9]+\s*-\s*[^\n]+)\n?\s*([0-9.]+\s*-\s*[^\n]+)/i);
    if (k) { m.kategorie = k[1].trim(); m.hauptprozess = k[2].trim(); m.prozessgruppe = k[3].trim(); }
  }

  // Personen-Tabelle: Prozessgruppen Owner | Review Instanz | Prozess Owner | Prozess Owner Stv
  const isNoise = (l) => !l.trim() || /^[\s|:.\-_]+$/.test(l) || /Prozessgruppen Owner/i.test(l);
  const cells = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '')
                        .split(/\s*\|\s*|\t|\s{3,}/).map(x => x.trim()).filter(Boolean);

  const all = flat.split('\n');
  const hi = all.findIndex(l => /Prozessgruppen Owner/i.test(l));
  if (hi > -1) {
    let vals = [];
    for (let i = hi + 1; i < Math.min(hi + 6, all.length); i++) {          // Markdown: Werte danach
      if (isNoise(all[i])) continue;
      const c = cells(all[i]); if (c.length >= 3) { vals = c; break; }
    }
    if (vals.length < 3) {                                                 // PDF: Werte davor
      for (let i = hi - 1; i >= Math.max(0, hi - 6); i--) {
        if (isNoise(all[i])) continue;
        const c = cells(all[i]); if (c.length >= 3) { vals = c; break; }
      }
    }
    if (vals.length >= 3) {
      const clean = (v) => (/^(n\.?a\.?|tbd|-)$/i.test((v||'').trim()) ? (v||'').trim() : (v||'').trim());
      m.pgOwner = clean(vals[0]); m.review = clean(vals[1]);
      m.owner = clean(vals[2]);   m.ownerStv = clean(vals[3] || '');
    }
  }

  // Ansprechpartner (fällt im neuen Template weg, wird aber im Report ausgewiesen)
  const ai = all.findIndex(l => /Ansprechpartner/i.test(l));
  if (ai > -1) {
    for (let d of [1, -1]) {
      for (let i = ai + d; i >= 0 && i < all.length && Math.abs(i - ai) <= 5; i += d) {
        if (!all[i].trim() || /^[\s|:.\-_]+$/.test(all[i]) || /Ansprechpartner/i.test(all[i])) continue;
        const c = cells(all[i]);
        if (c.length >= 2 && /@|\d{2,}/.test(all[i])) { m.kontakt = c.join(' · '); break; }
        break;
      }
      if (m.kontakt) break;
    }
  }

  m.status = '';
  const title = guessTitle(raw);
  m.processId = (title.match(/\b\d+(?:\.\d+)+\b/) || [])[0]
             || ((flat.match(/\b\d+(?:\.\d+)+\b/g) || [])[0] || '');

  // Layout-Artefakte aus PDF-Spalten entfernen
  ['kategorie','hauptprozess','prozessgruppe','pgOwner','review','owner','ownerStv'].forEach(k => {
    if (m[k]) m[k] = String(m[k]).split(/\s{3,}/)[0].replace(/\s+/g,' ').trim();
  });
  // PDF-Spaltenlayout zerreisst Kategorie/Hauptprozess/Prozessgruppe über mehrere
  // Zeilen. Wo das Ergebnis abgeschnitten wirkt, wird aus der Prozess-Nr. rekonstruiert.
  const st = LEGACY_STRUCTURE[(m.processId || '').split('.').slice(0, 2).join('.')]
          || LEGACY_STRUCTURE[(m.processId || '').split('.')[0]];
  if (st) {
    const looksCut = (v, full) => !v || v.length < 12
      || (full && full.toLowerCase().startsWith(v.toLowerCase()) && v.length < full.length)
      || /^\d+\s*-\s*\w+$/.test(v);
    if (looksCut(m.hauptprozess,  st.haupt))  { m.hauptprozess  = st.haupt;  m.hauptprozessDerived  = true; }
    if (looksCut(m.prozessgruppe, st.gruppe)) { m.prozessgruppe = st.gruppe; m.prozessgruppeDerived = true; }
    if (!m.kategorie) m.kategorie = st.kategorie;
  }

  return m;
}

/* Bewertet eine Segmentierung: erkannte Kapitel wiegen stark, Textmenge leicht. */
function scoreParse(ctx) {
  const keys = Object.keys(ctx.sections).filter(k => k !== '_unparsed');
  let sc = keys.length * 3;
  keys.forEach(k => sc += Math.min(ctx.sections[k].length, 600) / 600);
  // Kapitel, die inhaltlich fast immer gefüllt sind, zählen doppelt
  ['ziel','schritte','rollen'].forEach(k => { if (ctx.sections[k]) sc += 3; });
  return sc;
}

/* Confluence-Exporte stellen Boxtitel je nach Werkzeug vor ODER hinter den Inhalt.
   Statt das dem Anwender aufzubürden, werden beide Varianten bewertet. */
function parseLegacyBest(raw) {
  const a = parseLegacyDoc(raw, false), b = parseLegacyDoc(raw, true);
  const sa = scoreParse(a), sb = scoreParse(b);
  const win = (sb > sa * 1.15) ? b : a;
  win.orderMode = (win === b) ? 'Titel nach Inhalt' : 'Titel vor Inhalt';
  win.orderAuto = true;
  win.orderScores = { vor: Math.round(sa), nach: Math.round(sb) };
  return win;
}

/* ── Deterministische Befunde (ohne Modellaufruf) ───────────────────────── */
function analyzeLegacy(ctx) {
  const f = [];
  const S = ctx.sections;
  const pflicht = ['ziel','schritte','rollen'];
  const wichtig = ['input','output','kef','risiken','apps','links'];
  if (!S.abh && !S.vor && !S.nach) wichtig.push('abh');

  pflicht.forEach(k => { if (!S[k]) f.push({ lvl:'error', t:`Kapitel «${LEGACY_TITLES[k]}» nicht gefunden`, d:'Ohne diesen Inhalt fällt die Migration an dieser Stelle auf reines Fachwissen zurück. Prüfe, ob der Text vollständig eingefügt wurde oder ob die Option «Titel stehen nach dem Inhalt» gesetzt werden muss.' }); });
  wichtig.forEach(k => { if (!S[k]) f.push({ lvl:'warn', t:`Kapitel «${LEGACY_TITLES[k]}» leer oder nicht gefunden`, d:'Das Zielfeld wird aus Fachwissen ergänzt und ist im Onepager als «generiert» gekennzeichnet.' }); });

  if (!S.risiken) f.push({ lvl:'warn', t:'Keine Prozessrisiken in der Altdokumentation', d:'Im neuen Template sind Prozessrisiken Pflichtbestandteil des Steckbriefs. Die Vorschläge stammen aus Fachwissen und müssen vom Process Owner bestätigt werden.' });

  const M = ctx.meta || {};
  ['pgOwner','review','owner','ownerStv'].forEach(k => {
    const v = (M[k] || '').toLowerCase();
    if (v === 'tbd' || v === 'n.a.' || v === 'na' || v === '-') {
      f.push({ lvl:'warn', t:`Feld «${k}» ist «${M[k]}»`, d:'Im neuen Steckbrief muss der Prozess Owner benannt sein. Vor Freigabe klären.' });
    }
  });

  const dead = (ctx.raw.match(/https?:\/\/[^\s)|]+/g) || [])
    .filter(u => /ixportal\.inventx\.ch|doku\.inventx\.ch/i.test(u));
  if (dead.length) f.push({ lvl:'warn', t:`${dead.length} Verweis(e) auf abgelöste Plattformen`, d:'Links auf ixportal.inventx.ch bzw. doku.inventx.ch zeigen auf das alte SharePoint/Confluence. Ziel prüfen und auf die neue Ablage umhängen.' });

  if (S.schritte) {
    const proc = /(Change Management|Configuration Management|Incident Management|Problem Management|Release Management|Risk ?management|Riskmanagement|Bedrohungsanalyse)/gi;
    const hits = [...new Set((S.schritte.match(proc) || []))];
    if (hits.length >= 2) f.push({ lvl:'warn', t:'Prozessschritte enthalten Namen anderer Prozesse', d:`Gefunden: ${hits.join(', ')}. Die alte Schritte-Tabelle beschreibt hier vermutlich Schnittstellen statt Aktivitäten. Es werden echte Aktivitäten abgeleitet — bitte fachlich prüfen.` });
  }

  if (S.rollen && ctx.title) {
    const own = ctx.title.toLowerCase();
    const foreign = ['incident manager','problem manager','change manager','service level manager','release manager']
      .filter(r => S.rollen.toLowerCase().includes(r) && !own.includes(r.split(' ')[0]));
    if (foreign.length) f.push({ lvl:'error', t:'Möglicher Copy-Paste aus einem anderen Prozess', d:`Die Rollentabelle nennt «${foreign.join('», «')}», was nicht zum Prozesstitel passt. Solche Inhalte werden nicht stillschweigend übernommen, sondern im Report unter «Auffällige Altinhalte» ausgewiesen.` });
  }

  const lens = Object.keys(S).filter(k => k !== '_unparsed').map(k => S[k].length);
  const med = lens.length ? lens.slice().sort((a,b)=>a-b)[Math.floor(lens.length/2)] : 0;
  const NORMALLY_SHORT = ['ziel','defs','input','output','kef','risiken','apps','links','basis','personen'];
  NORMALLY_SHORT.forEach(k => {
    if (S[k] && med > 0 && S[k].length > med * 5 && S[k].length > 2000) {
      f.push({ lvl:'warn', t:`Kapitel «${LEGACY_TITLES[k]}» ist auffällig umfangreich`,
        d:`${S[k].length} Zeichen gegenüber ${med} im Median. Sehr wahrscheinlich hat die Altdokumentation hier ein Sonderkapitel ausserhalb des Templates geführt (z.B. Plattform-Spezifika oder Schulungsinhalte). Das neue Template hat dafür kein Feld — der Inhalt wird im Report unter «Nicht übernommene Inhalte» ausgewiesen und gehört ins Detailkonzept.` });
    }
  });

  if (M.kontakt) f.push({ lvl:'info', t:'Ansprechpartner entfällt im neuen Template', d:`Altdokumentation nennt: ${M.kontakt}. Das neue Template kennt nur noch den Prozess Owner. Wenn die Erreichbarkeit erhalten bleiben soll, gehört sie ins Prozessregister, nicht in die Prozessdokumentation.` });

  if (!ctx.anchors) f.push({ lvl:'error', t:'Keine Kapitel erkannt', d:'Der eingefügte Text folgt nicht dem alten Template. Der gesamte Text wird als unstrukturierte Quelle verarbeitet — das Ergebnis ist entsprechend schwächer.' });

  return f;
}

/* ── Verdichtung für den Prompt ─────────────────────────────────────────── */
function legacyFieldsAsText(ctx) {
  const S = ctx.sections;
  const out = [];
  const add = (k) => { if (S[k]) out.push(`## ${LEGACY_TITLES[k]}\n${S[k]}`); };
  ['ziel','defs','ueberblick','input','output','kef','schritte','rollen','vor','nach','abh','risiken','apps','links'].forEach(add);
  if (S._unparsed) out.push(`## Unstrukturierter Inhalt\n${S._unparsed}`);
  const M = ctx.meta || {};
  const meta = [`Titel: ${ctx.title||'?'}`, `Kategorie: ${M.kategorie||'?'}`,
                `Hauptprozess: ${M.hauptprozess||'?'}`, `Prozessgruppe: ${M.prozessgruppe||'?'}`,
                `Prozess Owner: ${M.owner||'?'}`, `Review-Instanz: ${M.review||'?'}`].join('\n');
  return `## Metadaten\n${meta}\n\n${out.join('\n\n')}`;
}

/* Quellbeschreibung für die bestehende Logic-Core-Extraktion */
function buildLegacySourceText(ctx) {
  const S = ctx.sections;
  const parts = [];
  parts.push(`Prozess: ${ctx.title || 'unbenannt'}`);
  if (S.ziel)     parts.push(`Ziel des Prozesses: ${S.ziel}`);
  if (S.ueberblick) parts.push(`Überblick: ${S.ueberblick}`);
  if (S.defs)     parts.push(`Begriffe: ${S.defs}`);
  if (S.input)    parts.push(`Der Prozess wird ausgelöst durch: ${S.input}`);
  if (S.schritte) parts.push(`Ablauf in Schritten:\n${S.schritte}`);
  if (S.rollen)   parts.push(`Beteiligte Rollen und ihre Aufgaben:\n${S.rollen}`);
  if (S.output)   parts.push(`Ergebnis des Prozesses: ${S.output}`);
  if (S.apps)     parts.push(`Eingesetzte Systeme: ${S.apps}`);
  if (S.vor)      parts.push(`Vorgelagerte Prozesse: ${S.vor}`);
  if (S.nach)     parts.push(`Nachgelagerte Prozesse: ${S.nach}`);
  if (S._unparsed) parts.push(S._unparsed);
  return parts.join('\n\n');
}

function readLegacy(raw) {
  if (document.getElementById('opt-pdforder').checked) {
    const c = parseLegacyDoc(raw, true);
    c.orderMode = 'Titel nach Inhalt (manuell erzwungen)';
    return c;
  }
  return parseLegacyBest(raw);
}

/* ── Vorschau: welche Kapitel wurden erkannt ────────────────────────────── */
function previewLegacy() {
  const raw = document.getElementById('legacy-input').value.trim();
  if (!raw) { setStatus('Bitte zuerst eine alte Prozessdokumentation einfügen.', 'error'); return; }
  legacyCtx = readLegacy(raw);
  legacyFlags = analyzeLegacy(legacyCtx);
  renderMigrationReport(null);
  document.getElementById('tab-migration').style.display = '';
  switchTab('migration');
  const found = Object.keys(legacyCtx.sections).filter(k => k !== '_unparsed').length;
  setStatus(`${found} Kapitel erkannt · ${legacyFlags.length} Befund(e) — Report geöffnet`, found ? 'done' : 'error');
}

/* ── Migrationslauf ─────────────────────────────────────────────────────── */
async function migrateGenerate() {
  const raw = document.getElementById('legacy-input').value.trim();
  if (!raw) { setStatus('Bitte zuerst eine alte Prozessdokumentation einfügen.', 'error'); return; }

  legacyCtx = readLegacy(raw);
  legacyFlags = analyzeLegacy(legacyCtx);
  document.getElementById('tab-migration').style.display = '';
  renderMigrationReport(null);

  const text = buildLegacySourceText(legacyCtx);
  currentProcessId = null;
  currentCheckHistory = { rejected: [], accepted: [] };
  document.querySelectorAll('.saved-item').forEach(el => el.classList.remove('active'));
  currentSourceText = text;

  await runGeneration(text, '');
  renderMigrationReport(currentOnepager);
}

/* ── Provenienz-Badge im Onepager ───────────────────────────────────────── */
const PROV_LABEL = {
  uebernommen:'übernommen', umformuliert:'umformuliert', zusammengefasst:'zusammengefasst',
  angereichert:'angereichert', generiert:'generiert', luecke:'Lücke'
};
function provKey(v) {
  const n = (v||'').toLowerCase()
    .replace('ü','ue').replace('ä','ae').replace('ö','oe');
  if (n.startsWith('ueber')) return 'uebernommen';
  if (n.startsWith('umform')) return 'umformuliert';
  if (n.startsWith('zusammen')) return 'zusammengefasst';
  if (n.startsWith('anger')) return 'angereichert';
  if (n.startsWith('gener')) return 'generiert';
  if (n.startsWith('lue') || n.startsWith('lück')) return 'luecke';
  return null;
}
function provBadge(op, field) {
  if (!legacyCtx || !op || !op.provenance) return '';
  const k = provKey(op.provenance[field]);
  if (!k) return '';
  return `<span class="prov prov-${k}" title="${esc((op.provenanceNotes||{})[field]||'')}">${PROV_LABEL[k]}</span>`;
}

/* ── Kapitel 5: Linkzeilen aus der Altdokumentation ─────────────────────── */
function buildLinkRows() {
  if (!legacyCtx) return [];
  const S = legacyCtx.sections, rows = [];
  const urls = (t) => (t.match(/https?:\/\/[^\s)|\]]+/g) || []);

  if (S.apps) {
    S.apps.split(/\n/).map(l => l.replace(/^\|/,'').trim()).filter(Boolean).forEach(l => {
      const c = l.split(/\s*\|\s*|\s{2,}|\t/).map(x => x.trim()).filter(Boolean);
      if (c.length >= 2 && !/^applikation$/i.test(c[0])) {
        rows.push({ thema: `${c[0]} — ${c.slice(1).join(' ')}`, typ:'Tools und Systeme', link:'' });
      }
    });
  }
  if (S.links) {
    const u = urls(S.links);
    S.links.split(/\n/).map(l => l.trim()).filter(Boolean).forEach((l, i) => {
      if (/^\|?\s*(Beschreibung|Link)\s*\|?/i.test(l)) return;
      const link = (l.match(/https?:\/\/[^\s)|\]]+/) || [])[0] || '';
      const thema = l.replace(/https?:\/\/[^\s)|\]]+/g, '').replace(/[|\[\]()]/g,' ').replace(/\s+/g,' ').trim();
      if (thema || link) rows.push({ thema: thema || link, typ:'Detailinformationen', link });
    });
  }
  ['vor','nach'].forEach(k => {
    if (!S[k]) return;
    S[k].split(/\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
      const link = (l.match(/https?:\/\/[^\s)|\]]+/) || [])[0] || '';
      const thema = l.replace(/https?:\/\/[^\s)|\]]+/g,'').replace(/[|\[\]()]/g,' ').replace(/\s+/g,' ').trim();
      if (thema.length > 3 && !/Prozess-Nr|Beschreibung der/i.test(thema)) {
        rows.push({ thema: `${k === 'vor' ? 'Vorgelagert' : 'Nachgelagert'}: ${thema}`, typ:'Detailinformationen', link });
      }
    });
  });
  return rows.slice(0, 40);
}

/* ── Migrationsreport ───────────────────────────────────────────────────── */
const FIELD_MAP = [
  { neu:'1 Geltungsbereich',           alt:['—'],                       f:'scope' },
  { neu:'2 Prozessbezeichnung',        alt:['Titel'],                   f:null },
  { neu:'2 Status / Review / Owner',   alt:['Personen'],                f:null },
  { neu:'2 Kurzbeschreibung',          alt:['Prozessziel','Prozessüberblick','Definitionen'], f:'shortDescription' },
  { neu:'2 Prozessziele',              alt:['Prozessziel','Kritische Erfolgsfaktoren'], f:'goals' },
  { neu:'2 Prozessrisiken',            alt:['Prozessrisiken'],          f:'risks' },
  { neu:'3 Vereinfachtes Prozessmodell', alt:['Prozessüberblick (Grafik)','Prozessschritte','Rollen'], f:null },
  { neu:'4 Prozessschritte',           alt:['Prozessschritte','Input-/Output-Trigger','Applikationen'], f:'steps' },
  { neu:'5 Weiterführende Links',      alt:['Links und Dokumente','Applikationen','Abhängigkeiten'], f:null },
  { neu:'5 Technische Verweise',       alt:['Basisinformationen'],      f:null }
];

function renderMigrationReport(op) {
  if (!legacyCtx) return;
  const S = legacyCtx.sections, M = legacyCtx.meta || {};
  const found = Object.keys(S).filter(k => k !== '_unparsed');
  let h = '<div class="mig-wrap">';

  // Kopf
  h += `<div class="mig-h"><span class="n">Quelle</span>${esc(legacyCtx.title || 'Alte Prozessdokumentation')}</div>`;
  h += `<div class="mig-sub">Prozess-Nr. ${esc(M.processId||'?')} · ${esc(M.kategorie||'?')} · ${esc(M.hauptprozess||'?')} · Segmentierung: ${esc(legacyCtx.orderMode||'Titel vor Inhalt')}${(M.hauptprozessDerived||M.prozessgruppeDerived) ? ' · Struktur teilweise aus der Prozess-Nr. abgeleitet' : ''}${legacyCtx.orderScores ? ` (Bewertung ${legacyCtx.orderScores.vor} zu ${legacyCtx.orderScores.nach})` : ''}</div>`;
  const errs = legacyFlags.filter(f => f.lvl === 'error').length;
  const warns = legacyFlags.filter(f => f.lvl === 'warn').length;
  h += `<div class="mig-stats">
    <div class="mig-stat"><div class="v">${found.length}</div><div class="l">Kapitel erkannt</div></div>
    <div class="mig-stat"><div class="v" style="color:${errs?'#ff8a8a':'inherit'}">${errs}</div><div class="l">Blocker</div></div>
    <div class="mig-stat"><div class="v" style="color:${warns?'#f3c893':'inherit'}">${warns}</div><div class="l">Hinweise</div></div>
    <div class="mig-stat"><div class="v">${op && op.steps ? op.steps.length : '—'}</div><div class="l">Prozessschritte neu</div></div>
  </div>`;

  // Befunde
  if (legacyFlags.length) {
    h += `<div class="mig-h"><span class="n">Prüfung</span>Befunde aus der Altdokumentation</div>`;
    legacyFlags.forEach(f => {
      const cls = f.lvl === 'error' ? 'flag-error' : (f.lvl === 'warn' ? 'flag-warn' : 'flag-info');
      const ic  = f.lvl === 'error' ? '✕' : (f.lvl === 'warn' ? '!' : 'i');
      h += `<div class="mig-flag ${cls}"><span class="fi">${ic}</span><span><b>${esc(f.t)}</b><br>${esc(f.d)}</span></div>`;
    });
  }

  // Feldmapping
  h += `<div class="mig-h"><span class="n">Mapping</span>Altes Template → neues Template</div>`;
  h += `<div class="mig-sub">Zeigt, woraus jedes Zielfeld entstanden ist. Die Herkunft stammt aus dem Migrationslauf und ist im Onepager als Badge sichtbar.</div>`;
  h += `<table class="mig-table"><thead><tr><th style="width:24%">Neues Feld</th><th style="width:30%">Quelle im alten Template</th><th style="width:15%">Herkunft</th><th>Anmerkung</th></tr></thead><tbody>`;
  FIELD_MAP.forEach(r => {
    let badge = '<span class="mig-empty">—</span>', note = '';
    if (op && r.f && op.provenance) {
      const k = provKey(op.provenance[r.f]);
      if (k) badge = `<span class="prov prov-${k}">${PROV_LABEL[k]}</span>`;
      note = (op.provenanceNotes || {})[r.f] || '';
    }
    h += `<tr><td class="mig-new"><strong>${esc(r.neu)}</strong></td><td class="mig-old">${esc(r.alt.join(', '))}</td><td>${badge}</td><td class="mig-old">${esc(note)}</td></tr>`;
  });
  h += `</tbody></table>`;

  // Offene Punkte / auffällige / verworfene Inhalte
  if (op) {
    if ((op.openPoints || []).length) {
      h += `<div class="mig-h"><span class="n">Offen</span>Vom Process Owner zu klären</div>`;
      op.openPoints.forEach(p => h += `<div class="mig-flag flag-warn"><span class="fi">?</span><span>${esc(p)}</span></div>`);
    }
    if ((op.suspect || []).length) {
      h += `<div class="mig-h"><span class="n">Achtung</span>Auffällige Altinhalte</div>`;
      h += `<div class="mig-sub">Inhalte, die inhaltlich nicht zu diesem Prozess zu passen scheinen. Sie wurden nicht übernommen.</div>`;
      op.suspect.forEach(p => h += `<div class="mig-flag flag-error"><span class="fi">✕</span><span><b>${esc(p.content)}</b><br>${esc(p.reason)}</span></div>`);
    }
    if ((op.dropped || []).length) {
      h += `<div class="mig-h"><span class="n">Verlust</span>Nicht übernommene Inhalte</div>`;
      h += `<div class="mig-sub">Das neue Template hat für diese Inhalte kein Feld. Empfehlung je Eintrag angegeben.</div>`;
      h += `<table class="mig-table"><thead><tr><th style="width:45%">Inhalt</th><th style="width:35%">Grund</th><th>Empfehlung</th></tr></thead><tbody>`;
      op.dropped.forEach(p => h += `<tr><td class="mig-old">${esc(p.content)}</td><td class="mig-old">${esc(p.reason)}</td><td class="mig-new">${esc(p.suggestion||'')}</td></tr>`);
      h += `</tbody></table>`;
    }
  }

  // Erkannte Kapitel im Rohtext
  h += `<div class="mig-h"><span class="n">Parser</span>Erkannte Kapitel</div>`;
  h += `<div class="mig-sub">Kontrolle der Segmentierung. Stimmt die Zuordnung nicht, hilft meist die Option «Titel stehen nach dem Inhalt» — PDF-Exporte stellen Boxtitel hinter den Inhalt.</div>`;
  LEGACY_LABELS.forEach(L => {
    const k = L.key;
    if (['basis','personen','abh'].includes(k) && !S[k]) return;
    const body = S[k];
    h += `<div class="mig-seg">
      <div class="mig-seg-h"><span>${esc(LEGACY_TITLES[k])}</span>
      <span class="mig-chip ${body ? 'ok' : 'no'}">${body ? (body.length + ' Zeichen') : 'nicht gefunden'}</span></div>
      ${body ? `<div class="mig-seg-b">${esc(body.slice(0, 900))}${body.length > 900 ? ' …' : ''}</div>` : ''}
    </div>`;
  });
  if (S._unparsed) {
    h += `<div class="mig-seg"><div class="mig-seg-h"><span>Nicht zugeordneter Text</span><span class="mig-chip no">${S._unparsed.length} Zeichen</span></div><div class="mig-seg-b">${esc(S._unparsed.slice(0,900))}</div></div>`;
  }

  h += '</div>';
  document.getElementById('migration-content').innerHTML = h;
}

// ─── Keyboard shortcut ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    // If modal open, submit it; else generate
    if (document.getElementById('clarify-modal').style.display === 'flex') submitClarification();
    else generate();
  }
  if (e.key === 'Escape') {
    const m = document.getElementById('clarify-modal');
    if (m.style.display === 'flex') skipClarification();
    const c = document.getElementById('check-modal');
    if (c.style.display === 'flex') closeCheckModal();
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────
loadSavedIndex();
loadRoleCatalog();
