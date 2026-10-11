# Műszaknapló

Magyar nyelvű, telefonra igazított, saját eszközön mentő termékdarabszám- és normaidőnapló. Egyszerű HTML, CSS és JavaScript fájlokból áll; külön fordítás és külső futásidejű függőség nélkül használható.

GitHub-tároló: [tothda1992-tech/ablage](https://github.com/tothda1992-tech/ablage). A Netlify-közzététel még hátravan.

## Közzététel GitHub + Netlify segítségével

A GitHub tárolja a forráskódot, a Netlify adja az app megnyitható webcímét. A kettő összekapcsolásával a GitHubra feltöltött későbbi módosítások is közzétehetők.

1. Nyisd meg az `ablage` GitHub-tárolót. Másolathoz saját tárolót is létrehozhatsz.
2. Töltsd fel a csomag **tartalmát** a tároló gyökerébe: a `dist` és `tests` mappát, a `README.md` és a `netlify.toml` fájlt. A tárolóban közvetlenül `dist/index.html` legyen az elérési út; ne kerüljön elé még egy csomagmappa.
3. A Netlify-on válaszd a meglévő GitHub-tároló importálását, és jelöld ki az `ablage` tárolót.
4. A közzétételi beállítások:

| Beállítás | Érték |
|---|---|
| Ág | A feltöltött fájlokat tartalmazó ág, általában `main` |
| Base directory | Üres |
| Build command | Üres |
| Publish directory | `dist` |

5. Indítsd el a közzétételt, majd nyisd meg a Netlify által létrehozott HTTPS-webcímet a telefonodon. A csomag `netlify.toml` fájlja is megadja a `dist` közzétételi mappát.

### Gyors feltöltés közvetlenül Netlify-ra

GitHub nélkül is használható: a Netlify kézi feltöltési felületén a kibontott csomag **`dist` mappáját** töltsd fel. Ebben közvetlenül megtalálható az `index.html`. Későbbi kézi frissítéskor ugyanannak a projektnek a közzétételei között töltsd fel az új `dist` mappát.

Hivatalos leírások: [Netlify közzététel](https://docs.netlify.com/deploy/create-deploys/), [beállítások fájlból](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Használat

1. A napi rögzítésben válaszd ki a dátumot. A **Nap adatai** alatt add meg a nevet és az elszámoláshoz tartozó munkaórát.
2. Keress termékkódra vagy névre. A +/− gombok egyenként változtatják a darabszámot, a számmező közvetlenül is kitölthető. A csillag a kedvencek közé teszi a terméket.
3. Az **Állás / egyéb idő** alatt percek adhatók meg a forrás hét kategóriájához.
4. Az **Elszámolás** oldalon látható a tételes eredmény. Letölthető napi CSV, és a böngésző nyomtatási párbeszédablakával PDF menthető. A lezárt nap újranyitható.
5. Az **Előzmények** havi összegeket és a rögzített napokat mutatja. Innen havi CSV tölthető le.
6. A **Beállítások** alatt letölthető és visszatölthető a teljes napló JSON-mentése.

## A számítás alapja

A rendelkezésre bocsátott munkafüzet normaidőtáblájának 39 normás terméksora adja a katalógust. SHA-256: `4c52b317539522a654f871627457e176a5227ededd5f0553902b8d3b834bdcbd`.

- Normaidő percben = termékenkénti darabszám × perc/db, majd összegzés.
- Elszámolt idő órában = (normaperc + az állás/egyéb jogcímek percei) / 60.
- A belső egység egész századperc; kerekítés csak megjelenítéskor történik.
- A napi munkaórát a felhasználó adja meg. Nincs szünetlevonás vagy létszámszorzó. Az Excelben megadott 16 órás értékeket is változatlan jelentéssel kezeli.
- A százalék a teljes elszámolt idő és a megadott munkaidő aránya. Ez új, levezetett kijelzés, nem a munkafüzet önálló képlete. Havi szinten az összeadott időkből számolódik; hiányzó munkaórák esetén nem ad teljes havi arányt.
- A felső, alsó és kiegészítő darabok elkülönülnek. Az eredeti Excel „Darab/Nap” mennyisége csak a felső darabokat jelenti.
- A korábbi munkanapok saját normapillanatképet tartalmaznak, hogy egy későbbi katalógusváltozás ne írja át a korábbi elszámolást.

## A források eltéréseinek kezelése

- A papíron `7874 (5174)`, az Excelben `5174 - 7877` szerepel. A megjelenített és rögzített egyértelmű kód `5174`. Mindkét eltérő kódra kereshető, a kártya az eltérést láthatóan jelöli. Normája 14,67 perc/db.
- GERM felső: 17,56 perc/db; GERM alsó: 13,99 perc/db. Külön tételként szerepelnek.
- A Brazil külön darabjelölés, önálló normaidőt nem ad hozzá. Az Excel önálló normát nem ad hozzá, és a scannelési egyeztetésben külön részmennyiségként kezeli. A Brazil dobozolás ettől különálló, percben rögzített állás/egyéb jogcím.
- A Spoiler a papírhoz hasonló szöveges feljegyzés. Időnorma hiányában nem ad becsült perceket az elszámoláshoz.
- A „Török” forrásmezőnek nincs egyértelmű mértékegysége vagy normája; az általános megjegyzésben rögzíthető.
- A Polc/Tükör összesítőfeliratok forrásbeli felcserélése nem került átvételre. A helyes alapnorma polc 0,26, tükör 0,40 perc/db.
- Az Excelben szereplő, a papírról hiányzó 4474 elérhető, 20,24 perc/db normával.

## Adatmegőrzés és hozzáférés

A munkanapló az adott webcímhez tartozó böngészőtárban (`localStorage`) mentődik ugyanazon az eszközön és böngészőben. Nincs szerveroldali napló-adatbázis vagy eszközök közötti automatikus szinkron.

Az appban nincs beépített bejelentkezés. A GitHub-tároló privát beállítása önmagában nem korlátozza a Netlify-on közzétett oldal elérését. Külön hozzáférési védelem nélkül az oldal és a beépített termékkatalógus a webcím birtokában megnyitható. A rögzített munkanapok az adott böngészőben maradnak.

A teljes állapot visszatölthető JSON-ba exportálható. Visszatöltéskor a meglévő dátumok alapértelmezésben megmaradnak, felülírás csak a felhasználó választásával történik. Előző helyi példány segíti a sérült elsődleges mentésből a helyreállítást. Sikertelen mentésnél látható figyelmeztetés jelenik meg. Böngészőadatok törlése előtt külön JSON-mentést kell letölteni.

A csatolt Excel korábbi munkanapjai és a fotó kézzel írt adatai nem töltődnek be új, élő bejegyzésként. Az új napló üresen indul. A munkafüzetet nem módosítottuk.

### Korábbi napló átvitele az új webcímre

Másik webcím — például a korábbi appcímről Netlify-ra, vagy a Netlify-címről saját domainre költözés — új böngészőtárat jelent. Ugyanezért másik telefonon vagy böngészőben sem jelennek meg maguktól a korábbi adatok.

1. A régi címen, az eredetileg használt böngészőben válaszd a **Beállítások → Mentés letöltése** lehetőséget, és őrizd meg a teljes JSON-mentést.
2. Az új címen válaszd a **Beállítások → Visszatöltés** lehetőséget, majd ezt a fájlt.
3. Ellenőrizd az **Előzmények** között a napokat és az összegeket. Ezután az új címről tedd az appot a kezdőképernyődre.

Ha még nem rögzítettél munkanapot, nincs mit átköltöztetni. A mentési fájlt a böngészőadatok törlése és a régi cím megszüntetése előtt töltsd le.

## Ellenőrzés és karbantartás

```sh
node --check dist/app.mjs
node --check dist/model.mjs
node --check dist/sw.js
node --test tests/model.test.mjs
```

A tesztek a munkafüzet négy kitöltött napját, a havi időösszegeket, a pontos egységeket, a keresőkódokat, a CSV-védelmet, az érvényesítést és a mentés/helyreállítás működését ellenőrzik.

A Service Worker a statikus felületet készíti elő offline használatra. Az első betöltéshez internet és az offline működés előkészítéséhez HTTPS szükséges. A tényleges telepítési lehetőség és offline viselkedés böngészőfüggő. Változtatáskor frissítsd a `dist/sw.js` cache-verzióját.

Az automatizált számítási ellenőrzések mellett a közzétett változaton még ellenőrizni kell a telefonos megnyitást, egy próbanap mentését és újranyitását, a JSON-visszatöltést, valamint az offline újranyitást. Böngészős vizuális ellenőrzés, tényleges Android-telepítés és élő Netlify-próba az export átadásáig nem történt.
