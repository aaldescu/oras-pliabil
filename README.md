# 🏙️ Orașul Pliabil

Un proiect pentru copii: **alegi clădiri adevărate de pe hartă, le decorezi și primești foi A4 (PDF)** cu ele desfășurate, ca să le decupezi, să le îndoi și să le lipești din hârtie sau carton.

## Cum se joacă

1. **Alege** – mișcă harta (OpenStreetMap), apropie-te și atinge clădirile care-ți plac. Le pun în 🧺 cutie.
   Poți căuta orice oraș sau stradă, sări direct la clădiri celebre (Ateneul Român, Castelul Peleș, Biserica Neagră…),
   apăsa „📍 Du-mă unde sunt eu” ca să-ți găsești propria casă sau poți **inventa o clădire** (cutie, L, U, cruce, turn).
2. **Decorează** – alegi numărul de etaje, cât de greu să fie de construit (Ușor 📦 / Mediu / Expert), acoperișul
   (plat, în două ape, piramidă), culorile, ferestrele, flori la ferestre și ușa. Macheta 3D se **pliază sub ochii tăi**
   (bara „plat → gata” sau butonul ▶), iar dedesubt vezi exact foile care se vor tipări.
3. **Tipărește** – scrii numele constructorului, alegi mărimea (mică / medie / mare), dacă toate clădirile sunt la
   aceeași scară, dacă vrei contur alb-negru de colorat, bază și **planșa orașului** cu străzile și locul fiecărei
   clădiri (la aceeași scară, împărțită pe mai multe foi dacă e nevoie). Apeși „✨ Fă-mi PDF-ul!”.

PDF-ul are o copertă cu lista clădirilor și pașii de construcție, apoi foile fiecărei clădiri:
linie continuă = **taie**, linie punctată = **îndoaie**, linie albastră = **îndoaie invers** (la colțurile „intrânde”),
urechiușe gri = **pune lipici**. Pereții sunt numerotați, iar numerele se regăsesc pe acoperiș și pe bază.

Sfat: tipărește la „Dimensiune reală / 100%”, pe hârtie de 160–250 g/m² sau lipește foile pe carton subțire.

## Pornire

Este un site static, fără instalare sau compilare:

```bash
npx http-server -c-1 .     # apoi deschide http://localhost:8080
```

Merge și pe GitHub Pages (workflow-ul din `.github/workflows/pages.yml` îl publică la fiecare push pe `main`,
după ce în *Settings → Pages* alegi sursa „GitHub Actions”).

Teste pentru geometrie și desfășurare: `npm test`.

## Cum e făcut

| Fișier | Ce face |
| --- | --- |
| `js/map.js` | harta Leaflet, clădirile și străzile din OpenStreetMap prin Overpass, căutare Nominatim |
| `js/geometry.js` | proiecție în metri, simplificarea formei după dificultate, dreptunghiul minim, forma finală |
| `js/decor.js` | ferestre, uși, flori, țigle |
| `js/net.js` | desfășurarea: fâșii de pereți (împărțite dacă nu încap pe A4), acoperiș plat / în două ape / piramidă, bază, urechiușe, scara potrivită și așezarea pe pagini |
| `js/render.js` | desenarea pieselor (taie / îndoaie se deduc automat din laturile comune), pentru PDF și ecran |
| `js/pdf.js` | PDF-ul A4 cu jsPDF: copertă, foi, planșa orașului |
| `js/preview3d.js` | macheta 3D cu three.js și animația de pliere |
| `js/app.js` | interfața în 3 pași, mascota 🦊, salvarea cutiei în browser |

Datele hărții © contribuitorii [OpenStreetMap](https://www.openstreetmap.org/copyright).
