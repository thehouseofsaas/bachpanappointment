import { startLocalPg, type LocalPg } from "./pg";

export const TEST_DB_PORT = 54329;
let pg: LocalPg | undefined;

export async function setup() {
  pg = await startLocalPg({ dir: ".pgdata-test", port: TEST_DB_PORT, fresh: true });
  process.env.TEST_DATABASE_URL = pg.url;
}

export async function teardown() {
  await pg?.stop();
}
