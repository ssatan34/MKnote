//! 脚本胶囊：将笔记内容作为 PowerShell 脚本执行（仅 Windows）。
//!
//! 触发条件：笔记首行为 `!p` 或 `!power`（用户显式标记，等价于手动运行 PowerShell）。

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CONFIRMATION_TTL: Duration = Duration::from_secs(60);

struct PendingConfirmation {
    content_hash: String,
    expires_at: Instant,
}

fn pending_confirmations() -> &'static Mutex<HashMap<String, PendingConfirmation>> {
    static PENDING: OnceLock<Mutex<HashMap<String, PendingConfirmation>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn content_hash(content: &str) -> String {
    format!("{:x}", Sha256::digest(content.as_bytes()))
}

fn validate_script_content(content: &str) -> Result<(), String> {
    let mut lines = content.lines();
    let first = lines.next().unwrap_or("").trim();
    if first != "!p" && first != "!power" {
        return Err("笔记首行不是有效的脚本标记（需为 !p 或 !power）".into());
    }
    if lines.all(|line| line.trim().is_empty()) {
        return Err("脚本内容为空".into());
    }
    Ok(())
}

fn script_body(content: &str) -> String {
    let mut lines = content.lines();
    lines.next();
    lines.collect::<Vec<_>>().join("\n")
}

/// 为一次人工确认签发短时、绑定脚本内容的一次性令牌。
#[tauri::command]
pub fn issue_script_confirmation(content: String) -> Result<String, String> {
    validate_script_content(&content)?;
    let nonce = format!(
        "{}:{}:{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "生成脚本确认令牌失败".to_string())?
            .as_nanos(),
        next_confirmation_sequence()
    );
    let token = content_hash(&nonce);
    let mut pending = pending_confirmations()
        .lock()
        .map_err(|_| "脚本确认状态不可用".to_string())?;
    pending.retain(|_, confirmation| confirmation.expires_at > Instant::now());
    pending.insert(
        token.clone(),
        PendingConfirmation {
            content_hash: content_hash(&content),
            expires_at: Instant::now() + CONFIRMATION_TTL,
        },
    );
    Ok(token)
}

fn next_confirmation_sequence() -> u64 {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    SEQUENCE.fetch_add(1, Ordering::Relaxed)
}

fn consume_script_confirmation(content: &str, token: &str) -> Result<(), String> {
    let mut pending = pending_confirmations()
        .lock()
        .map_err(|_| "脚本确认状态不可用".to_string())?;
    let confirmation = pending
        .remove(token)
        .ok_or_else(|| "脚本确认令牌无效或已使用".to_string())?;
    if confirmation.expires_at <= Instant::now() {
        return Err("脚本确认令牌已过期".into());
    }
    if confirmation.content_hash != content_hash(content) {
        return Err("脚本内容已变化，请重新确认".into());
    }
    Ok(())
}

