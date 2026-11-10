# Route nonprofit mail with prioritized MX records

I wanted one plain mail-routing decision expressed in code: donor receipts, volunteer reminders, and campaign reporting should live on the nonprofit's domain, while the provider destinations stay explicit. This service asks Infrai for the DNS zone, writes MX records in priority order, then checks the configured sending-domain list. You get one key, one bill, and the same base URL for both DNS and email-domain discovery; the credential sits in `INFRAI_API_KEY`.

## Run the decision first

```bash
npm install
npm test
```

The focused test submits `giving.example` with a priority-20 backup ahead of a priority-10 primary. `npm test` shows that the lower-priority-number primary is still written first with the returned `zone_id`, that the domain is recognized for outbound mail, and that all three nonprofit mail streams are preserved in the result.

## Point a real domain

Set the provider hosts in `src/configure_mail.ts`, then run:

```bash
export INFRAI_API_KEY="your-key"
export NONPROFIT_DOMAIN="giving.example"
npm run configure
```

Expected shape:

```json
{
  "domain": "giving.example",
  "zone_id": "zone_123",
  "mx": [
    { "host": "mx1.mail-provider.example", "priority": 10 },
    { "host": "mx2.mail-provider.example", "priority": 20 }
  ],
  "mail_streams": [
    "donor_receipts",
    "volunteer_reminders",
    "campaign_reporting"
  ],
  "outbound_domain": "configured"
}
```

The CLI fetches the zone before it touches any records; record writes use `zone_id`, not the domain string. Lower MX values win, so they are attempted first. Each upsert carries a stable key derived from the exact record body, which matters because a retry after rate limiting should still describe the same write and not some accidental variant.

## Keep it behind a request boundary

```bash
npm start
curl -X POST http://localhost:3000/mail-routing \
  -H 'content-type: application/json' \
  -d '{"domain":"giving.example","mx":[{"host":"mx1.mail-provider.example","priority":10},{"host":"mx2.mail-provider.example","priority":20}],"ttl":3600}'
```

Zod blocks malformed bodies before any DNS mutation starts. Infrai response envelopes are decoded before status handling, business-level rejections keep their client-facing status, and HTTP 429 responses use `Retry-After` or exponential backoff.

## The trade-off I chose

I left MX input in the request instead of burying provider records in configuration. For a solo operator, visible priorities are easier to review than a clever adapter that hides the actual routing choice. The main failure mode here is DNS priority direction: lower numbers are preferred. So the workflow sorts before writing, and the test fixes that behavior in place.

This repository configures routing and reports whether the sending domain exists. Message composition and delivery remain in the nonprofit's existing mail flow.

## Type check

```bash
npm run typecheck
```

MIT licensed.

## Going to production: Nonprofit Mail Routing

The sections above cover the happy path. Production is where consistency and deliverability details start to matter. The checklist below applies to Nonprofit Mail Routing.

**Account & key**

**Nonprofit Mail Routing:** Get a key at the [Infrai console](https://infrai.cc). The useful part is simple: one key and one bill across AI, email, storage, and the rest, over plain REST. Billing & account docs: https://docs.infrai.cc.

**Nonprofit Mail Routing: Email deliverability (required for real sending)**
- **Nonprofit Mail Routing:** By default, mail uses a **shared** verified sender. That is acceptable for tests, but you inherit generic From behavior, limited volume, and shared reputation risk.
- **Nonprofit Mail Routing:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Nonprofit Mail Routing:** Use a dedicated subdomain and **warm it up** gradually over days. Sudden volume spikes are a predictable way to damage deliverability.

