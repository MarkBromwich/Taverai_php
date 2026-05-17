# Taverai PHP Port

This folder is the PHP/MySQL migration target for the original Next.js Taverai app.

## Goals

- Keep the frontend app-like where possible.
- Preserve JSON payloads and JSON database fields where they add value.
- Replace Prisma/Postgres with PHP + PDO + MySQL.
- Make deployment practical for shared hosting such as Network Solutions.

## Current First-Pass Scope

- PHP MVC scaffold
- MySQL schema converted from Prisma
- JSON API route structure matching the original app shape
- Session-based authentication instead of Next.js cookie signing

## Recommended Local Steps

1. Copy `config/database.php.example` to `config/database.php`
2. Create the MySQL database and import `sql/mysql_schema.sql`
3. Point MAMP to `taverai/public` or visit `/taverai/public/` from the default MAMP document root
4. Test:
   - `/`
   - `/api/me`
   - `/api/login`
   - `/api/signup`

## Route Mapping

Original Next.js:

- `POST /api/signup`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET|POST|DELETE /api/plans`
- `GET|POST /api/entries`
- `POST /api/coach`

PHP port:

- same JSON route shape, implemented incrementally

## Important Notes

- The current Prisma schema uses Postgres JSON heavily. MySQL JSON columns are preserved here.
- If Network Solutions is on an older MySQL version, JSON columns may need to become `LONGTEXT`.
- OpenAI calls should be ported with PHP `curl` once the core auth/data flows are stable.
