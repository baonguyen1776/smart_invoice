use serde::Serialize;
use std::{
    io::Read,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PrinterCheck {
    NoReportedError,
    NoPrinters,
    PrinterOffline,
    PrinterPaused,
    PrinterUnavailable,
    #[serde(rename = "printer_check_failed")]
    CheckFailed,
}

#[tauri::command]
pub async fn check_printers() -> PrinterCheck {
    tauri::async_runtime::spawn_blocking(inspect_printers)
        .await
        .unwrap_or(PrinterCheck::CheckFailed)
}

// This inspects configured queues, not physical output. A healthy alternative
// must remain selectable in the OS dialog even when another queue is offline.
fn summarize(states: &[PrinterCheck]) -> PrinterCheck {
    use PrinterCheck::*;
    if states.is_empty() {
        NoPrinters
    } else if states.contains(&NoReportedError) {
        NoReportedError
    } else if states.contains(&CheckFailed) {
        CheckFailed
    } else if states.iter().all(|state| *state == PrinterOffline) {
        PrinterOffline
    } else if states.iter().all(|state| *state == PrinterPaused) {
        PrinterPaused
    } else {
        PrinterUnavailable
    }
}

struct ProbeOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

// Bound the wait and drain both pipes so a stalled spooler cannot hang the UI.
fn probe(command: &mut Command, timeout: Duration) -> Result<ProbeOutput, ()> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| ())?;
    let stdout = child.stdout.take().ok_or(())?;
    let stderr = child.stderr.take().ok_or(())?;
    fn read_output(stream: impl Read) -> Result<String, ()> {
        let mut data = Vec::new();
        stream
            .take(1_048_577)
            .read_to_end(&mut data)
            .map_err(|_| ())?;
        if data.len() > 1_048_576 {
            return Err(());
        }
        String::from_utf8(data).map_err(|_| ())
    }
    let out_reader = thread::spawn(move || read_output(stdout));
    let err_reader = thread::spawn(move || read_output(stderr));
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < timeout => thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(());
            }
        }
    };
    Ok(ProbeOutput {
        success: status.success(),
        stdout: out_reader.join().map_err(|_| ())??,
        stderr: err_reader.join().map_err(|_| ())??,
    })
}

#[cfg(target_os = "macos")]
fn inspect_printers() -> PrinterCheck {
    let mut command = Command::new("/usr/bin/lpstat");
    command
        .args(["-p", "-l"])
        .env("LC_ALL", "C")
        .env("LANG", "C");
    match probe(&mut command, Duration::from_secs(8)) {
        Ok(output) => parse_cups(&output),
        Err(()) => PrinterCheck::CheckFailed,
    }
}

#[cfg(any(target_os = "macos", test))]
fn parse_cups(output: &ProbeOutput) -> PrinterCheck {
    use PrinterCheck::*;
    if !output.success {
        return if output.stdout.trim().is_empty()
            && output.stderr.trim() == "lpstat: No destinations added."
        {
            NoPrinters
        } else {
            CheckFailed
        };
    }
    let mut states = Vec::new();
    let mut current = None;
    for line in output.stdout.lines() {
        if let Some(header) = line.strip_prefix("printer ") {
            if let Some(state) = current.take() {
                states.push(state);
            }
            // Skip the queue name so names containing status words are harmless.
            let status = header
                .split_once(' ')
                .map(|(_, status)| status)
                .unwrap_or("");
            current = Some(if status.starts_with("disabled since ") {
                PrinterPaused
            } else if status.starts_with("is idle.") || status.starts_with("now printing ") {
                NoReportedError
            } else {
                CheckFailed
            });
        } else if let (Some(state), Some(alerts)) =
            (current.as_mut(), line.trim().strip_prefix("Alerts:"))
        {
            let reasons: Vec<_> = alerts.split_whitespace().collect();
            if reasons.iter().any(|reason| {
                reason.starts_with("offline-report")
                    || reason.starts_with("shutdown")
                    || reason.starts_with("timed-out")
            }) {
                *state = PrinterOffline;
            } else if reasons.iter().any(|reason| {
                reason.ends_with("-error")
                    || matches!(
                        *reason,
                        "media-empty"
                            | "media-jam"
                            | "door-open"
                            | "toner-empty"
                            | "spool-area-full"
                            | "cups-missing-filter"
                    )
            }) {
                *state = PrinterUnavailable;
            }
        }
    }
    if let Some(state) = current {
        states.push(state);
    }
    if states.is_empty() && !output.stdout.trim().is_empty() {
        return CheckFailed;
    }
    summarize(&states)
}

#[cfg(target_os = "windows")]
fn inspect_printers() -> PrinterCheck {
    use std::os::windows::process::CommandExt;
    // Static, read-only script: no invoice data or user strings enter the shell.
    // Emit numeric properties, independent of Windows language and printer names.
    let script = r#"$ErrorActionPreference = 'Stop'
try {
  Get-CimInstance -ClassName Win32_Printer -OperationTimeoutSec 5 | ForEach-Object {
    '{0},{1},{2},{3}' -f [int]$_.WorkOffline, [int]$_.PrinterStatus, [int]$_.ExtendedPrinterStatus, [int]$_.DetectedErrorState
  }
} catch { exit 1 }
"#;
    let mut command = Command::new("powershell.exe");
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
    ]);
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    match probe(&mut command, Duration::from_secs(8)) {
        Ok(output) if output.success => parse_windows(&output.stdout),
        _ => PrinterCheck::CheckFailed,
    }
}

