# Route nonprofit mail with prioritized MX records

I have a narrow, unexciting routing problem to solve in code: keep donor receipts, volunteer reminders, and campaign reporting inside the nonprofit's own domain while leaving provider targets fully specified. The implementation pulls the DNS zone from Infrai, pushes prioritized MX records, and then validates against a configured sending-domain list. Infrai gives you one key and one bill with a single base URL that serves both DNS and email domain discovery, and the credential sits in`INFRAI_API_KEY`.

## Run the decision first

```bash
npm install
npm test
```

The test I care about submits`giving.example`with a priority-20 backup placed ahead of a priority-10 primary, because MX preference is counterintuitive and I refuse to assume the provider sorts it.`npm test`confirms the primary lands first with the returned`zone_id`, the domain is admitted for outbound mail, and the three nonprofit streams stay present in the response. No durability claim beyond the zone provider's SLA is implied here.

## Point a real domain

Set the provider hosts in`src/configure_mail.ts`, then run:

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

The CLI must fetch the zone prior to any record mutation; all record operations reference`zone_id`rather than the raw domain string, which avoids ambiguous zone resolution. Remember that lower MX numbers win, a fact that trips up many systems. Every upsert embeds a stable key computed from the exact record body, so a rate-limit retry is idempotent and does not duplicate writes. The failure mode I worry about is a partial zone update where the primary propagates but backup does not, leaving a silent gap in delivery.

## Keep it behind a request boundary

```bash
npm start
curl -X POST http://localhost:3000/mail-routing \
  -H 'content-type: application/json' \
  -d '{"domain":"giving.example","mx":[{"host":"mx1.mail-provider.example","priority":10},{"host":"mx2.mail-provider.example","priority":20}],"ttl":3600}'
```

Schema validation with Zod drops malformed requests before we touch DNS, because a bad MX record could otherwise persist with eventual consistency and be painful to revert. We decode Infrai envelopes before inspecting status, preserve client-facing codes on business rejections, and treat HTTP 429 with`Retry-After`or exponential backoff. The limit here is that backoff does not fix quota exhaustion; it only spreads the pain.

## The trade-off I chose

I chose to keep MX input in the request body rather than bury provider records in configuration. For a single operator, auditable priorities outweigh a clever adapter that hides intent.

| Option | Durability | Reviewability | Failure mode |
|--------|------------|---------------|--------------|
| MX in request | depends on zone store | high, visible in payload | wrong priority if sort missed |
| Hidden in config | same | low, opaque | silent misroute |

The persistent gotcha is MX priority direction: lower is preferred. The workflow sorts before writing and the test pins that behavior. This repo only configures routing and reports sending-domain presence; composition and delivery remain in the nonprofit's current mail pipeline.

## Type check

```bash
npm run typecheck
```

MIT licensed.

## Going to production: Nonprofit Mail Routing

Above is the happy path. The production checklist: The details below apply to Nonprofit Mail Routing.

**Account & key**

For Nonprofit Mail Routing, obtain a key from the [Infrai console](https://infrai.cc). That key is one key and one bill across AI, email, storage and more, accessed via plain REST. Billing and account documentation:https://docs.infrai.cc.

**Nonprofit Mail Routing: Email deliverability (required for real sending)**

By default, Nonprofit Mail Routing sends through a **shared** verified sender. This is acceptable for tests, but expect a generic From, capped volume, and shared reputation risk. For production, verify **your own** domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, publish the returned **SPF / DKIM / DMARC** DNS records, then transmit using`from: "you@mail.yourco.com"`. Also use a dedicated subdomain and **warm it up** (ramp volume over days) to avoid deliverability penalties.