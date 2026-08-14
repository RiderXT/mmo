# Wdrożenie na VPS (Ubuntu 26.04, OVH)

Krok po kroku, od świeżego VPS-a do działającej gry pod domeną z HTTPS. Komendy oznaczone
`(lokalnie)` uruchamiasz na swoim komputerze (Windows — PowerShell albo Git Bash), resztę na
VPS-ie przez SSH.

## 1. Połączenie z serwerem

OVH po zamówieniu VPS-a wysyła mailem: adres IP oraz hasło roota (albo prosi o klucz SSH przy
zamawianiu — jeśli podałeś klucz, logujesz się nim bez hasła).

Z Windows masz `ssh` wbudowane (PowerShell 10/11 albo Git Bash — dokładnie to, czego już
używamy w tej sesji). Otwórz terminal i:

```bash
ssh root@TWOJE_IP
```

Za pierwszym razem zapyta o potwierdzenie odcisku klucza serwera — wpisz `yes`. Potem albo
wpiszesz hasło z maila OVH (nie zobaczysz wpisywanych znaków — tak ma być), albo zalogujesz się
od razu jeśli masz skonfigurowany klucz.

**Pierwsza rzecz po zalogowaniu — zmień hasło roota** (jeśli logowałeś się hasłem z maila):

```bash
passwd
```

## 2. Domena → VPS (DNS)

Masz już domenę używaną do innych rzeczy, więc **polecam podpiąć grę pod subdomenę**
(np. `gra.twoja-domena.pl`), żeby nic nie kolidowało z tym, co już tam masz. Jeśli wolisz root
domeny albo inną subdomenę — zamień wszędzie niżej `gra.twoja-domena.pl` na swój wybór.

Jeśli domena jest zarejestrowana w OVH:

