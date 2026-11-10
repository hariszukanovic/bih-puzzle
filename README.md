# Slagalica BiH 🧩

Online slagalica (puzzle) karte Bosne i Hercegovine za djecu. Radi u web pregledniku, na računaru i tabletu/mobitelu.

**Igraj:** https://hariszukanovic.github.io/bih-puzzle/

## Mogućnosti
- Karta se reže na tačno onoliko dijelova koliko izabereš (zadano 22).
- Prevuci dijelove mišem ili prstom, a oni se sami zalijepe kad su blizu svog mjesta.
- Uključi/isključi kantone i gradove na dijelovima.
- Pozadina: obojena karta ili zastava BiH.
- Pomoć: blijeda slika karte na tabli.
- Jezik: bosanski (zadano) ili engleski.

Postavke se mogu zadati i kroz URL, npr. `?n=30&bg=flag&lang=en`.

## Tehnički
Čist HTML/CSS/JavaScript, bez build koraka. Granice kantona su iz [Natural Earth](https://www.naturalearthdata.com/) (javno vlasništvo), pretvorene u `js/mapdata.js`.
Za lokalno pokretanje: `python3 -m http.server` pa otvori http://localhost:8000.
