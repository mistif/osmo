# Makes the speech clips the voice check uses, with this PC's own Windows voices, and downloads openWakeWord's
# "hey jarvis" model to stand in for the "osmo" detector until Gur trains it. Output: scripts/voice-clips/ (git-ignored).
# Run from my-app: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1
$ErrorActionPreference = "Stop"
$out = Join-Path $PSScriptRoot "voice-clips"
New-Item -ItemType Directory -Force $out | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
	$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Await($operation, [Type]$type) { $asTask.MakeGenericMethod($type).Invoke($null, @($operation)).Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
function Say([string]$voice, [string]$text, [string]$file) {
	$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq "Microsoft $voice" } | Select-Object -First 1
	if (-not $synth.Voice) { throw "The voice Microsoft $voice is not installed" }
	$stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
	$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
	$null = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
	$bytes = New-Object byte[] $stream.Size
	$reader.ReadBytes($bytes)
	[IO.File]::WriteAllBytes((Join-Path $out $file), $bytes)
}

$sentences = @(
	"The morning light came through the kitchen window while the kettle slowly began to boil.",
	"I would like to hear about the weather this weekend, and whether it will rain on Saturday.",
	"Please remind me to call my sister after lunch, because I promised to help her move.",
	"Numbers like forty two and seventeen are easy to say, but hard to remember later.",
	"Osmo, what do you think about the book I was reading yesterday evening?"
)
foreach ($voice in "David", "Mark", "Zira") {
	for ($i = 0; $i -lt $sentences.Count; $i++) { Say $voice $sentences[$i] "$voice-$($i + 1).wav" }
	Say $voice "Osmo." "$voice-osmo.wav"
}
Say "Mark" "Hey Jarvis. What time is it?" "hey-jarvis.wav"
Say "Mark" "Hey Travis. What time is it?" "hey-travis.wav"
Invoke-WebRequest -UseBasicParsing "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/hey_jarvis_v0.1.onnx" -OutFile (Join-Path $out "hey_jarvis_v0.1.onnx")
Write-Output "Clips written to $out"
