import { appBridge } from "./appBridge";
import { createQuickPocketService } from "../utils/quickPocketService";

export const quickPocketService = createQuickPocketService(
  (command, args) => appBridge.invoke(command, args),
  (event, handler) => appBridge.listen(event, () => handler()),
);
