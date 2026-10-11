# Közös próba — 2026-10-11

## Állapot

A Supabase kapcsolat ellenőrzése szerint a plugin még nincs telepítve/csatlakoztatva. Nem történt felhőprojekt-migráció, Edge-telepítés, ütemező-aktiválás, valódi dolgozói fióklétrehozás vagy két fizikai készülékes próba. A bemutato/ és harom-nezet/ nyilvános oldalak nem változtak.

Ebben az ágban az új 07-es pilot-jobs migráció, annak SQL tesztje és az eldobható adatbázisos CI található. A teljes, integrált kliens/szerver és a tartós küldési sor a beszélgetésben átadott forráscsomagban van; nem állítjuk, hogy az összes csomagfájl már szerepel ebben az ágban.

## Forráscsomag

`Muszaknaplo_Kozos_Proba_Forras.zip`

SHA-256: `b1ae66e103ea15b83f0bfbaf0148605e67c4f81c6b179bc27fe7809b94190fc4`

151 fájl. A csomag `START_HERE.md`, `docs/PILOT_STAGING.md` és `docs/PILOT_ACCEPTANCE.md` dokumentumai tartalmazzák a telepítés és a valódi főnöki próba lépéseit. A `public-pilot/kozos-proba/` egy elkülönített, telepíthető statikus alkönyvtár. Alapértelmezésben `enabled:false`; nincs benne kitalált működő kapcsolat vagy valódi hitelesítő adat.

Elkészült a három rögzítési mód közös, hitelesített kliense, a lemezre írás után küldő tartós sor, az elveszett visszaigazolás idempotens újrapróbálása, a napközbeni mentés és beküldés elkülönítése, a vezetői ellenőrzés, a központi havi Excel állapotának olvasása, a fájlengedélyhez kötött helyi visszaírás, valamint a szerveroldali, foglalással védett Excel-feldolgozó kódja.

A helyi várakozó sor nem titkosított. Újranyitás után online újrabejelentkezés szükséges; az offline héj nem offline hitelesítés. Az egyszeri Excel-letöltés nem automatikus gépi szinkron. A közös működés és a háttérütemező tényleges aktiválása még hátravan.

## Tényleges tesztek

- 134/134 Node-teszt sikeres, ebből 44 új pilot-/mentési-/fájléletciklus teszt.
- 25/25 UI-ellenőrzés sikeres: valódi kliensmodulok, de szimulált Auth/HTTP, helyi tár és böngészőzár. Külön Chromium dokumentumok, nem valódi Supabase vagy telefonok.
- A tényleges exportáló XLSX fájljában 23 lap található, és az első próbadolgozó 2026-10-12 napi O11 cellája 6. A másolás/újraküldés nem duplázta meg a darabszámot a tesztmodellben.
- Valódi PostgreSQL 16 CI: 1501 sikeres ellenőrzés, ebből 27 új pilot-job ellenőrzés. A Supabase Auth segítségfüggvényeit a CI tesztmegoldása helyettesítette.
- Ellenőrzött SQL futás: https://github.com/tothda1992-tech/ablage/actions/runs/38154092576
- Ellenőrzött SQL commit: `f10148aa2041c703112e8257a3ad3d09eb2b8e42`.

A környezet a localhost böngészős navigációját is ERR_BLOCKED_BY_ADMINISTRATOR hibával tiltja. A korlátozást nem kerültük meg; az in-memory Chromium ellenőrzés nem bizonyít natív localStorage/Web Locks működést az adott Androidon, hálózati telepítést vagy valódi fájlválasztást.

## Folytatás

A Supabase csatlakoztatása után külön staging projekt, séma, szerverfunkciók, Vault/ütemező, fiktív teszthozzáférések, klienskonfiguráció és valódi kétkészülékes ellenőrzés szükséges. Valódi nevek és jelszavak csak a főnöki jóváhagyás után. A pilot átadása nem jelent éles HR-használati engedélyt.
