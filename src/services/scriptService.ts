import { appBridge } from "./appBridge";

export const scriptService = {
  issueConfirmation(content: string) {
    return appBridge.invoke<string>("issue_script_confirmation", { content });
  },
  run(content: string, confirmationToken: string) {
    return appBridge.invoke<string>("run_script", { content, confirmationToken });
  },
};