1. Zaloguj się w [manager.ovh.com](https://manager.ovh.com)
2. **Web Cloud → Domeny → (Twoja domena) → Strefa DNS**
3. **Dodaj wpis** → typ `A`
4. Pole "Subdomena": `gra` (dla `gra.twoja-domena.pl`) — puste, jeśli chcesz root domeny
5. Pole "Cel": adres IP Twojego VPS-a
6. TTL: zostaw domyślny, zapisz

Jeśli domena jest kupiona gdzie indziej — to samo, tylko w panelu DNS tamtego dostawcy.

Propagacja u OVH to zwykle kilka minut do godziny. Możesz sprawdzić z lokalnego terminala, czy
już działa:

```bash
nslookup gra.twoja-domena.pl
```

— gdy w odpowiedzi pojawi się IP Twojego VPS-a, DNS jest gotowy (nie musisz czekać, żeby
kontynuować resztę kroków — zdąży się propagować, zanim dojdziesz do certbota w kroku 9).

## 3. Pierwsze zabezpieczenia serwera

```bash
apt update && apt upgrade -y

# osobny użytkownik zamiast pracy na roocie
adduser deploy
usermod -aG sudo deploy
```

Wyloguj się (`exit`) i zaloguj ponownie jako `deploy`: `ssh deploy@TWOJE_IP`. Od teraz wszystkie
komendy poprzedzone `sudo`.

```bash
sudo apt install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

(Opcjonalnie, ale zalecane po potwierdzeniu, że logowanie jako `deploy` działa: wyłącz
logowanie roota przez SSH — `sudo nano /etc/ssh/sshd_config`, ustaw `PermitRootLogin no`,
`sudo systemctl restart ssh`.)

## 4. Node.js 20, pnpm, PostgreSQL

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs build-essential git
node -v   # v20.x

sudo npm install -g pnpm

sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER mmo WITH PASSWORD 'WSTAW_SILNE_HASLO';"
sudo -u postgres psql -c "CREATE DATABASE mmo OWNER mmo;"
```

## 5. Kod na serwer

**Zalecane — przez GitHub** (umożliwia proste aktualizacje przez `git pull` później):

```bash
# (lokalnie, jednorazowo) utwórz puste repo na github.com, potem:
git remote add origin https://github.com/TWOJ_LOGIN/mmo.git
git push -u origin master
```

```bash
# (na VPS)
sudo mkdir -p /var/www/mmo
sudo chown deploy:deploy /var/www/mmo
git clone https://github.com/TWOJ_LOGIN/mmo.git /var/www/mmo
cd /var/www/mmo
```

**Alternatywa bez GitHuba** (szybki start, ale kolejne update trzeba będzie wgrywać ręcznie):

```bash
# (lokalnie, z katalogu projektu)
rsync -avz --exclude node_modules --exclude .git --exclude apps/api/dev.db \
  ./ deploy@TWOJE_IP:/var/www/mmo/
```

## 6. Zależności, konfiguracja `.env`, build

```bash
cd /var/www/mmo
pnpm install

cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

Ustaw w `apps/api/.env`:

```
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
DATABASE_URL="postgresql://mmo:WSTAW_SILNE_HASLO@localhost:5432/mmo"
JWT_ACCESS_SECRET=<wynik: openssl rand -hex 32>
JWT_REFRESH_SECRET=<wynik: openssl rand -hex 32>
COOKIE_SECRET=<wynik: openssl rand -hex 32>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
CORS_ORIGIN=https://gra.twoja-domena.pl
```

(`HOST=127.0.0.1` — API nie jest wystawione bezpośrednio na świat, tylko przez nginx niżej.)

Wygeneruj sekrety:

```bash
openssl rand -hex 32   # uruchom 3×, wklej po kolei do JWT_ACCESS_SECRET/JWT_REFRESH_SECRET/COOKIE_SECRET
```

Skonfiguruj frontend (jeden plik, przed buildem):

```bash
echo "VITE_API_URL=" > apps/web/.env
```

(Puste `VITE_API_URL` = zapytania idą pod ten sam adres co strona — nginx przekierowuje
`/api/*` do backendu, więc nie trzeba osobnej domeny/CORS dla API.)

Build:

```bash
pnpm --filter @mmo/api prisma:generate:prod
pnpm --filter @mmo/api build
pnpm --filter @mmo/web build
```

## 7. Baza danych: tabele + dane startowe

```bash
pnpm --filter @mmo/api prisma:push:prod   # tworzy tabele w Postgresie wg schema.production.prisma
pnpm --filter @mmo/api seed                # konto admina + 4 klasy postaci + przykładowa zawartość
```

Zaloguj się potem na `admin@mmo.local` / `ChangeMe123!` i **od razu zmień hasło** (albo usuń to
konto i załóż nowe przez panel rejestracji, potem ręcznie ustaw rolę `admin` w bazie).

## 8. Uruchomienie API jako usługi systemd

```bash
sudo cp deploy/mmo-api.service.example /etc/systemd/system/mmo-api.service
sudo nano /etc/systemd/system/mmo-api.service   # popraw User/WorkingDirectory jeśli inne niż /var/www/mmo, deploy
sudo systemctl daemon-reload
sudo systemctl enable --now mmo-api
sudo systemctl status mmo-api        # powinno być "active (running)"
journalctl -u mmo-api -f             # podgląd logów na żywo (Ctrl+C, by wyjść)
```

## 9. nginx (reverse proxy) + certbot (HTTPS)

```bash
sudo apt install -y nginx

sudo cp deploy/nginx-mmo.conf.example /etc/nginx/sites-available/mmo
sudo nano /etc/nginx/sites-available/mmo   # ustaw server_name na gra.twoja-domena.pl
sudo ln -s /etc/nginx/sites-available/mmo /etc/nginx/sites-enabled/mmo
sudo nginx -t          # sprawdza składnię, powinno napisać "syntax is ok"
sudo systemctl reload nginx
```

To tworzy **nowy, osobny** plik konfiguracji — nie rusza żadnych innych stron, które już masz
skonfigurowane w nginksie na tym serwerze.

Teraz HTTPS (wymaga, żeby DNS z kroku 2 już się propagował):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d gra.twoja-domena.pl
```

Certbot sam dopisze do configu przekierowanie HTTP→HTTPS i będzie odnawiał certyfikat
automatycznie (systemd timer `certbot.timer`, instalowany razem z pakietem).

## 10. Test

Otwórz `https://gra.twoja-domena.pl` — powinna wczytać się strona logowania. Zaloguj się jako
admin, zmień hasło, sprawdź panel `/admin/logs`, żeby potwierdzić, że backend odpowiada.

## 11. Kolejne aktualizacje

```bash
# (lokalnie) commit + push zmian do GitHub, potem na VPS:
cd /var/www/mmo
./deploy/deploy.sh
```

Skrypt robi `git pull`, `pnpm install`, build obu apek i restart usługi. Jeśli wdrażasz przez
`rsync` zamiast gita, podmień w skrypcie pierwszą linię (`git pull`) na swój sposób synchronizacji
plików.

## Alternatywa: Caddy zamiast nginx

Jeśli wolisz Caddy (mniej configu, automatyczne HTTPS bez osobnego certbota) zamiast kroku 9 —
patrz `deploy/Caddyfile.example`. Reszta kroków (systemd, `.env`, build) jest identyczna.
