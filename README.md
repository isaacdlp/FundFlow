# FundFlow

## Windows Dev Environment

* Install [Git Bash](https://git-scm.com/install/windows)
* Install [Node.js](https://nodejs.org) 22 LTS
* Set npm's script shell. It's saved in your user .npmrc, so it applies to every project.

```bash
npm config set script-shell "C:\Program Files\Git\bin\bash.exe"
npm config get script-shell     # Check
```

* Install [PostgreSQL 16](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)
* Install [Mailpit](https://mailpit.axllent.org/docs/install/) to emulate Email sending / receiving
* Create .env
* Run

```bash
npm install
npm run db:push
npm run dev.
```

* FundFlow runs in http://localhost:5000
* Mailpit runs in http://localhost:8025

```bash
npm run dev-data:export     # grab data from production into a local dev repo
npm run dev-data:seed       # seed the db from the local dev repo
```