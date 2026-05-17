use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("--version") => println!("sks-rs 0.9.12"),
        Some("compact-info") => {
            let mut input = String::new();
            let _ = io::stdin().read_to_string(&mut input);
            println!("{{\"ok\":true,\"engine\":\"rust\",\"input_bytes\":{}}}", input.as_bytes().len());
        }
        Some("jsonl-tail") => {
            let path = args.next().unwrap_or_default();
            let mut bytes: u64 = 262144;
            while let Some(arg) = args.next() {
                if arg == "--bytes" {
                    if let Some(raw) = args.next() {
                        bytes = raw.parse().unwrap_or(bytes);
                    }
                }
            }
            match tail_file(&path, bytes) {
                Ok(text) => print!("{}", text),
                Err(err) => {
                    eprintln!("{}", err);
                    std::process::exit(1);
                }
            }
        }
        Some("secret-scan") => {
            let path = args.next().unwrap_or_default();
            match std::fs::read_to_string(&path) {
                Ok(text) => {
                    let found = ["CODEX_ACCESS_TOKEN", "OPENAI_API_KEY", "CODEX_LB_API_KEY", "sk-proj-", "sk-clb-", "github_pat_"]
                        .iter()
                        .any(|needle| text.contains(needle));
                    println!("{{\"ok\":{},\"engine\":\"rust\",\"findings\":{}}}", if found { "false" } else { "true" }, if found { 1 } else { 0 });
                    if found { std::process::exit(1); }
                }
                Err(err) => {
                    eprintln!("{}", err);
                    std::process::exit(1);
                }
            }
        }
        _ => {
            eprintln!("sks-rs optional accelerator. Commands: --version, compact-info, jsonl-tail, secret-scan");
            std::process::exit(2);
        }
    }
}

fn tail_file(path: &str, bytes: u64) -> io::Result<String> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let start = len.saturating_sub(bytes);
    file.seek(SeekFrom::Start(start))?;
    let mut out = String::new();
    file.read_to_string(&mut out)?;
    Ok(out)
}
