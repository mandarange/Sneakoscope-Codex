import Cocoa

struct ProcessResult {
    let code: Int32
    let output: String
    let truncated: Bool
}

final class ProcessClient {
    private let actionScript: String
    private let logPath: String
    private let outputLimit = 64 * 1024

    init(actionScript: String, logPath: String) {
        self.actionScript = actionScript
        self.logPath = logPath
    }

    func run(_ arguments: [String], stdin: String? = nil, completion: @escaping (ProcessResult) -> Void) {
        let process = Process()
        let output = Pipe()
        process.executableURL = URL(fileURLWithPath: actionScript)
        process.arguments = arguments
        process.standardOutput = output
        process.standardError = output
        var input: Pipe?
        if stdin != nil { input = Pipe(); process.standardInput = input }
        do {
            try process.run()
            output.fileHandleForWriting.closeFile()
            if let stdin = stdin, let input = input {
                input.fileHandleForWriting.write(Data(stdin.utf8))
                input.fileHandleForWriting.closeFile()
            }
            DispatchQueue.global(qos: .utility).async {
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                let truncated = data.count > self.outputLimit
                let bounded = Data(data.suffix(self.outputLimit))
                let text = self.redact(String(data: bounded, encoding: .utf8) ?? "")
                self.writeLog(command: arguments, output: text)
                DispatchQueue.main.async { completion(ProcessResult(code: process.terminationStatus, output: text, truncated: truncated)) }
            }
        } catch {
            let text = redact(String(describing: error))
            writeLog(command: arguments, output: text)
            completion(ProcessResult(code: -1, output: text, truncated: false))
        }
    }

    func runDetached(_ arguments: [String]) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: actionScript)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
    }

    func redact(_ value: String) -> String {
        var text = value
        let patterns = [
            #"sk-(?:proj|or-v1|clb)?-?[A-Za-z0-9_-]{12,}"#,
            #"(?i)(api[_-]?key|secret|token)\s*[:=]\s*[^\s\"',}]+"#,
            #"/Users/[^/\s]+"#
        ]
        for pattern in patterns where !pattern.isEmpty {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(text.startIndex..<text.endIndex, in: text)
            text = regex.stringByReplacingMatches(in: text, range: range, withTemplate: "[redacted]")
        }
        return text
    }

    private func writeLog(command: [String], output: String) {
        let url = URL(fileURLWithPath: logPath)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let text = "$ sks \(redact(command.joined(separator: " ")))\n\(output)\n"
        try? Data(text.utf8).write(to: url, options: .atomic)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: logPath)
    }
}
