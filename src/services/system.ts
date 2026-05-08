import { invoke } from "@tauri-apps/api/core";

export async function copyToClipboard(text: string): Promise<void> {
  return invoke("copy_to_clipboard", { text });
}

export async function openUrlSafe(url: string): Promise<void> {
  return invoke("open_url_safe", { url });
}

export async function openInFileManager(path: string): Promise<void> {
  return invoke("open_in_file_manager", { path });
}

export async function restartApp(): Promise<void> {
  return invoke("restart_app");
}