/// 执行脚本胶囊。
///
/// `content` 为完整笔记内容，首行必须是 `!p` 或 `!power`；
/// 脚本正文为去掉首行后的剩余部分。
/// 执行超时 30 秒。
#[tauri::command]
pub async fn run_script(content: String, confirmation_token: String) -> Result<String, String> {
    consume_script_confirmation(&content, &confirmation_token)?;
    tauri::async_runtime::spawn_blocking(move || execute_script(&content))
        .await
        .map_err(|e| format!("任务调度失败：{e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_execution_requires_one_time_confirmation() {
        let content = "!p\nWrite-Output test";
        let token = issue_script_confirmation(content.into()).expect("issue token");
        assert!(consume_script_confirmation(content, &token).is_ok());
        assert_eq!(
            consume_script_confirmation(content, &token),
            Err("脚本确认令牌无效或已使用".into())
        );
    }

    #[test]
    fn script_confirmation_is_bound_to_exact_content() {
        let token = issue_script_confirmation("!p\nWrite-Output test".into()).expect("issue token");
        assert_eq!(
            consume_script_confirmation("!p\nWrite-Output changed", &token),
            Err("脚本内容已变化，请重新确认".into())
        );
        // 内容不匹配的尝试也消耗令牌，避免令牌被再次试探。
        assert_eq!(
            consume_script_confirmation("!p\nWrite-Output test", &token),
            Err("脚本确认令牌无效或已使用".into())
        );
    }

    #[test]
    fn script_body_excludes_execution_marker() {
        assert_eq!(script_body("!p\nWrite-Output test\n"), "Write-Output test");
        assert_eq!(script_body("!power\nWrite-Output test"), "Write-Output test");
    }

    #[cfg(windows)]
    #[test]
    fn large_script_output_does_not_deadlock_piped_process() {
        let result = execute_script("!p\n1..50000 | ForEach-Object { 'output-line' }")
            .expect("PowerShell should finish while output pipes are drained");
        assert!(result.lines().count() >= 50_000);
    }

    #[cfg(windows)]
    #[test]
    fn concurrent_temp_script_creation_uses_distinct_files() {
        let first = create_temp_script_file(b"first").expect("create first temp script");
        let second = create_temp_script_file(b"second").expect("create second temp script");
        assert_ne!(first, second);
        assert_eq!(std::fs::read(&first).unwrap(), b"first");
        assert_eq!(std::fs::read(&second).unwrap(), b"second");
        let _ = std::fs::remove_file(first);
        let _ = std::fs::remove_file(second);
    }
}

fn execute_script(content: &str) -> Result<String, String> {
    validate_script_content(content)?;
    // 提取首行标记，跳过第一行，取剩余内容作为脚本正文
    let script_body = script_body(content);

    #[cfg(windows)]
    {
        use std::time::Duration;

        // UTF-8 BOM（EF BB BF）让 PowerShell 5.x 正确识别编码
        let mut file_content = vec![0xEFu8, 0xBBu8, 0xBFu8];
        file_content.extend_from_slice(script_body.as_bytes());
        // 使用 create_new 原子创建，避免并发执行在同一时间戳下互相覆盖临时脚本。
        let tmp_path = create_temp_script_file(&file_content)?;

        // 优先用 pwsh（PowerShell 7，默认 UTF-8），回退到 powershell（5.x）
        let ps_exe = if crate::process_utils::hidden_command("pwsh")
            .arg("-Version")
            .output()
            .is_ok()
        {
            "pwsh"
        } else {
            "powershell"
        };

        let mut child = crate::process_utils::hidden_command(ps_exe)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(&tmp_path)
            // 设置控制台代码页为 UTF-8，影响子进程输出
            .env("PYTHONIOENCODING", "utf-8") // 无害，仅对 Python 生效
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                let _ = std::fs::remove_file(&tmp_path);
                format!("启动 PowerShell 失败：{e}")
            })?;

        // 必须在轮询子进程的同时持续消费两个管道，否则大输出会填满
        // Windows 管道缓冲区，使 PowerShell 永远无法退出。
        use std::io::Read;
        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                let _ = std::fs::remove_file(&tmp_path);
                return Err("无法获取 PowerShell 标准输出管道".into());
            }
        };
        let stderr = match child.stderr.take() {
            Some(stderr) => stderr,
            None => {
                terminate_process_tree(&mut child);
                let _ = child.wait();
                let _ = std::fs::remove_file(&tmp_path);
                return Err("无法获取 PowerShell 标准错误管道".into());
            }
        };
        let stdout_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let result = std::io::BufReader::new(stdout).read_to_end(&mut bytes);
            (result, bytes)
        });
        let stderr_reader = std::thread::spawn(move || {
            let mut bytes = Vec::new();
            let result = std::io::BufReader::new(stderr).read_to_end(&mut bytes);
            (result, bytes)
        });

        let deadline = std::time::Instant::now() + Duration::from_secs(30);

        // 轮询等待进程结束，超时后强制终止
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let _ = child.wait();
                    let (stdout_result, stdout) = stdout_reader
                        .join()
                        .map_err(|_| "读取 PowerShell 标准输出失败".to_string())?;
                    stdout_result
                        .map_err(|error| format!("读取 PowerShell 标准输出失败：{error}"))?;
                    let (stderr_result, stderr) = stderr_reader
                        .join()
                        .map_err(|_| "读取 PowerShell 标准错误失败".to_string())?;
                    stderr_result
                        .map_err(|error| format!("读取 PowerShell 标准错误失败：{error}"))?;
                    let _ = std::fs::remove_file(&tmp_path);
                    // pwsh 输出 UTF-8，powershell 5.x 输出可能是 UTF-8 BOM 或 GBK
                    // 先尝试 UTF-8，失败时用 lossy 兜底
                    let decode = |bytes: &[u8]| -> String {
                        // 去掉可能存在的 UTF-8 BOM
                        let b = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
                            &bytes[3..]
                        } else {
                            bytes
                        };
                        String::from_utf8(b.to_vec())
                            .unwrap_or_else(|_| String::from_utf8_lossy(b).into_owned())
                    };
                    let stdout = decode(&stdout).trim_end().to_string();
                    let stderr = decode(&stderr).trim_end().to_string();
                    if status.success() {
                        return Ok(if stdout.is_empty() {
                            "（无输出）".into()
                        } else {
                            stdout
                        });
                    } else {
                        return Err(if stderr.is_empty() { stdout } else { stderr });
                    }
                }
                Ok(None) => {
                    if std::time::Instant::now() >= deadline {
                        terminate_process_tree(&mut child);
                        let _ = child.wait();
                        let _ = stdout_reader.join();
                        let _ = stderr_reader.join();
                        let _ = std::fs::remove_file(&tmp_path);
                        return Err("脚本执行超时（30 秒）".into());
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                Err(error) => {
                    terminate_process_tree(&mut child);
                    let _ = child.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    let _ = std::fs::remove_file(&tmp_path);
                    return Err(format!("等待 PowerShell 失败：{error}"));
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        Err("脚本胶囊仅支持 Windows 平台".into())
    }
}

#[cfg(windows)]
fn create_temp_script_file(contents: &[u8]) -> Result<std::path::PathBuf, String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "生成临时脚本文件名失败".to_string())?
        .as_nanos();
    for _ in 0..16 {
        let sequence = next_confirmation_sequence();
        let path = std::env::temp_dir().join(format!(
            "mknote_script_{}_{}_{}.ps1",
            std::process::id(), timestamp, sequence
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut file) => {
                if let Err(error) = file.write_all(contents) {
                    let _ = std::fs::remove_file(&path);
                    return Err(format!("写入临时脚本失败：{error}"));
                }
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建临时脚本失败：{error}")),
        }
    }
    Err("创建临时脚本失败：文件名连续冲突".into())
}

#[cfg(windows)]
fn terminate_process_tree(child: &mut std::process::Child) {
    // PowerShell 可以启动独立子进程；只 kill 外层 shell 会留下后台进程，
    // 也可能让 stdout/stderr 管道保持打开，导致清理线程无法结束。
    let pid = child.id().to_string();
    let _ = crate::process_utils::hidden_command(r"C:\Windows\System32\taskkill.exe")
        .args(["/PID", &pid, "/T", "/F"])
        .output();
    let _ = child.kill();
}
