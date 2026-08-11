# One-off emails

Hand-built HTML emails sent through Resend outside the app's normal jobs. These
are not templates the app renders — they are kept here so a send can be
reproduced, corrected, or reused later, since the sending itself happens through
the Resend API and leaves nothing in this repo.

Recurring app email lives elsewhere: the weekly digest is composed in
`src/app/api/jobs/digest/route.ts`, and the login code template is
`supabase/templates/magic_link.html`.

## Sends

| File | To | Sent at | Notes |
|------|----|---------|-------|
| `birthday-mary-2026-08-12.html` | Mary | 2026-08-12 15:30 UTC (17:30 Warsaw) | Timed to the `BOOK_FILE_REVEAL_AT` gate so the email lands as the Kobo file field appears. Plain-text alternative is stored with the send in Resend. |

## House rules for these

- **No images.** Every one of these has to survive images being switched off, so
  colour, shape and emoji do the decorative work. Backgrounds go on both the
  `bgcolor` attribute and the inline style.
- **Assert light mode three ways** — `color-scheme` meta and CSS, a
  `prefers-color-scheme: dark` block that restates every colour, and
  `[data-ogsc]` rules for Outlook.com. Note that none of this stops the Gmail
  mobile app force-inverting a light email; there is no opt-out for that.
- **Always send a plain-text alternative.** Resend requires it alongside HTML,
  and it is what lands when a client refuses the HTML part.
- **Test to a directly-addressed inbox.** A forwarded test misreports Gmail tab
  placement, because the forwarding hop breaks SPF alignment and the receiving
  account re-classifies the message.
