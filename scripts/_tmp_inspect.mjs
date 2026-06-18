import { readDevVars } from "./migrate.mjs";
const dv = readDevVars(process.cwd());
const url = (process.env.PROD_DATABASE_URL||dv.PROD_DATABASE_URL||"").trim();
if(!url){console.log("none");process.exit(0);}
const u = new URL(url);
console.log("protocol:", u.protocol);
console.log("host:", u.host);
console.log("query params:", [...u.searchParams.keys()].join(", ") || "(none)");
for (const [k,v] of u.searchParams) console.log("  ", k, "=", /cert|pass/i.test(k)? "<redacted len "+v.length+">": v);
