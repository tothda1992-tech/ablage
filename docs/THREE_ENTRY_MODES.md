# Három rögzítési mód – elkülönített fejlesztői bemutató

2026-10-11. A főnöknek korábban elküldött `/bemutato/` és a személyes napló változatlan. Ez a fejlesztés kizárólag az új `dist/harom-nezet/` könyvtárat adja hozzá.

Közzétételi útvonal: https://tothda1992-tech.github.io/ablage/harom-nezet/

## Elkészült

- Gyors lista: külön felső, alsó, kiegészítő legördülő; hozzáadandó darabszám; csak a Hozzáadás ment.
- Kártyás kereső: termékkódok, régi kódok és ékezet nélküli keresés; kategória- és kedvencszűrő; +1/−1; külön napi összeg javítása.
- Nagygombos: nagy +1 darab, külön +5 és Javítás; stabil sorrend, kategóriák és kedvencek. A kártya hátterére koppintás nem rögzít.
- Mindhárom ugyanazon controlleren és napi rekordokon dolgozik. A munkaórák, állásidők, normák és Excel-képletek jelentése változatlan.
- Nézet, kedvencek, utolsó kiválasztott típusok dolgozónként külön mentődnek ezen a böngészőn belül. A félbehagyott darabmezők dolgozóhoz és naphoz kötötten megmaradnak a megnyitott oldalon; puszta váltással nem kerülnek az elszámolásba.
- Visszavonás kizárólag az utolsó saját termékműveletre, ugyanazon napverzión belül. Nem állítja vissza a teljes csapatadatot. Elavult javítás, lezárt nap, hibás kategória vagy mennyiség elutasítva.
- Egy havi munkafüzet: Osszesito + D001–D020 + 2 rejtett technikai fül. Az eredeti Toth.xlsx első dolgozói blokkja dolgozónként megőrizve. Az appban ugyanaz a napi cella frissül; nincs külön lista/kártya/nagygombos Excel.
- Késve elkészülő, korábbi verziójú Excel nem engedélyezheti a régi letöltést egy újabb mentés után.

## Adat- és hozzáférési határok

Csak kitalált próbadolgozók. A dolgozóválasztó NEM hitelesítés vagy biztonsági jogosultsághatár. Nincs Supabase-kapcsolat, valódi jelszó, többtelefonos adatküldés vagy HR-küldés. Valódi fiókok kizárólag a főnöki jóváhagyás után készülnek.

Külön localStorage: `muszaknaplo.three-modes-demo.v1`. A nézetbeállítások külön `muszaknaplo.entry-modes.v1.<scope>.<employee>` kulcsok. A korábbi személyes, főnöki és közös-Excel demótárakat nem olvassa és nem módosítja.

Az Excel-letöltés pillanatkép, NEM fájlszinkron. A korábban megépített fájlcsatlakoztatás megfelelő böngészővel, explicit engedéllyel és nyitva tartott appal ugyanazt a külön célfájlt frissítheti. Külső kézi fájlváltozásnál leáll. Fizikai gépen ezt ebben a körben nem teszteltük.

## Ellenőrzés – ebben a fejlesztési körben

- 68 meglévő Node-teszt újrafuttatva: számítások, Excel-export, munkafüzet, korábbi hozzáférési kód és modellezett szerverfolyamatok.
- 13 új entry-controller teszt: három beviteli út egyezése, kategória/értékellenőrzés, normapillanatkép, szelektív visszavonás, elavult javítás, per-worker preferenciák, mind a 20 mintadolgozó ugyanabban a munkafüzetben.
- 21 Chromium felületellenőrzés: tényleges app-JavaScript, 3+2+1=6, D001!O11=6, D002!O11=8 a valóban letöltött XLSX-ben; félbehagyott mezők; dolgozók elkülönített nézete; stabil sorrend; 320/360/390/768/1280 px; sötét kategóriakártyák; billentyűzetes rögzítés; lezárt nap; késői Excel-válasz.
- Az exportált XLSX artifact_tool ellenőrzése megerősítette a két tesztcellát, a vizsgált képlethibákra 0 találatot adott. Összesítő előnézet készítve.

A felületpróbában a localStorage és Web Locks memóriabeli adaptert kapott. A böngésző teljes navigációját a környezet blokkolta; az alkalmazást közvetlenül a tesztoldalba töltöttük. Ez NEM fizikai Android/Messenger-próba, nem valódi OS-fájlválasztó és nem éles Supabase-teszt. A közzététel állapotát külön kell ellenőrizni.

A teljes helyi fejlesztői csomagban: `tests/entry-modes/core.test.mjs`, `tests/entry-modes/ui.py`, naplók, eredmény-JSON, önálló HTML-bemutatót készítő bundler. A kiadási mappában nincs tesztadatfájl, hozzáférési kulcs vagy eredeti kitöltött dolgozói Excel.

## Következő, külön szakasz

Elkülönített Supabase-próbakörnyezet, majd két külön eszközön dolgozó → központ → vezető → közös havi Excel teljes folyamatának tesztelése. Éles felhasználók és jelszavak csak jóváhagyás után.
