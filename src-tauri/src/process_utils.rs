use std::ffi::OsStr;
use std::process::Command;

/// 创建后台子进程命令。Windows GUI 应用若直接启动控制台程序，系统会短暂创建
/// conhost 窗口；统一使用 CREATE_NO_WINDOW，避免启动、同步和 YASB 入口闪出黑框。
pub(crate) fn hidden_command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    #[test]
    fn hidden_command_preserves_captured_output() {
        let output = super::hidden_command(r"C:\Windows\System32\whoami.exe")
            .output()
            .expect("hidden command should start");
        assert!(output.status.success());
        assert!(!output.stdout.is_empty());
    }
}
