import { runPollerLoop } from "./loop";

runPollerLoop().catch((error) => {
  console.error("[poller] fatal", error);
  process.exit(1);
});
