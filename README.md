# Csipetke

A **Lovassy László Gimnázium**, Csipetke nevű elsősavatójának kezelésére készült webalkalmazás.

## Funkciók
- ***Bejelentkezés***
    - Google OAuth
    - Csak iskolai fiókkal
    - Jogosultságok hozzárendelése az email-cím alapján
- **Feladatok**
    - Egyszerű szervezői szerkesztés
    - Kezdetleges verziókezeléssel
    - Határidőkkel
- **Fájlfeltöltések**
    - Osztályonként feltölthető megoldások a feladatokhoz
    - Egyszerű letöltés az osztályon belül az ellenőrzéshez
    - Letöltés a szervezőknek
- **Közönségszavazások**
    - Opciók képekkel
    - Grafikonok a szavazás állásáról
    - Élő websocket frissítés
- **Ruhapontozás**
    - A fő pontozástól független rendszer
    - A Csipetke héten lévő jelmezekhez
- **Zsűri pontozás**
    - Azonnali feldolgozás
    - Sorbarendezett műsorlista
- **Pontozás**
    - Egyedi pontok hozzáadása indoklással
    - Zsűri pontok automatikus hozzáadása
    - Opcionálisan elérhető, hogy publikus legyen egy ideig az állás, és befagyasztható az admin felületről.
- **Archívum** 
    - Fényképek az előző évekről
---
- **Audit napló**
    - Szerkesztések, fájlfeltöltések rögzítése, kezdetleges szűrőkkel
- **Jogosultságkezelés**
    - Szerepkörök és egyedi jogosultságok kezelése
- **Műsorlista kezelése**
    - A feladatok sorbaállítása
    - Szünetek és megjegyzések hozzáadása

## Technológia

| Réteg | Eszközök |
|---|---|
| DB | PostgreSQL |
| Backend | Python, FastAPI, SQLAlchemy (async) |
| Frontend | Angular (standalone komponensek), NgRx Signals, Angular Material, Chart.js |
| Hitelesítés | Google OAuth, JWT tokenek |

## Hitelesítés és szerepkörök

A belépés Google OAuth segítségével történik. A backend korlátozza az iskolai email-címekre és regex alapú szűrést végez.
A felhasználó osztálya és szerepköre az iskolai email-cím szerkezetéből származik, ezáltal nem szükséges külön foglalkozni a jogosultságok kiosztásával.

* Diák: `^([a-z0-9\.-]+)\.(\d{2})\.([a-d])@lovassy\.edu\.hu$`
* Tanár: `^([a-z0-9\.-]+)@lovassy\.edu\.hu$`

### Szerepkörök

1. **Admin**
2. **Szervező** - Automatikusan a megadott osztály tagjai (pl. 25.a). 
3. **Nyekes** - Automatikusan a megadott évfolyam (pl: 26).
4. **Diák** - Hozzárendeli az évfolyamot és az osztályt, de a menüsor színén kívül nincs jelentősége.
5. **Tanár** - Minden nem diák, de tanár regex-es email-cím.

## Helyi fejlesztői környezet

### Előfeltételek

- Python 3.13 vagy újabb és [uv](https://docs.astral.sh/uv/)
- Node.js és pnpm (Corepack használható)
- Docker Compose (a PostgreSQL futtatásához)

### Adatbázis

```sh
cp .env.example .env        # állíts be helyi adatbázis-jelszót
docker compose up -d db
```

### Backend

```sh
cd backend
cp .env.example .env        # DATABASE_URL, JWT-titok, Google OAuth adatok
uv sync --frozen
uv run fastapi dev main.py
```

Az API a `http://localhost:8000` címen érhető el, az interaktív dokumentáció a `/docs` alatt (fejlesztői módban). Indításkor a hiányzó táblák létrejönnek, és a kezdeti szerepkörök betöltődnek.

### Frontend

```sh
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm start
```

A fejlesztői szerver a `http://localhost:4200` címen fut.

### Google bejelentkezés beállítása

1. Hozz létre OAuth-kliensazonosítót a [Google Cloud Console](https://console.cloud.google.com)-ban.
2. Add meg az engedélyezett átirányítási URI-ket (helyi fejlesztéshez `http://localhost:4200`).
3. A Client Secret és ID-t írd bele az `.env` fájlba.

## Környezeti változók

A pontos lista a `.env.example` fájlokban található. Alapvetően:

| Változó | Szerepe |
|---|---|
| `DATABASE_URL` | PostgreSQL kapcsolat (asyncpg) |
| `JWT_SECRET_KEY` | A tokenek aláírása – hosszú, véletlenszerű érték kell |
| Google OAuth adatok | Kliensazonosító és titok |

## Éles üzemeltetés

A projekt Docker Compose-szal építhető és indítható (API, frontend, PostgreSQL, archívum). Éles környezetben:

- a konténerek elé reverse proxy kerüljön (HTTPS-sel), amely a biztonsági fejléceket is beállítja (HSTS, `X-Frame-Options`, `X-Content-Type-Options`, CSP, `Referrer-Policy`, `Permissions-Policy`),
- az API dokumentációs és hibakereső végpontjai legyenek kikapcsolva,
- az adatbázisról készüljön rendszeres mentés.

## Terheléspróbák (k6)

A forgatókönyvek a `tests/k6/` mappában vannak.

A tokenek generálása a `tests/generate_test_tokens.py` szkripttel gyorsan elvégezhető.

```sh
cd tests/k6
K6_TOKENS='token1,token2' BASE_URL='http://localhost:8000' k6 run normal-tests.js
```

## 2026-os üzemeltetés

Idén egy [Contabo VPS](https://contabo.com) szerveren futott Dokploy-al. A szerver bőven elbírta a teljes terhelést.

### Egyéb megjegyzések
- Az admin fiók létrehozása nem automatikus, az adatbázisba belépve kell a felhasználó jogosultságát átállítani `admin`-ra.
- A backend cacheli a jogosultságokat 5 percre, így ha nem a rendszeren keresztül történik a változtatás, hanem az adatbázisban, érdemes újraindítani a backendet.
- A zsűri pontozása idén a legkisebb és legnagyobb pontszám elhagyása után megmaradó pontszámok összegén alapult, ezzel csökkentve a szélsőséges értékek hatását. A pontszámítás módja egyszerűen módosítható a `backend/juror_score/service.py` fájl `_recalculate_point()` metódusában.
- A kliens a visszaszámlálók pontosságáért néha szinkronizálja az idejét a szerverrel, így akár elérhető kevesebb mint 50 ms (ritkán <10ms) eltérés két kliens között. (Jól néz ki, bár gyakorlati haszna nincs.)