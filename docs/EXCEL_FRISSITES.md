# Eredeti Excel-sablon és csapatbemutató – 2026-10-11

A meglévő, saját eszközre mentő napló változatlan tárolási kulccsal működik. A külön felső/alsó/kiegészítő legördülők megmaradtak. A mentésekből automatikusan elkészül a havi Excel a memóriában; a Havi táblázat / Excel és az Excel letöltése gombbal megnyitható, illetve letölthető.

## Excel

Az export a Toth.xlsx személyes bejegyzésektől megtisztított eredeti elrendezését, formázását, naposzlopait és terméksorait használja. Az első dolgozói blokkot tölti ki; a második blokk üres marad. Az eredeti feltöltött fájlt nem módosítja. Az Elszamolas, Napi_adatok és Normak munkalapok a darabszámokat, egyéb perceket, állapotokat és történeti normákat tartalmazzák.

A letöltött fájl pillanatkép. Nem frissíti automatikusan a főnök másik eszközét vagy már létező Excel-fájlját. A megfelelő számítógépes böngészőkben külön, kifejezett fájlválasztással felajánlott fájlírás csak nyitott oldalon működhet; a natív fájlválasztást ebben a környezetben nem teszteltük. Meglévő elszámolás helyett külön másolat használható.

## Csapatbemutató

A team.html kitalált dolgozókkal kipróbálható: beküldés, vezetői áttekintés, jóváhagyás/javítás és havi eredeti Excel. Külön helyi teszttárat használ. A szerepváltó nem belépés. A TEAM_CONFIG üres, éles belépés és közös adatküldés nincs engedélyezve. Éles dolgozói adatot ide ne írjatok. A Supabase-adattár, fiókok és szerveroldali jogosultságok telepítése és éles ellenőrzése még hátravan; ez a közzététel nem változtat hozzáféréseket.

## Ellenőrzések

33 helyi számítási, export- és modellezett szerveroldali teszt sikeres. 11 offline összeállított Chromium-felületellenőrzés sikeres, köztük saját mentésből havi export, sablonkoordináták, mennyiségmódosítás, 390 px szélesség és a tesztnapló elkülönítése. Ezek nem éles hálózati, Android-, felhőjogosultsági vagy többeszközös tesztek. A generált XLSX képleteit és kulcsértékeit külön táblázatkezelő motorral is ellenőriztük.

A munkalapok korábbi személyes adatai, titkos kulcsok és munkahelyi jelszavak nincsenek a csomagba beégetve. A saját böngészőadatok törlése előtt teljes JSON-mentést kell készíteni.
