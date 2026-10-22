import { appBridge } from "./appBridge";
import { createQuickTodoService } from "../utils/quickTodoService";

export const quickTodoService = createQuickTodoService(
  (command, args) => appBridge.invoke(command, args),
  (event, handler) => appBridge.listen(event, () => handler()),
);
