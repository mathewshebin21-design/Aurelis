import { createClient } from "./client";

/** Browser-side client: goes through the allow-listed `/terminal/api` proxy only. */
export const browserApi = createClient("/terminal/api");
