# Legördülős gyors rögzítés — 2026-10-11

A felhasználó kérésére a napi felület tetejére natív típusválasztó került. Csoport: összes, felső, alsó, kiegészítők. A 39 normás termék az eredeti hét csoportban szerepel. Kiválasztás önmagában nem rögzít darabot. A Hozzáadás a megadott pozitív egész mennyiséget hozzáadja az adott naphoz. Siker után a darabmező 1-re áll, a típus megmarad. Az előző típust külön, kizárólag felületi beállításként menti az eszköz.

A listában csak a már felírt típusok látszanak, a korábbi +/− javítógombokkal. A normák, az elszámolási képletek és az eredeti munkanapló tárolási sémája változatlanok. A lezárt nap nem módosítható a gyors felületről sem.

A quick-entry-live.mjs a korábbi alkalmazás eredeti input-eseményén át rögzít, nem ír közvetlenül munkanapló-adatot. Nincs új backend, fiók, jogosultság vagy külső szolgáltatás. Ez a változtatás nem élesíti a többdolgozós rendszert.

Ellenőrzés: node --test tests/quick-entry.test.mjs (4 sikeres teszt). További 25 helyi Chromium-felületellenőrzés futott az egyéni appon és a külön csapatbemutatón. A böngésző HTTP-navigációja ebben a környezetben blokkolt, ezért a felületi tesztek hálózat nélkül beillesztett HTML-t és modellezett helyi tárat használtak. A tesztek nem jelentenek valódi Android- vagy éles hálózati próbát.

A csapatbemutató külön forráscsomagban marad; a korábban blokkolt többfelhasználós backend-közzétételt ez a felületi javítás nem kerüli meg. A közös mentés és a főnöki Excel-kapcsolat továbbra is külön bekötési feladat.
