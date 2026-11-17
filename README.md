# Bouncer

Minimalistisches Physik-Puzzle im Browser. Ein Würfel fliegt los, Hindernisse versperren den Weg.
Zeichne **Bouncer** ins Level, drücke **Start** und lenke den Würfel so, dass ihn das Portal einsaugt.

30 Level in vier Kapiteln, jedes Kapitel bringt ein neues Element:

| Kapitel | Level | Neu |
| --- | --- | --- |
| Grundlagen | 1–8 | Barrieren, Säulen |
| Spiegel & Sperrzonen | 9–16 | feste Spiegel, Sperrzonen, kleiner Portal-Sog |
| Bewegung | 17–24 | bewegliche Barrieren, Rotoren, schnellerer Würfel |
| Meister | 25–30 | Bauflächen (nur dort darf gebaut werden), Kombinationen |

Die Zahl der Bouncer ist nicht begrenzt. Sterne: 3 bei höchstens „Par“ Bouncern, 2 bei einem mehr, sonst 1.
Ein Level wird freigeschaltet, sobald das vorherige geschafft ist.

## Spielen

Keine Installation, kein Build. Entweder `index.html` direkt im Browser öffnen oder einen lokalen Server starten:

```bash
python3 -m http.server 5173
```

Dann <http://localhost:5173> öffnen. Mit `?unlock` am Ende der Adresse sind zum Testen alle Level freigeschaltet.

## Steuerung

| Aktion | Eingabe |
| --- | --- |
| Bouncer zeichnen | Ins Leere ziehen – der Strich wird zu einer geraden Linie (rastet sanft auf 15°-Schritte ein) |
| Auswählen | Bouncer anklicken |
| Verschieben | Ausgewählten Bouncer ziehen, fein mit den Pfeiltasten |
| Drehen / Länge ändern | Endpunkt-Griff ziehen · Mausrad · `Q` / `E` (mit `⇧` gröber bzw. feiner) |
| Löschen | ×-Knopf · `Entf` · Rechtsklick |
| Rückgängig | `Z` oder ↶-Button (gilt für jede Änderung) |
| Start / Stopp | `Leertaste` oder Start-Button |
| Auswahl aufheben / Menü schließen | `Esc` |

Ungültige Positionen (zu nah an Barriere, Portal oder Würfel, in Sperrzonen, außerhalb von Bauflächen,
über anderen Bouncern) werden rot markiert und nennen den Grund.

Das Spielfeld nutzt das ganze Fenster: Level sind für 1600 × 900 entworfen, darum herum darf man ebenfalls
bauen und fliegen (bis zu 300 Einheiten über den Rand hinaus).

**Einstellungen:** Sound & Lautstärke, Winkel immer einrasten, Flugbahn-Vorschau, Leuchteffekte,
Fortschritt zurücksetzen. Einstellungen und Bestwerte werden im `localStorage` des Browsers gespeichert.

## Projektstruktur

```
index.html          Canvas + Overlay (Kopfzeile, Steuerleiste, Dialoge)
css/style.css       Overlay-Design
js/geometry.js      Vektor-/Strecken-Mathematik, Linien-Fit für Freihand-Striche
js/levels.js        Die 30 Level und Kapitel
js/physics.js       Deterministische Simulation (fester Zeitschritt) + Platzierungsregeln
js/storage.js       Einstellungen & Fortschritt
js/audio.js         Synthetische Soundeffekte (Web Audio, keine Dateien)
js/render.js        Zeichnen von Würfel (3D), Barrieren, Rotoren, Spiegeln, Portal, Bouncern
js/ui.js            Overlay-Logik (Level-Auswahl, Einstellungen, Gewonnen-Dialog)
js/game.js          Spielzustand, Bouncer-Steuerung, Hauptschleife
js/main.js          Einstieg
tools/solver.js     Level-Löser (Strahlsuche) zum Prüfen der Level
tools/verify.html   Prüfseite: löst alle Level und zeigt die Lösungen als Vorschaubild
```

## Neues Level anlegen

In `js/levels.js` einen Eintrag an `B.LEVELS` anhängen (und ggf. `B.CHAPTERS` anpassen).
Das Entwurfsfeld ist 1600 × 900 Einheiten groß; Wände, die bis zum Rand reichen, mit `E` überstehen lassen.

```js
L({
  name: 'Mein Level',
  hint: 'Optionaler Hinweistext',
  cube: cube(200, 450),                          // x, y, Winkel in Grad, Tempo
  barriers: [wall(800, 300, 800, 600), slider(1100, 380, 1100, 520, 0, 200, 2)],
  rotors: [rotor(1200, 450, 240, 90)],           // Mitte, Länge, Grad pro Sekunde
  mirrors: [mirror(900, 100, 1100, 100)],
  zones: [zone(400, -E, 200, 900 + 2 * E)],      // hier nicht bauen
  pads: [],                                      // falls gesetzt: nur hier bauen
  portal: portal(1450, 450, 300),                // x, y, Sogradius
  par: 2,
}),
```

Danach `tools/verify.html` öffnen (über den lokalen Server): Der Löser prüft, ob jedes Level lösbar ist,
schlägt die kleinste gefundene Bouncer-Anzahl als Par vor und zeigt eine „Toleranz“ –
je niedriger, desto präziser muss gezielt werden.
