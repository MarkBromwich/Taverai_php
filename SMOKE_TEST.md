# Taverai Smoke Test

Run this after deploys, container changes, or database restores.

1. Open `/health` and confirm `ok` is true.
2. Sign up with a new test account.
3. Log out, then log back in with that account.
4. Request a password reset email and confirm the email arrives.
5. Create a text meal entry and confirm AI nutrition is used rather than fallback.
6. Upload a meal photo and confirm the entry is saved.
7. Ask Coach one question and confirm an AI response appears.
8. Open Admin as an admin user and confirm users, logs, and readiness panels load.
9. Export account JSON and food-log CSV from the You page.
10. Import a known-good JSON export into a disposable test account.
11. Confirm uploaded meal/avatar images still load after refresh.
12. Confirm logout redirects back to login.
