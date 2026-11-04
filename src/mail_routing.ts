import { z } from "zod";
import type { InfraiMailDns, SendingDomain } from "./infrai_mail_dns.js";

type MxRecord = { host: string; priority: number };

export type RoutingRequest = {
  domain: string;
  mx: MxRecord[];
  ttl: number;
};

export const routingRequestSchema = z.object({
  domain: z.string().min(1).regex(/^[a-z0-9.-]+$/i),
  mx: z.array(z.object({
    host: z.string().min(1),
    priority: z.number().int().min(0).max(65_535),
  })).min(1),
  ttl: z.number().int().min(60).max(86_400).default(3_600),
});

export const nonprofitMailStreams = [
  "donor_receipts",
  "volunteer_reminders",
  "campaign_reporting",
] as const;

export type RoutingResult = {
  domain: string;
  zone_id: string;
  mx: Array<{ host: string; priority: number }>;
  mail_streams: typeof nonprofitMailStreams;
  outbound_domain: "configured" | "not_configured";
};

export async function configureNonprofitMail(
  client: Pick<InfraiMailDns, "getZone" | "upsertMx" | "listSendingDomains">,
  input: RoutingRequest,
): Promise<RoutingResult> {
  const request = routingRequestSchema.parse(input) as RoutingRequest;
  const zone = await client.getZone(request.domain);

  for (const record of orderMxRecords(request.mx)) {
    await client.upsertMx({
      zone_id: zone.zone_id,
      name: "@",
      content: record.host,
      priority: record.priority,
      ttl: request.ttl,
    });
  }

  const sendingDomains = await client.listSendingDomains();
  return {
    domain: request.domain,
    zone_id: zone.zone_id,
    mx: orderMxRecords(request.mx),
    mail_streams: nonprofitMailStreams,
    outbound_domain: hasDomain(sendingDomains, request.domain)
      ? "configured"
      : "not_configured",
  };
}

export function orderMxRecords(
  records: RoutingRequest["mx"],
): RoutingRequest["mx"] {
  return [...records].sort(
    (left, right) => left.priority - right.priority || left.host.localeCompare(right.host),
  );
}

function hasDomain(domains: SendingDomain[], domain: string): boolean {
  return domains.some((entry) => entry.domain.toLowerCase() === domain.toLowerCase());
}
