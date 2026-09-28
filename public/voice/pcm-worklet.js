/* global AudioWorkletProcessor, registerProcessor */
// Hands the microphone's raw samples to the page in small batches. Its output stays silent.
class PcmTap extends AudioWorkletProcessor {
	process(inputs) {
		const channel = inputs[0] && inputs[0][0];
		if (channel) this.port.postMessage(channel.slice(0));
		return true;
	}
}
registerProcessor("pcm-tap", PcmTap);
