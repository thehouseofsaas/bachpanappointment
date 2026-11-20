// Starts a local Postgres for development (data in .pgdata-dev) and keeps it
// running until you press Ctrl+C. No Docker needed.
import { startLocalPg } from "../tests/helpers/pg";

const pg = await startLocalPg({ dir: ".pgdata-dev", port: 54320, fresh: process.argv.includes("--fresh") });
console.log(`Postgres is running. DATABASE_URL=${pg.url}`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
