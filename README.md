# BiH Slagalica 🧩

Online slagalica (puzzle) karte Bosne i Hercegovine za djecu. Radi u web pregledniku, na računaru i tabletu/mobitelu.

**Igraj:** https://hariszukanovic.github.io/bih-puzzle/

## Mogućnosti
- Karta se reže na tačno onoliko dijelova koliko izabereš (zadano 22), u klasičnom obliku slagalice ili valovito.
- Prevuci dijelove mišem ili prstom, a oni se sami zalijepe kad su blizu svog mjesta.
- Uključi/isključi kantone i gradove na dijelovima.
- Pozadina: obojena karta ili zastava BiH.
- Pomoć: blijeda slika karte na tabli.
- Jezik: bosanski (zadano) ili engleski.

Postavke se mogu zadati i kroz URL, npr. `?n=30&shape=wavy&bg=flag&lang=en`.

## Tehnički
Čist HTML/CSS/JavaScript, bez build koraka. Granice kantona su iz [Natural Earth](https://www.naturalearthdata.com/) (javno vlasništvo), pretvorene u `js/mapdata.js`.
Za lokalno pokretanje: `python3 -m http.server` pa otvori http://localhost:8000.

## Lista svih igrača (Firebase)
Top 10 se uvijek čuva na uređaju. Za zajedničku listu svih igrača:
1. Napravi projekat na https://console.firebase.google.com (Analytics nije potreban).
2. Build → Firestore Database → Create database (production mode, lokacija `eur3`).
3. U tabu **Rules** zalijepi sadržaj datoteke `firestore.rules` i klikni Publish.
4. Project settings → Your apps → Web (`</>`) → registruj aplikaciju i prepiši `apiKey` i `projectId` u `js/firebase-config.js`.
