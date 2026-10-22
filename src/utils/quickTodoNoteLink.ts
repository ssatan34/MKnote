import { appBridge } from "../services/appBridge";
import { windowService } from "../services/windowService";
import { buildQuickTodoPopoutArgs, type QuickTodoLink, type QuickTodoNoteTarget } from "./quickTodoModel";

export async function openQuickTodoLinkedNote(
  link: QuickTodoLink,
  targets: QuickTodoNoteTarget[],
): Promise<void> {
  const target = targets.find((item) => item.zone === link.zone && item.name === link.name);
  const win = appBridge.window.current();
  const [scale, position] = await Promise.all([win.scaleFactor(), win.outerPosition()]);

  await windowService.openNotePopout(buildQuickTodoPopoutArgs(link, target, {
    x: position.x / scale,
    y: position.y / scale,
  }));
}
