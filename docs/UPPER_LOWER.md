# Külön felső és alsó rögzítés — 2026-10-11

A gyors rögzítés három külön részre vált: Felső (23 típus), Alsó (13 típus), Kiegészítők (3 típus). Mindegyiknek saját legördülő listája, darabmezője és Hozzáadás gombja van. A listák nem fedik egymást; a GERM felső és alsó is a megfelelő helyre kerül.

Minden rész külön megjegyzi az utoljára kiválasztott típusát. A régi közös választás csak a hozzá tartozó részbe kerülhet át. Hozzáadás után csak az érintett darabmező áll vissza 1-re; a másik részben elkezdett beírás megmarad. A napi részösszegek külön látszanak, az összes elszámolt idő továbbra is közös.

A változás csak a gyorsrögzítő modulját, stílusát és a statikus gyorsítótár verzióját érinti. A napló kulcsai, normái, számításai, naplezárása, mentési formátuma és az eredeti rögzítési útvonal változatlan. Nincs új adatküldés, belépés, jogosultság vagy backend.

Ellenőrzés: 5 gyorsrögzítő-egységteszt; 22 célzott helyi Chromium-felületellenőrzés az egyéni és a csapatbemutató változattal. A helyi felületi teszt beillesztett HTML-lel és modellezett localStorage-ral készült. Nem éles hálózati, Android- vagy Service Worker-teszt. A csapatbemutató továbbra sem valódi többfelhasználós szolgáltatás, és nem része a nyilvános telepítésnek.
