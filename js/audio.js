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
    }

    start() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playing = true;
    }

    update(dt) {
        if (!this.playing || !this.ctx) return;
        this.timer += dt;
        const spb = 60 / this.bpm / 4; // 16th notes
        if (this.timer > spb) {
            this.timer -= spb;
            if (this.step % 2 === 0) this.playNote(this.notes[this.step % this.notes.length]);
            this.step++;
        }
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
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
            gain.gain.setValueAtTime(0.04, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            osc.start(t);
            osc.stop(t + 0.06);
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
        }
    }
}

let menuSynth = new SynthMusic();
