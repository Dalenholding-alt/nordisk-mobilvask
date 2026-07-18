# Nordisk Mobilvask

Cloudflare Workers- og D1-app for Nordisk Mobilvask. Prosjektet inneholder offentlig landingsside og booking, avdelingsvisning, franchiseportal, ordrestyring og fakturagrunnlag.

## Cloudflare-oppsett

D1-databasen er konfigurert som:

- Binding: `DB`
- Database: `nordisk-mobilvask-test-db`
- Worker: `nordisk-mobilvask-test`

Databaseskjemaet ligger i `migrations/0001_init.sql`.

## Direkte Git-integrasjon i Cloudflare

Koble dette repositoryet til **Workers & Pages → Import a repository**.

Bruk:

```text
Production branch: nordisk-mobilvask
Root directory:    tom
Build command:     npm install && npm run check
Deploy command:    npm run deploy
```

For den nåværende testdeployen fungerer også:

```text
Build command:     tom
Deploy command:    npx wrangler deploy
```

Appens nødvendige filer ligger nå i:

```text
src/worker.js
public/index.html
public/portal/index.html
scripts/assemble.mjs
```

## Sider

- `/` – landingsside og testbooking
- `/portal/` – klikkbar driftssystem-demo
- `/api/health` – enkel teknisk helsesjekk

## Før produksjon

Testversjonen kan deles med kollegaer, men bookingformen lagrer foreløpig ikke reelle data. Bekreft kontaktinformasjon, priser, personverntekst, organisasjonsnumre og fakturaflyt før løsningen brukes med reelle kunder.
