# Piszkozatmentés és beküldés – elkülönített fejlesztés

Nincs éles Supabase-telepítés, valódi felhasználó vagy titkos kulcs ebben az ágban. A nyilvános bemutatók változatlanok.

Új RPC-k: save_workday_draft és submit_workday. Mindkettő a hitelesített dolgozóhoz kötött, élő munkamenetet ellenőriz, várható napverziót és kérés-UUID-t kér. Ugyanazon kérés megismétlése nem hoz létre új darabot, verziót, auditot vagy jelentésmunkát. Az ismételt válasz a legfrissebb napot adja vissza a korábbi művelet bizonylatával, nem tölt vissza régi állapotot.

A mentés draft marad. A külön beküldés a mentett piszkozatot zárolja. Másik eszköz régi verziójú mentése hibát kap, nem ír felül csendben. A közös havi Excel feladatát ugyanabban az adatbázis-tranzakcióban frissítő trigger a 05 migrációból származik. A 06 a privilegizált munkafüzet-függvényeket privát implementáció és invoker belépési pont mögé viszi.

A workday-gateway.mjs adapter nincs a bemutatóba kötve. A parancsot egyszer kell előkészíteni és hálózati válaszvesztés után ugyanazt újraküldeni. A jelenlegi adapter memóriabeli, még nem tartós offline sor. Kijelentkezés vagy dolgozóváltás után nem enged másik személyhez tartozó parancsot/választ felhasználni.

A CI kizárólag eldobható PostgreSQL 16 konténerben fut. A Supabase auth/storage felületeket SQL-próbafüggvények helyettesítik; nem teszteli az Auth HTTP-t, a valódi telefonokat, a felhős Edge futtatást vagy a főnök gépén történő Excel-visszaírást. A CAS-fájltesztben csak tesztbájtsor szerepel; a tényleges XLSX-előállítást a kliensoldali exporttesztek ellenőrzik.

Következő integráció: elkülönített Supabase-próbaprojekt, éles adatok nélküli tesztazonosítók, szerveroldali nyugtázás kijelzése a kliensben, tartós műveletsor és többeszközös ütközési felület, majd a privát közös munkafüzet-feldolgozó bekötése. A valódi dolgozói fiókok továbbra is a főnöki jóváhagyás után készülnek.

Dokumentáció: https://supabase.com/docs/guides/database/functions és https://supabase.com/docs/guides/local-development/testing/overview
