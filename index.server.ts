import type { PluginServerContext } from "@getpaseo/plugin/server";
import { handleListCommitLog } from "./server/list-commit-log";
import { listCommitLog } from "./shared/commit-log";

export default function contribute(server: PluginServerContext) {
  server.handle(listCommitLog, handleListCommitLog);
  return () => {};
}
