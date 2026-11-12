# Poké Mnemonic

Una Progressive Web App mobile-first per associare un numero di Pokédex a una parola mnemonica e studiarla con flashcard.

## Funzionalità

- generazione automatica di parole fonetiche partendo da un numero
- associazione a Pokémon con sprite reali da PokéAPI
- salvataggio delle parole personalizzate in localStorage
- studio in gruppi consecutivi di 50, per generazione o per intervallo Pokédex personalizzato
- riepilogo dei progressi totali e per generazione
- aiuto facoltativo tramite parola mnemonica e soluzione rivelata solo su richiesta
- installabile come app sul dispositivo

## Esecuzione locale

Apri un server statico nella cartella del progetto:

```bash
cd D:\PokeMnemonic
python -m http.server 8000
```

Quindi apri il browser all'indirizzo:

```text
http://localhost:8000
```

## Struttura

- `index.html` – vista principale
- `styles.css` – layout mobile-first
- `app.js` – logica di generazione, persistenza e flashcards
- `pokemon-names.json` – nomi inglesi e italiani ufficiali delle 1025 specie
- `mnemonic-words.json` – parole italiane di dizionario indicizzate per codice fonetico
- `THIRD_PARTY_NOTICES.md` – attribuzione e licenza delle liste di parole italiane
- `sw.js` – service worker per PWA offline
- `manifest.webmanifest` – installazione app

I nomi provengono dai dati localizzati di [PokéAPI](https://github.com/PokeAPI/pokeapi). Quando il nome italiano differisce da quello inglese, l'app mostra entrambi, ad esempio `Raging Bolt (Furiatonante)`.

Le parole suggerite provengono dalle liste italiane comuni di [napolux/paroleitaliane](https://github.com/napolux/paroleitaliane); vengono proposte solo se la codifica fonetica corrisponde esattamente al numero.

## Note

Il generatore propone solo parole trovate nel lessico italiano e con una corrispondenza fonetica esatta. Se non trova una parola per un numero, non ne inventa una: puoi inserirne una personalizzata. Le parole personalizzate e i progressi di studio sono salvati localmente nel browser.
