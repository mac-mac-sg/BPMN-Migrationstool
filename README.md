# Process Studio · BPMN Migrationstool

Webanwendung auf Basis der Projektvorlage `prozess-migrations-tool.html`.

## Starten

Node.js 22 oder neuer; keine externen npm-Pakete erforderlich.

```sh
cp .env.example .env
npm start
```

Im Browser `http://localhost:3000` öffnen. Die vorbereitete Service-Request-Demo, Kapitel-Erkennung, Ansichten und Exporte funktionieren ohne KI-Schlüssel.

Für eigene KI-generierte Prozesse `ANTHROPIC_API_KEY` in `.env` hinterlegen. Optional `ANTHROPIC_MODEL` anpassen. Anbindung gemäss [Claude Messages API](https://platform.claude.com/docs/en/api/overview). Die Vorlage verwendet Claude; diese Anbieterwahl wurde übernommen. Schlüssel verlassen den Server nicht in Richtung Browser.

## Funktionsumfang

- Startseite mit Migration, Neuerstellung, Beispiel und zuletzt bearbeiteten Prozessen.
- Migration aus eingefügtem Text sowie `.txt`-/`.md`-Dateien; aus PDFs den Text kopieren. Kein direkter PDF-/DOCX-Upload.
- Kapitel-Erkennung, Herkunftskennzeichnung, offene Punkte und Migrationsreport aus der Vorlage.
- Onepager mit Geltungsbereich, Kurzbeschreibung, Prozesszielen und Prozessrisiken.
- BPMN-Swimlanes, RACI, Prozess-Check, Rückfragen, Nachbearbeitung und Undo aus der Vorlage.
- Exporte: BPMN 2.0 XML, SVG, PNG, JSON und Confluence Storage Format.
- Speicherung von Prozessen, Onepagern, RACI und Migrationskontext in localStorage. Keine Synchronisierung zwischen Geräten oder Benutzern. Löschen der Browserdaten löscht lokale Prozesse. Exporte dienen als externe Sicherung; JSON-Reimport ist noch nicht enthalten.
- Responsive Startseite und Arbeitsbereich; Bedienung der Tabs per Tastatur.

## Betrieb

Standardmässig nur lokal unter `127.0.0.1`. Für einen Server `HOST=0.0.0.0` und ein starkes `APP_PASSWORD` setzen. Die HTTP-Basic-Anmeldung akzeptiert einen beliebigen Benutzernamen und das konfigurierte Passwort. Netzwerkbetrieb nur hinter einem HTTPS-Reverse-Proxy. Ein gemeinsames Passwort ersetzt keine unternehmensweite SSO-/Rollenlösung. Das Frontend wird separat über GitHub Pages veröffentlicht (siehe unten).

Bei Generierung, Rückfragen, KI-Checks und Nachbearbeitung werden die eingegebenen Inhalte und der benötigte Prozesskontext an Anthropic gesendet. Nur hierfür freigegebene Inhalte verwenden. Demo und Kapitel-Erkennung benötigen keinen Anbieteraufruf. Vor produktivem Unternehmenseinsatz Hosting, Anbieterfreigabe und Zugriffsmodell festlegen.

Die BPMN- und Dokumentgenerierung wurde aus der gelieferten Vorlage übernommen. KI-Ergebnisse und RACI sind fachliche Entwürfe. Der BPMN-Export wurde auf XML-Wohlgeformtheit geprüft, noch nicht gegen die vollständige OMG-XSD oder in allen Zielmodellierern. Confluence-Export ist eine Datei, keine direkte Veröffentlichung.

## Entwicklung und Prüfung

```sh
npm run check
npm test
```

`public/app.js` enthält die übernommene Prozesslogik; `public/homepage.js` die Homepage und Demo; `public/storage.js` den Browseradapter. `server.mjs` liefert ausschliesslich die freigegebenen Frontend-Dateien aus und vermittelt KI-Anfragen. API-Tests prüfen fehlende Konfiguration, Passwortschutz, Request-Validierung, Fremdherkunft, serverseitige Modellauswahl und abgeschnittene Antworten. Ein echter Anbieteraufruf erfordert einen eingerichteten API-Schlüssel und wurde ohne Schlüssel nicht getestet.

Zusätzliche Smoke-Prüfung: Demo-Modell, Onepager/RACI-Rendering, Speichern und Wiederöffnen, Kapitel-Erkennung sowie BPMN-/Confluence-Export wurden in einer simulierten DOM-Umgebung ausgeführt; das Beispiel-BPMN ist wohlgeformtes XML mit gültigen Knotenreferenzen. Eine visuelle Browserprüfung war in der Erstellungsumgebung mangels verfügbarem Browser nicht möglich. Mobil- und Desktop-Layout sind implementiert, müssen jedoch im echten Browser abgenommen werden.

## GitHub Pages

Homepage: https://mac-mac-sg.github.io/BPMN-Migrationstool/

Der Workflow `.github/workflows/pages.yml` prüft die Anwendung und veröffentlicht bei jedem Push auf `main` ausschliesslich das Frontend. Repository-Einstellung: **Settings → Pages → Source: GitHub Actions**. Ein manueller Start ist ebenfalls über Actions möglich.

GitHub Pages führt `server.mjs` nicht aus. Die Online-Vorschau bietet Demo, Kapitel-Erkennung, Browser-Speicherung und Exporte; KI-Aufrufe werden mit einem verständlichen Hinweis abgefangen. Für die vollständige KI-Anwendung muss der Node-Server auf einem geeigneten Hosting betrieben werden. Niemals einen API-Schlüssel ins öffentliche Frontend oder ins Repository schreiben. Der Serverbetrieb bleibt unverändert möglich.

Die Website ist öffentlich. Eingegebene Prozessdaten werden lokal im jeweiligen Browser gespeichert; sie werden nicht ins Repository veröffentlicht. GitHub-Pages-Projekte auf derselben Domain teilen sich den Browser-Origin.
