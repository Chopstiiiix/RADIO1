import Foundation
import Capacitor
import AVFoundation
import Accelerate

/// Capacitor plugin that captures real-time frequency data from iOS audio output
/// and sends it to the WebView for visualizer rendering.
@objc(AudioAnalyserPlugin)
class AudioAnalyserPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AudioAnalyserPlugin"
    let jsName = "AudioAnalyser"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startAnalysis", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAnalysis", returnType: CAPPluginReturnPromise)
    ]

    private let engine = AVAudioEngine()
    private var isRunning = false
    private let binCount = 128
    private let fftSize = 256 // Must be power of 2, >= binCount * 2
    private var fftSetup: vDSP_DFT_Setup?
    private var dispatchTimer: DispatchSourceTimer?

    // Shared buffer written by audio tap, read by timer
    private let bufferLock = NSLock()
    private var latestMagnitudes = [Float]()

    override func load() {
        fftSetup = vDSP_DFT_zrop_CreateSetup(nil, vDSP_Length(fftSize), .FORWARD)
    }

    deinit {
        stopTap()
        if let setup = fftSetup { vDSP_DFT_DestroySetup(setup) }
    }

    // MARK: - Plugin Methods

    @objc func startAnalysis(_ call: CAPPluginCall) {
        guard !isRunning else {
            call.resolve()
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            call.resolve(["error": "Audio session setup failed: \(error.localizedDescription)"])
            return
        }

        do {
            try startTap()
            call.resolve()
        } catch {
            call.resolve(["error": "Engine start failed: \(error.localizedDescription)"])
        }
    }

    @objc func stopAnalysis(_ call: CAPPluginCall) {
        stopTap()
        call.resolve()
    }

    // MARK: - Audio Engine

    private func startTap() throws {
        let mixer = engine.mainMixerNode
        let format = mixer.outputFormat(forBus: 0)

        guard format.sampleRate > 0 && format.channelCount > 0 else {
            throw NSError(domain: "AudioAnalyser", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid audio format"])
        }

        let bufferSize: AVAudioFrameCount = AVAudioFrameCount(fftSize)

        mixer.installTap(onBus: 0, bufferSize: bufferSize, format: format) { [weak self] buffer, _ in
            self?.processBuffer(buffer)
        }

        engine.prepare()
        try engine.start()
        isRunning = true

        startDispatchTimer()
    }

    private func stopTap() {
        dispatchTimer?.cancel()
        dispatchTimer = nil

        if isRunning {
            engine.mainMixerNode.removeTap(onBus: 0)
            engine.stop()
            isRunning = false
        }
    }

    // MARK: - FFT Processing

    private func processBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let setup = fftSetup,
              let channelData = buffer.floatChannelData?[0] else { return }

        let frameCount = Int(buffer.frameLength)
        let n = min(frameCount, fftSize)

        // Apply Hann window
        var windowed = [Float](repeating: 0, count: fftSize)
        var window = [Float](repeating: 0, count: n)
        vDSP_hann_window(&window, vDSP_Length(n), Int32(vDSP_HANN_NORM))
        vDSP_vmul(channelData, 1, &window, 1, &windowed, 1, vDSP_Length(n))

        // Split into real/imaginary for DFT
        var realIn = [Float](repeating: 0, count: fftSize)
        var imagIn = [Float](repeating: 0, count: fftSize)
        var realOut = [Float](repeating: 0, count: fftSize)
        var imagOut = [Float](repeating: 0, count: fftSize)

        realIn.replaceSubrange(0..<n, with: windowed[0..<n])

        vDSP_DFT_Execute(setup, &realIn, &imagIn, &realOut, &imagOut)

        // Compute magnitudes for first binCount bins
        var magnitudes = [Float](repeating: 0, count: binCount)
        for i in 0..<binCount {
            let re = realOut[i]
            let im = imagOut[i]
            magnitudes[i] = sqrtf(re * re + im * im)
        }

        // Normalize: convert to 0-255 range (dB scale, matching Web Audio behavior)
        let minDb: Float = -100.0
        let maxDb: Float = -30.0
        let rangeDb = maxDb - minDb

        for i in 0..<binCount {
            var db = 20.0 * log10f(max(magnitudes[i] / Float(fftSize), 1e-10))
            db = max(minDb, min(maxDb, db))
            magnitudes[i] = ((db - minDb) / rangeDb) * 255.0
        }

        bufferLock.lock()
        latestMagnitudes = magnitudes
        bufferLock.unlock()
    }

    // MARK: - Dispatch Timer (~30fps)

    private func startDispatchTimer() {
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .userInteractive))
        timer.schedule(deadline: .now(), repeating: .milliseconds(33))
        timer.setEventHandler { [weak self] in
            self?.sendFrequencyData()
        }
        timer.resume()
        dispatchTimer = timer
    }

    private func sendFrequencyData() {
        bufferLock.lock()
        let mags = latestMagnitudes
        bufferLock.unlock()

        guard !mags.isEmpty else { return }

        let bins = mags.map { UInt8(clamping: Int(max(0, min(255, $0)))) }
        notifyListeners("frequencyData", data: ["bins": bins])
    }
}
