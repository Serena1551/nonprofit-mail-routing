import { InfraiMailDns } from "./infrai_mail_dns.js";
import { configureNonprofitMail } from "./mail_routing.js";

const apiKey = process.env.INFRAI_API_KEY;
const domain = process.env.NONPROFIT_DOMAIN;
if (!apiKey || !domain) {
  throw new Error("Set INFRAI_API_KEY and NONPROFIT_DOMAIN");
}

const result = await configureNonprofitMail(new InfraiMailDns(apiKey), {
  domain,
  mx: [
    { host: "mx1.mail-provider.example", priority: 10 },
    { host: "mx2.mail-provider.example", priority: 20 },
  ],
  ttl: 3_600,
});

console.log(JSON.stringify(result, null, 2));
