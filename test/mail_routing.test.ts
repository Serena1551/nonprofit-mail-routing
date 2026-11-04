import assert from "node:assert/strict";
import test from "node:test";
import { configureNonprofitMail } from "../src/mail_routing.js";

test("publishes lower MX priority first and reports an existing sending domain", async () => {
  const writes: Array<{ zone_id: string; content: string; priority: number }> = [];
  const client = {
    async getZone() {
      return { zone_id: "zone_nonprofit" };
    },
    async upsertMx(record: { zone_id: string; content: string; priority: number }) {
      writes.push(record);
    },
    async listSendingDomains() {
      return [{ domain: "giving.example", verification: { status: "verified" } }];
    },
  };

  const result = await configureNonprofitMail(client as never, {
    domain: "giving.example",
    mx: [
      { host: "backup.provider.example", priority: 20 },
      { host: "primary.provider.example", priority: 10 },
    ],
    ttl: 3_600,
  });

  assert.deepEqual(writes.map(({ zone_id, content, priority }) => ({ zone_id, content, priority })), [
    { zone_id: "zone_nonprofit", content: "primary.provider.example", priority: 10 },
    { zone_id: "zone_nonprofit", content: "backup.provider.example", priority: 20 },
  ]);
  assert.equal(result.outbound_domain, "configured");
  assert.deepEqual(result.mail_streams, [
    "donor_receipts",
    "volunteer_reminders",
    "campaign_reporting",
  ]);
});
