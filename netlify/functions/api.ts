import serverless from "serverless-http";
import { createServer } from "../../server/index.ts";

export const handler = serverless(createServer());
