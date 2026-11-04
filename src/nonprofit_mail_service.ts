import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiMailDns, InfraiRequestError } from "./infrai_mail_dns.js";
import { configureNonprofitMail, routingRequestSchema } from "./mail_routing.js";
import type { RoutingRequest } from "./mail_routing.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiMailDns(apiKey);
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/mail-routing") {
    return send(response, 404, { error: "Route not found" });
  }

  try {
    const body = routingRequestSchema.parse(await readJson(request)) as RoutingRequest;
    const result = await configureNonprofitMail(client, body);
    return send(response, 200, result);
  } catch (error) {
    if (error instanceof ZodError) {
      return send(response, 400, { error: "Invalid request", issues: error.issues });
    }
    if (error instanceof InfraiRequestError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.message, code: error.code });
    }
    return send(response, 502, { error: "Mail routing could not be configured" });
  }
}).listen(port, () => {
  console.log(`Nonprofit mail service listening on http://localhost:${port}`);
});

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(
  response: import("node:http").ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
