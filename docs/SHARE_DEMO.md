# Továbbküldhető bemutató: app + eredeti Excel

2026-10-11. Külön demóoldal a főnöki bemutatáshoz. A korábbi saját naplót és a csapatappot nem módosítja.

Tervezett közzétételi cím: https://tothda1992-tech.github.io/ablage/bemutato/
Közvetlen táblázatnézet: https://tothda1992-tech.github.io/ablage/bemutato/?view=sheet

## Funkciók

- Sötét, telefonra igazított termelési felület, semleges felső/alsó termékikonokkal.
- Három külön legördülő: felső, alsó, kiegészítők. Az adott kategória csak a saját termékeit engedi.
- Kitalált D001 és D002 dolgozó; nincs jelszó, nincs valódi hitelesítés.
- A Hozzáadás azonnal menti a próbadarabszámot, frissíti a napi táblázat-előnézetet és a teljes havi mátrixot.
- A 7 eredeti állásidő/egyéb kategória percei hozzáadhatók; a munkaóra külön szerkeszthető.
- Eredeti Toth.xlsx-sablonból készülő XLSX, a meglévő excel-export.mjs modul változtatása nélkül. A letöltött fájl BEMUTATÓ jelölést kap; csak a kiválasztott mintadolgozó adatait tartalmazza.
- Vezetői összesítés ugyanazokból a helyi próbaadatokból; dolgozónkénti táblázat és export.
- Megosztási gomb: natív megosztás, vágólap, vagy kijelölhető link. A hivatkozás nem tartalmaz naplóadatot.

## Adatvédelem és határok

Külön localStorage-kulcs: `muszaknaplo.boss-preview.v1`. Nem olvassa és nem módosítja a `muszaknaplo.data.v1` és `muszaknaplo.team.demo.v1` naplókat. Nincs háttérszolgáltatás, bejelentkezés, HR-küldés vagy többeszközös szinkron. A link megnyitója saját helyi próbát kap, nem a küldő bejegyzéseit. A letöltött Excel pillanatkép, nem frissül automatikusan a fogadó számítógépén. Az oldal ezt láthatóan jelzi.

Nem kerül be az eredeti kitöltött munkafüzet, valódi munkanap, fénykép, API-kulcs vagy személyes dolgozói adat. A terméknormák és a tisztított sablon a már közzétett, változatlan modulokból jönnek.

## Ellenőrzés

- A már meglévő `original-excel.test.mjs`, `team.test.mjs`, `quick-entry.test.mjs` összesen 26 Node-tesztje sikeres.
- 13 célzott felület-/exportellenőrzés: a tényleges JavaScript Chromiumba töltve, teszt-memóriatárat használva; a valódi XLSX-letöltéseket XML-szinten is ellenőriztük.
- Ellenőrizve: 3+4=7 darab mind a táblázatban, mind a letöltött Excel helyes naposzlopában; pontos időösszegek; dolgozók elkülönítése; 28 napos február; régi naplók érintetlensége; érvénytelen mennyiség elutasítása; 320–1440 px nézetek; nincs JavaScript-hiba.
- A letöltött próba-Excel artifact_tool ellenőrzése nem talált képlethibát. Az eredeti formázás vizuálisan ellenőrizve.
- Korlát: a tesztkörnyezet tiltja a böngésző navigációját. A teszt nem valódi Android/Messenger-próba, és önmagában nem igazolja az élő HTTP-telepítést. A közzétételt külön kell ellenőrizni.
