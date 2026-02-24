// =============================================
// SYNTH MUSIC & SFX
// =============================================
class SynthMusic {
    constructor() {
        this.ctx = null;
        this.playing = false;
        this.timer = 0;
        this.bpm = 110;
        this.step = 0;
        this.notes = [36, 48, 36, 48, 43, 48, 36, 48]; // Basic techno bassline
        this.isLiminal = true; // Start in liminal drone mode
    }

    start() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playing = true;
    }

    transitionToGameplay() {
        this.isLiminal = false;
        this.bpm = 110;
        this.step = 0;
        this.playSFX('initiate');
    }

    update(dt) {
        if (!this.playing || !this.ctx) return;

        if (this.isLiminal) {
            // Liminal drone mode: play long pad notes every 2 seconds
            this.timer += dt;
            if (this.timer > 2.5) {
                this.timer = 0;
                this.playPadNote([48, 52, 55, 60][Math.floor(Math.random() * 4)]); // C major / A minor feel
            }
            return;
        }

        this.timer += dt;
        const spb = 60 / this.bpm / 4; // 16th notes
        if (this.timer > spb) {
            this.timer -= spb;
            if (this.step % 2 === 0) this.playNote(this.notes[this.step % this.notes.length]);
            this.step++;
        }
    }

    playPadNote(midi) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.03, t + 1.0);
        gain.gain.linearRampToValueAtTime(0, t + 2.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 2.6);
    }

    playNote(midi) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        osc1.frequency.setValueAtTime(freq, t);
        osc2.frequency.setValueAtTime(freq / 2, t); // sub-octave

        // Pluck envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.1);
        osc2.stop(t + 0.1);
    }

    playSFX(type) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'step') {
            // "Step" is now "Rocket Thrust"
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(60, t);
            osc.frequency.exponentialRampToValueAtTime(120, t + 0.1);

            const noise = this.ctx.createOscillator();
            const noiseGain = this.ctx.createGain();
            noise.type = 'sine'; // Simulating noise with rapid frequency changes
            noise.frequency.setValueAtTime(800 + Math.random() * 400, t);
            noiseGain.gain.setValueAtTime(0.02, t);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            noise.connect(noiseGain);
            noiseGain.connect(this.ctx.destination);
            noise.start(t);
            noise.stop(t + 0.12);

            gain.gain.setValueAtTime(0.03, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.start(t);
            osc.stop(t + 0.1);
        } else if (type === 'bump') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(50, t + 0.1);
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.1);
            osc.start(t);
            osc.stop(t + 0.15);
        } else if (type === 'quest') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, t);
            osc.frequency.setValueAtTime(800, t + 0.05);
            osc.frequency.setValueAtTime(1200, t + 0.1);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.25);
        } else if (type === 'correct') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(554, t + 0.1);
            osc.frequency.setValueAtTime(659, t + 0.2);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.5);
        } else if (type === 'wrong') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, t);
            osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
            gain.gain.setValueAtTime(0.08, t);
            gain.gain.linearRampToValueAtTime(0, t + 0.4);
            osc.start(t);
            osc.stop(t + 0.5);
        } else if (type === 'chat') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + Math.random() * 200, t);
            gain.gain.setValueAtTime(0.02, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t);
            osc.stop(t + 0.1);
        } else if (type === 'fusion') {
            // Epic rising fusion sound
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(880, t + 1.5);
            gain.gain.setValueAtTime(0.01, t);
            gain.gain.linearRampToValueAtTime(0.1, t + 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);

            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(75, t);
            osc2.frequency.exponentialRampToValueAtTime(440, t + 1.5);
            gain2.gain.setValueAtTime(0.01, t);
            gain2.gain.linearRampToValueAtTime(0.08, t + 0.5);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
            osc2.connect(gain2);
            gain2.connect(this.ctx.destination);

            osc.start(t);
            osc2.start(t);
            osc.stop(t + 2.1);
            osc2.stop(t + 2.1);
        } else if (type === 'initiate') {
            // Powerful "Start" cinematic sound
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(40, t);
            osc.frequency.exponentialRampToValueAtTime(10, t + 1.0);
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.2, t + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(800, t);
            osc2.frequency.exponentialRampToValueAtTime(200, t + 0.8);
            gain2.gain.setValueAtTime(0.1, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            osc2.connect(gain2);
            gain2.connect(this.ctx.destination);

            osc.start(t);
            osc2.start(t);
            osc.stop(t + 1.2);
            osc2.stop(t + 0.8);
        }
    }
}

let menuSynth = new SynthMusic();
