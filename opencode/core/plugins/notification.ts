import type { Plugin } from "@opencode-ai/plugin";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export default (async ({ project, directory }) => {
  let lastSession = "default";

  const projectName = () => project?.name || path.basename(directory || process.cwd()) || "OpenCode";
  const promptPath = (session: string) => path.join(os.tmpdir(), `opencode-prompt-${session}`);

  const cachePrompt = (session: string, prompt: string) => {
    lastSession = session || "default";
    try {
      fs.writeFileSync(promptPath(lastSession), prompt.slice(0, 80));
    } catch {}
  };

  const notify = (session: string) => {
    try {
      const file = promptPath(session || lastSession);
      const prompt = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "Response done";
      execFile("notify-send", [`OpenCode · ${projectName()}`, prompt], { timeout: 5000 }, () => {});
    } catch {}
  };

  return {
    event: async (input: any) => {
      const event = input?.event || input;
      const type = event?.type || event?.name;
      const session = event?.sessionID || event?.session_id || event?.properties?.sessionID || "default";
      const prompt = event?.message?.content || event?.properties?.message?.content || event?.properties?.prompt;

      if (type?.includes("message") && event?.message?.role === "user" && prompt) cachePrompt(session, String(prompt));
      if (type?.includes("idle") || type?.includes("complete") || type?.includes("stop")) notify(session);
    },
  };
}) satisfies Plugin;