#[cfg(any(target_os = "windows", test))]
fn parse_windows(output: &str) -> PrinterCheck {
    use PrinterCheck::*;
    let mut states = Vec::new();
    for line in output.lines().filter(|line| !line.trim().is_empty()) {
        let values: Result<Vec<u32>, _> = line.trim().split(',').map(str::parse).collect();
        let Ok(values) = values else {
            return CheckFailed;
        };
        let [offline, status, extended, error] = values.as_slice() else {
            return CheckFailed;
        };
        states.push(
            if *offline == 1 || *status == 7 || *extended == 7 || *error == 9 {
                PrinterOffline
            } else if *extended == 8 {
                PrinterPaused
            } else if *status == 6
                || matches!(*extended, 6 | 9 | 11 | 16)
                || matches!(*error, 4 | 6..=8 | 10 | 11)
            {
                PrinterUnavailable
            } else if matches!(*status, 3..=5)
                || matches!(*extended, 3..=5 | 10 | 12..=15 | 17 | 18)
            {
                NoReportedError
            } else {
                CheckFailed
            },
        );
    }
    summarize(&states)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn inspect_printers() -> PrinterCheck {
    PrinterCheck::CheckFailed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "read-only OS printer inspection; requires access to the host print service"]
    fn native_inspection_smoke() {
        let result = inspect_printers();
        println!("OS printer inspection: {result:?}");
        assert_ne!(result, PrinterCheck::CheckFailed);
    }

    fn cups(success: bool, stdout: &str, stderr: &str) -> PrinterCheck {
        parse_cups(&ProbeOutput {
            success,
            stdout: stdout.into(),
            stderr: stderr.into(),
        })
    }

    #[test]
    fn cups_distinguishes_no_printers_from_unreadable_service() {
        assert_eq!(
            cups(false, "", "lpstat: No destinations added.\n"),
            PrinterCheck::NoPrinters
        );
        assert_eq!(
            cups(false, "", "lpstat: Bad file descriptor\n"),
            PrinterCheck::CheckFailed
        );
        assert_eq!(
            cups(true, "unexpected format", ""),
            PrinterCheck::CheckFailed
        );
    }

    #[test]
    fn cups_reports_offline_paused_and_paper_errors() {
        assert_eq!(
            cups(
                true,
                "printer Canon disabled since today -\n\tAlerts: offline-report\n",
                ""
            ),
            PrinterCheck::PrinterOffline
        );
        assert_eq!(
            cups(
                true,
                "printer Canon disabled since today -\n\tAlerts: paused\n",
                ""
            ),
            PrinterCheck::PrinterPaused
        );
        assert_eq!(
            cups(
                true,
                "printer Canon is idle. enabled since today\n\tAlerts: media-empty-error\n",
                ""
            ),
            PrinterCheck::PrinterUnavailable
        );
    }

    #[test]
    fn cups_ignores_names_and_descriptions_when_classifying_status() {
        assert_eq!(cups(true, "printer offline-report is idle. enabled since today\n\tDescription: paused offline-report\n\tAlerts: none\n", ""), PrinterCheck::NoReportedError);
    }

    #[test]
    fn an_offline_queue_does_not_block_another_usable_queue() {
        assert_eq!(cups(true, "printer Canon disabled since today -\n\tAlerts: offline-report\nprinter Brother is idle. enabled since today\n", ""), PrinterCheck::NoReportedError);
        assert_eq!(
            parse_windows("1,7,7,9\r\n0,3,3,2\r\n"),
            PrinterCheck::NoReportedError
        );
    }

    #[test]
    fn windows_handles_missing_offline_paused_faulted_and_unknown_printers() {
        assert_eq!(parse_windows(""), PrinterCheck::NoPrinters);
        assert_eq!(parse_windows("1,3,3,2"), PrinterCheck::PrinterOffline);
        assert_eq!(parse_windows("0,7,7,2"), PrinterCheck::PrinterOffline);
        assert_eq!(parse_windows("0,3,8,2"), PrinterCheck::PrinterPaused);
        assert_eq!(parse_windows("0,3,3,7"), PrinterCheck::PrinterUnavailable);
        assert_eq!(parse_windows("0,3,9,2"), PrinterCheck::PrinterUnavailable);
        assert_eq!(parse_windows("0,3,11,2"), PrinterCheck::PrinterUnavailable);
        assert_eq!(parse_windows("0,3,16,2"), PrinterCheck::PrinterUnavailable);
        assert_eq!(parse_windows("0,2,2,0"), PrinterCheck::CheckFailed);
        assert_eq!(parse_windows("access denied"), PrinterCheck::CheckFailed);
        assert_eq!(parse_windows("0,3"), PrinterCheck::CheckFailed);
    }

    #[test]
    fn mixed_faults_do_not_claim_all_printers_are_offline() {
        assert_eq!(
            parse_windows("1,7,7,9\n0,3,8,2"),
            PrinterCheck::PrinterUnavailable
        );
    }

    #[cfg(unix)]
    #[test]
    fn probe_stops_a_hung_command() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "exec sleep 2"]);
        let start = Instant::now();
        assert!(probe(&mut command, Duration::from_millis(30)).is_err());
        assert!(start.elapsed() < Duration::from_secs(1));
    }
}
