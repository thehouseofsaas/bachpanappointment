# PTM Booking

Parents book a slot with their child's class teacher for the monthly parent-teacher meeting (PTM).
Built for Bachpan Play School, Rajpura; the school's name, logo and contact are settings, not code.

- **Parents** open a link, type their mobile number, see only their own children, and tap a time. No password, no app.
- **The office** uploads class lists, creates a meeting (date, time window, slot length), publishes it, and watches who has booked.
- **Teachers** get a private link showing their own slot list, and mark who came.

## How it protects bookings

| Rule | Where it is enforced |
|---|---|
| One booking per slot | Unique index in Postgres (`bookings_one_per_slot`) |
| One slot per child per teacher per meeting | Unique index (`bookings_one_per_child`) |
| A teacher is never in two places at once | Exclusion constraint on slot times (`slots_no_overlap`) |
| Booking window, pause, cut-offs, "is this your child?" | Checked on the server inside the booking transaction, using the database clock |

The schema is in `drizzle/0001_init.sql`. All booking writes go through `src/domain/booking.ts`.

## Run it on your computer

Needs Node 22 and pnpm. No Docker and no separate Postgres install: a local Postgres is downloaded as an npm package.

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Start the local database (leave it running in its own terminal):

```bash
pnpm db:dev
```

Load demo data (admin `office` / `ptm-demo-2026`, parent number `98765 43210`):

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Open http://localhost:3000 for parents, http://localhost:3000/admin for the office, and
http://localhost:3000/styleguide for the look-and-feel reference.

## Tests

```bash
pnpm test
```

Unit and integration tests on a real Postgres: schema rules, 50 parents racing for one slot, meeting changes, roster uploads, colour contrast.

```bash
pnpm test:e2e
```

Browser tests on a phone-sized screen against a production build with its own throwaway database.

```bash
pnpm typecheck
```

```bash
pnpm lint
```

## Put it online (Vercel + Neon)

1. Create a Postgres database at Neon (region: Singapore). Copy the **pooled** connection string.
2. Import this repository into Vercel. Set these environment variables:
   - `DATABASE_URL` – the pooled connection string
   - `SESSION_SECRET` – a long random string (`openssl rand -base64 48`). Changing it signs everyone out and replaces every teacher link.
   - `SETUP_TOKEN` – any private phrase; needed once to create the first admin
3. Set the Vercel **Build Command** to `pnpm db:migrate && pnpm build` so the database is updated on every deploy.
4. Open `/admin/setup`, enter the setup phrase and create the owner account. The page stops working once an admin exists.

Vercel's free Hobby plan is for non-commercial use; a school will normally need the Pro plan.
The same code runs on a small server with Docker instead: see `Dockerfile` (run `pnpm db:migrate` against the database before starting a new version).

Forgotten the owner password? With `DATABASE_URL` set in `.env.local`:

```bash
pnpm admin:create office "a-new-long-password"
```

## The monthly routine

1. **Students → Upload roster** when class lists change. The file is the truth only for the classes it contains; a preview shows every change before anything is saved.
2. **Meetings → New meeting.** Save as draft, check each teacher's slots and the capacity warnings, then **Publish**.
3. Copy the parent link and message from the meeting page into the class WhatsApp groups.
4. Watch **Not booked yet**; each parent has a WhatsApp reminder button. Book for parents who phone the office.
5. Send each teacher their private schedule link (meeting page → Teacher tools), or print the sheets.
6. If plans change: block a slot, change a teacher's timings, hand a session to a substitute, postpone, or cancel. Anything that would cancel a parent's booking shows exactly who is affected and asks first.

## Phones, tablets and computers

- Every page, including the office console, is laid out for phones first and checked automatically on 11 screen sizes: from a folded Galaxy Fold (280 px) and small iPhones up to tablets, laptops and large desktops, plus phones held sideways and 130% system text.
- Text fields stay visible above the on-screen keyboard (with their button, on the sign-in forms). On Android the page shrinks for the keyboard; on iPhone the page scrolls the field into view.
- Form fields use 16 px text so iPhones don't zoom in when you tap them; pinch-zoom is never disabled.
- Notched phones are handled (content stays clear of the camera cut-out and rounded corners).
- On a phone the office console has a single Menu button instead of tabs, tables turn into one card per row, and each teacher's free times are a grid of tappable times.

## Good to know

- **Sign-in is by phone number only.** Everyone in a class WhatsApp group can see everyone's number, so a parent could open another family's booking. Parents only ever see a first name, class, teacher and time; each child's booking can be changed three times; the card shows which number last changed it; the office can lock a booking; everything is in the activity log. For a second check, turn on *Settings → ask for the admission number*.
- **Nothing is sent automatically.** Parents share their confirmation to WhatsApp themselves; the office sends reminders with the buttons provided.
- **All times are India time**, whatever the phone's clock says.
- **Children's data:** the app stores a name, class, admission number and parent phone numbers, and nothing else. *Settings → Year-end tools* downloads everything and clears old data.

## Where things are

```
drizzle/                 SQL migrations (constraints written by hand)
src/domain/              booking, meetings, slot grid, roster import, read models
src/app/(parent)/        parent pages and actions
src/app/t/[link]/        teacher schedule page
src/app/admin/           office console
src/components/art/      original illustrations (inline SVG)
src/theme/               colour tokens, fonts, class colours and badges
src/lib/strings.ts       all parent-facing wording
tests/                   db, domain, import and browser tests
```
