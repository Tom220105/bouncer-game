# Bouncer

Minimalistisches Physik-Puzzle im Browser. Ein Würfel rollt nach rechts, eine Barriere versperrt den Weg.
Zeichne **Bouncer** ins Level, drücke **Start** und lenke den Würfel um das Hindernis herum, bis ihn das Portal einsaugt.

## Spielen

Keine Installation, kein Build. Entweder `index.html` direkt im Browser öffnen oder einen lokalen Server starten:

```bash
python3 -m http.server 5173
```

Dann <http://localhost:5173> öffnen.

## Steuerung

| Aktion | Eingabe |
| --- | --- |
| Bouncer zeichnen | Mit Maus/Finger ziehen – der Freihand-Strich wird automatisch zu einer glatten, geraden Linie |
| Bouncer entfernen | Anklicken (oder Rechtsklick) |
| Letzten Bouncer entfernen | `Z` oder ↶-Button |
| Start / Stopp | `Leertaste` oder Start-Button |
| Menü schließen | `Esc` |

Ungültige Positionen (zu nah an Barriere, Portal oder Würfel, über anderen Bouncern) werden beim Zeichnen rot markiert.

**Sterne:** 3 Sterne bei Par (Level 1: 2 Bouncer), 2 Sterne bei einem mehr, sonst 1.

**Einstellungen:** Sound & Lautstärke, Winkel einrasten (15°-Schritte), Flugbahn-Vorschau, Leuchteffekte, Fortschritt zurücksetzen.
Einstellungen und Bestwerte werden im `localStorage` des Browsers gespeichert.

## Projektstruktur

```
index.html        Canvas + Overlay (Kopfzeile, Steuerleiste, Dialoge)
css/style.css     Overlay-Design
js/geometry.js    Vektor-/Strecken-Mathematik, Linien-Fit für Freihand-Striche
js/levels.js      Level-Definitionen
js/physics.js     Deterministische Simulation (fester Zeitschritt) + Regeln
js/storage.js     Einstellungen & Fortschritt
js/audio.js       Synthetische Soundeffekte (Web Audio, keine Dateien)
js/render.js      Zeichnen von Würfel, Barriere, Portal, Bouncern, Partikeln
js/ui.js          Overlay-Logik (Level-Auswahl, Einstellungen, Gewonnen-Dialog)
js/game.js        Spielzustand, Eingabe, Hauptschleife
js/main.js        Einstieg
```

## Neues Level anlegen

In `js/levels.js` ein Objekt an `B.LEVELS` anhängen. Das Spielfeld ist 1600 × 900 Einheiten groß:

```js
{
  id: 'l02',
  name: 'Zweiter Versuch',
  hint: 'Optionaler Hinweistext',
  cube: { x: 300, y: 450, angle: 0, speed: 540 },          // angle in Radiant, 0 = nach rechts
  barriers: [{ x1: 800, y1: 200, x2: 800, y2: 700, r: 24 }], // Kapseln: Strecke + Radius
  portal: { x: 1500, y: 450, rx: 34, ry: 80, attract: 340, capture: 56, pull: 3400, swirl: 7 },
  maxBouncers: 3,
  par: 2,
}
```

Level werden freigeschaltet, sobald das vorherige geschafft ist.
