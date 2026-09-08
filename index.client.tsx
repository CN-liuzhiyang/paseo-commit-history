import type { PluginClientContext } from "@getpaseo/plugin/client";
import { HistoryPanel } from "./client/history-panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "history",
    title: "History",
    icon: "History",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: HistoryPanel,
  });
  client.addCommandCenterItem({
    id: "open-history",
    title: "Open commit history",
    icon: "History",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("history");
    },
  });
  return () => {};
}
