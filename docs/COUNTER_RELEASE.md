# Kártyás számláló + közös piszkozatmentés előkészítése

2026-10-11. A felhasználó képernyőképének megfelelő rögzítési mód a korábbi kereső helyett. A Gyors lista és a Nagygombos kezelése megmarad; az eredeti /bemutato/ és saját napló nem változik.

## A második mód

Neve: Kártyás számláló, belső módazonosító továbbra is cards (a nézetválasztás kompatibilis marad). Mind a 39 termék görgethető, az eredeti sablon sorrendjében, kereső és kategóriaszűrés nélkül. Kód, csoport, normaidő, középen napi darabszám, mellette mínusz és plusz. Telefonon két oszlop; a már felírt termékek kiemelést kapnak. A sötét megjelenés megmarad.

A plusz és mínusz azonnali termékművelet. A középső mező az ABSZOLÚT napi összesen: beírás után Mentés vagy Enter szükséges, a Mégse/Escape elveti. Nézet- vagy dolgozóváltás nem menti el véletlenül; a félbehagyott beírás az oldal nyitvatartása alatt dolgozó/nap/termék szerint elkülönül. Várható napverzió akadályozza meg, hogy egy régi javítás felülírja az újabb mennyiséget. Nulla alá nem lehet menni, lezárt/beküldött nap nem módosítható. Ugyanazt a közös rögzítővezérlőt használja, nem külön naplót.

## Helyi ellenőrzések

- 90/90 Node-teszt sikeres a teljes, aktuális fejlesztői csomagon: számítás, Excel-export, jogosultságadapterek, közös munkafüzet és rögzítési módok.
- 33/33 célzott Chromium-felületellenőrzés sikeres. A tényleges JavaScript futott, de a böngésző tárát és Web Locks felületét tesztadapter helyettesítette; ez nem Android-/Messenger-próba és nem élő HTTP-böngészős ellenőrzés.
- Gyors lista 3 + kártyák 2 + nagygomb 1 = 6 darab. A valóban letöltött XLSX XML-tartalmában D001!O11=6 és D002!O11=8; a másik dolgozó adata megmaradt. 23 fül: összesítő, 20 dolgozó és két technikai lap. 6 × 16,38 = 98,28 normaperc.
- Ellenőrizve: minden típus megjelenik, nincs kereső; 320–1440 px nézetek, kézi összeg jóváhagyása/hibái, mentetlen beírás elkülönítése, visszavonás, a másik két mód alapfolyamatai, korábbi naplókulcsok érintetlensége. Nincs nem kezelt JavaScript-hiba.
- A feltöltésre előkészített harom-nezet fájlok Git-blobazonosítói egyeznek a helyileg tesztelt változatéval. A közzététel sikerét külön a GitHub Pages futása igazolja majd.

## Folytatás a háttérrendszerben, NEM élesítve

Külön ág: feature/central-drafts-20261011, commit c09705b6b2ca7e9fb398f918ffc9a2b91d86293b.

Elkészült a save_workday_draft és submit_workday külön adatbázisművelete. Az ismételt kérés nem számol duplán; ugyanazt a kérésazonosítót újraküldve nincs új verzió, audit vagy Excel-feladat. Másik eszköz régi napverziója elutasítást kap. A már beküldött nap javításához vezetői visszaadás szükséges. A közös havi munkafüzet feldolgozása verzióellenőrzéssel védi a legfrissebb állapotot.

A 38151196861 GitHub Actions futás sikeres. Eldobható PostgreSQL 16 adatbázisban a korábbi 1377 és az új 97 ellenőrzés is sikeres: összesen 1474 SQL-állítás. A 9 kérés-/munkamenetadapter-teszt is sikeres. A CI tesztazonosságokat használ: nem valódi Supabase Auth HTTP, nem céges adat, nem éles fiók, nem telepített felhős rendszer. Az adatbázis fájlverziótesztjében tesztbájtsor szerepel; a valódi XLSX-tartalmat külön a felületi exportteszt vizsgálja.

A Supabase-kapcsolat továbbra sincs telepítve. A nyilvános háromnézetes oldal helyi próba marad. A gateway adapter még nincs rákötve a felületre; a tartós offline műveletsor és a többeszközös próba következik. A valódi dolgozói fiókok csak a főnöki jóváhagyás után jönnek. A főnök számítógépén lévő Excel-fájl frissítéséhez továbbra is külön fájlkapcsolat szükséges.
