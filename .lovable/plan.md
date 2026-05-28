## Plan: Seed user account

Create a confirmed auth user in Lovable Cloud so you can sign in immediately.

### What I'll do
- Insert a user into `auth.users` with:
  - Email: `allan@virgilio.tech`
  - Password: `Qzpl1233` (bcrypt-hashed via `crypt()`)
  - `email_confirmed_at` set to now (skip verification)
- The existing `handle_new_user` trigger will auto-create the matching `public.profiles` row.

### How
Single SQL migration using `pgcrypto`'s `crypt(..., gen_salt('bf'))` to insert directly into `auth.users` with the required identity record in `auth.identities`.

### After
You can go to `/login` and sign in with those credentials.