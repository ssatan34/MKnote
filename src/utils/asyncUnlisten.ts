export type AsyncUnlisten = () => void | Promise<void>;

function invokeUnlisten(unlisten: AsyncUnlisten): void {
  try {
    void Promise.resolve(unlisten()).catch(() => undefined);
  } catch {
    // 窗口销毁后 Tauri 可能拒绝注销已不存在的监听；清理不能反向制造运行时错误。
  }
}

/**
 * 将异步监听注册绑定到 React effect 的同步清理生命周期。
 *
 * 注册 Promise 可能在 effect 已卸载后才完成；此时必须立即注销刚注册的监听，
 * 并保证重复 cleanup 不会对 Tauri 的 unlisten 函数调用两次。
 */
export function createAsyncUnlistenCleanup(
  registration: Promise<AsyncUnlisten>,
): () => void {
  let disposed = false;
  let unlisten: AsyncUnlisten | undefined;

  void registration
    .then((registeredUnlisten) => {
      if (disposed) {
        invokeUnlisten(registeredUnlisten);
        return;
      }
      unlisten = registeredUnlisten;
    })
    .catch(() => undefined);

  return () => {
    if (disposed) return;
    disposed = true;
    const registeredUnlisten = unlisten;
    unlisten = undefined;
    if (registeredUnlisten) invokeUnlisten(registeredUnlisten);
  };
}
