import "server-only";
import { TbaClient } from "./client";
import { getTbaEnvironment } from "@/lib/server/env";
export function createTbaClient() {
  return new TbaClient(getTbaEnvironment());
}
