# Taverai PHP Port Deployment

## Document root

Point the hosting document root at:

`php_port/public`

If your host cannot point directly to `public`, move the contents of `public/` into the host web root and keep `app/`, `config/`, `storage/`, and `sql/` one level above it if possible.

## Required files

- `app/`
- `config/`
- `public/`
- `storage/`

Do not upload `.next/`, `node_modules/`, or the original Next.js source if you are only deploying the PHP port.

## Database

1. Create a MySQL database.
2. Import `sql/mysql_schema.sql`
3. Import `sql/plan_templates_seed.sql`
4. Update `config/database.php`

## OpenAI

Set your OpenAI key so PHP can read it:

- `OPENAI_API_KEY`
- optionally:
  - `OPENAI_MEAL_MODEL`
  - `OPENAI_COACH_MODEL`

If environment variables are not available on the host, place the values in `config/app.php` or load them from a host-specific config include.

## Mail

Password reset uses authenticated SMTP.

Current defaults in `config/app.php` use the Network Solutions/iPower mailbox:

- `SMTP_HOST`: `smtp.ipower.com`
- `SMTP_PORT`: `587`
- `SMTP_ENCRYPTION`: `tls`
- `SMTP_USERNAME`: `no-reply@taverai.com`
- `SMTP_FROM_EMAIL`: `no-reply@taverai.com`

If your host supports environment variables, set `SMTP_PASSWORD` there. Otherwise keep the mailbox password in `config/app.php` before upload.

## Writable paths

Ensure PHP can write to:

- `public/uploads/`

For containers, mount uploads as persistent storage and set:

- `UPLOADS_DIR`
- `UPLOADS_PUBLIC_BASE`

## Localhost vs production

On localhost, password reset responses include a `resetLink` to make testing easier.
On production, users should receive the reset link by email only.

## Rewrite rules

If Apache rewrite is enabled, keep `public/.htaccess`.
If it is not enabled, the app still supports `index.php?path=...` routes.

## Suggested pre-launch checklist

- Confirm signup/login/logout
- Confirm password reset
- Confirm entry create/edit/delete
- Confirm plan creation and score backfill
- Confirm coach response
- Confirm meal photo upload
- Confirm menu planner
- Confirm barcode lookup
- Confirm avatar upload
- Confirm account export
