# Nordisk Mobilvask

Cloudflare Workers- og D1-app for Nordisk Mobilvask. Prosjektet inneholder offentlig landingsside og booking, automatisk avdelingsfordeling, franchiseinnlogging, ordrestyring og fakturagrunnlag.

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

Legg inn disse som krypterte variabler/secrets i Cloudflare:

```text
SETUP_TOKEN
RATE_LIMIT_SALT
```

`SETUP_TOKEN` brukes bare ved første opprettelse av administrator. `RATE_LIMIT_SALT` brukes til anonymisert begrensning av offentlige bookingforsøk.

## Første innlogging

Etter publisering åpner du:

```text
https://<worker-adresse>/portal/
```

Fyll inn:

- Firma: Nordisk Mobilvask
- Administrator: Dalen Holding
- E-post: dalenholding@outlook.com
- Et nytt passord på minst 10 tegn
- Verdien du la inn som `SETUP_TOKEN`

## Lokal test

```bash
npm install
npm run db:migrate:local
npm run dev
```

## Sider

- `/` – landingsside og offentlig booking
- `/portal/` – driftssystem for hovedkontor og franchisetakere

## Viktig før produksjon

Bekreft kontaktinformasjon, priser, personverntekst, organisasjonsnumre og fakturaflyt før løsningen brukes med reelle kunder. Fakturadelen lager fakturagrunnlag; EHF, betalingsintegrasjon og automatisk bokføring er ikke inkludert.
