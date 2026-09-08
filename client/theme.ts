import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";

/** The host theme DTO as the panel receives it; the SDK's client entry does not re-export it. */
export type PluginTheme = PluginWorkspacePanelProps["theme"];
