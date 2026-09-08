import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { listCommitLog } from "../shared/commit-log";
import { listCommitLogPage } from "./commit-log";

/**
 * Resolves the workspace directory on the daemon rather than trusting one from
 * the client, then reads one page of history from it.
 */
export async function handleListCommitLog(
  input: RpcInput<typeof listCommitLog>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof listCommitLog>> {
  const workspace = await paseo.workspaces.ref(input.workspaceId).refresh();
  const cwd = workspace?.workspaceDirectory;
  if (!cwd) {
    throw new Error(`Workspace ${input.workspaceId} has no directory on this host`);
  }
  return listCommitLogPage({
    cwd,
    scope: input.scope,
    limit: input.limit,
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  });
}
