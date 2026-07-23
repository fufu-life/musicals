import AVFoundation
import Foundation

struct Job: Decodable {
    let id: String
    let text: String
    let output: String
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard CommandLine.arguments.count == 4 else {
    fail("Usage: batch-system-tts.swift <jobs.json> <voice-name> <rate>")
}

let jobsURL = URL(fileURLWithPath: CommandLine.arguments[1])
let voiceName = CommandLine.arguments[2]
guard let rate = Float(CommandLine.arguments[3]) else {
    fail("Invalid speech rate")
}

let decoder = JSONDecoder()
let jobs: [Job]
do {
    jobs = try decoder.decode([Job].self, from: Data(contentsOf: jobsURL))
} catch {
    fail("Cannot read jobs: \(error)")
}

guard let voice = AVSpeechSynthesisVoice.speechVoices().first(where: { $0.name == voiceName }) else {
    fail("Voice not installed: \(voiceName)")
}

let synthesizer = AVSpeechSynthesizer()
var failed = 0

for (index, job) in jobs.enumerated() {
    let outputURL = URL(fileURLWithPath: job.output)
    do {
        try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: outputURL)
    } catch {
        FileHandle.standardError.write(Data(("Directory error for \(job.id): \(error)\n").utf8))
        failed += 1
        continue
    }

    let utterance = AVSpeechUtterance(string: job.text)
    utterance.voice = voice
    utterance.rate = rate
    var audioFile: AVAudioFile?
    var converter: AVAudioConverter?
    var destinationFormat: AVAudioFormat?
    var frameCount: AVAudioFramePosition = 0
    var done = false
    var writeError: Error?

    synthesizer.write(utterance) { buffer in
        guard let pcm = buffer as? AVAudioPCMBuffer else {
            done = true
            return
        }
        if pcm.frameLength == 0 {
            done = true
            return
        }
        do {
            if audioFile == nil {
                guard let format = AVAudioFormat(
                    commonFormat: .pcmFormatInt16,
                    sampleRate: pcm.format.sampleRate,
                    channels: pcm.format.channelCount,
                    interleaved: false
                ) else {
                    throw NSError(domain: "BatchTTS", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot create Int16 output format"])
                }
                destinationFormat = format
                converter = AVAudioConverter(from: pcm.format, to: format)
                audioFile = try AVAudioFile(
                    forWriting: outputURL,
                    settings: format.settings,
                    commonFormat: .pcmFormatInt16,
                    interleaved: false
                )
            }
            guard let converter, let destinationFormat else {
                throw NSError(domain: "BatchTTS", code: 2, userInfo: [NSLocalizedDescriptionKey: "Audio converter was not initialized"])
            }
            let capacity = AVAudioFrameCount(
                ceil(Double(pcm.frameLength) * destinationFormat.sampleRate / pcm.format.sampleRate)
            ) + 32
            guard let converted = AVAudioPCMBuffer(pcmFormat: destinationFormat, frameCapacity: capacity) else {
                throw NSError(domain: "BatchTTS", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot allocate output buffer"])
            }
            try converter.convert(to: converted, from: pcm)
            try audioFile?.write(from: converted)
            frameCount += AVAudioFramePosition(converted.frameLength)
        } catch {
            writeError = error
            done = true
        }
    }

    while !done {
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.01))
    }
    audioFile = nil

    if let writeError {
        FileHandle.standardError.write(Data(("Write error for \(job.id): \(writeError)\n").utf8))
        try? FileManager.default.removeItem(at: outputURL)
        failed += 1
    } else if frameCount == 0 {
        FileHandle.standardError.write(Data(("Empty audio for \(job.id)\n").utf8))
        try? FileManager.default.removeItem(at: outputURL)
        failed += 1
    }

    if (index + 1) % 100 == 0 {
        print("generated \(index + 1)/\(jobs.count)")
        fflush(stdout)
    }
}

print("complete generated=\(jobs.count - failed) failed=\(failed)")
if failed > 0 {
    exit(1)
}
