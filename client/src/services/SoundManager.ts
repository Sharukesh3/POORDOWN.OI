class SoundManager {
    private audioCtx: AudioContext | null = null;
    private isMuted: boolean = false;
    private initialized: boolean = false;

    constructor() {
        // We delay true initialization until first user interaction to satisfy browser autoplay policies
    }

    public init() {
        if (this.initialized) return;
        try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            this.audioCtx = new AudioContextClass();
            this.initialized = true;
        } catch (e) {
            console.error('Web Audio API not supported:', e);
        }
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    public getMuteStatus() {
        return this.isMuted;
    }

    public play(soundName: 'roll' | 'move' | 'buy' | 'pay' | 'jail' | 'turn_start') {
        if (this.isMuted) return;
        if (!this.initialized) this.init();
        if (!this.audioCtx) return;

        // Resume context if suspended (browser requirement)
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        switch (soundName) {
            case 'roll':
                this.playRollSound();
                break;
            case 'move':
                this.playMoveSound();
                break;
            case 'buy':
                this.playBuySound();
                break;
            case 'pay':
                this.playPaySound();
                break;
            case 'jail':
                this.playJailSound();
                break;
            case 'turn_start':
                this.playTurnStartSound();
                break;
        }
    }

    // --- SYNTHETIC SOUND GENERATORS ---

    private playRollSound() {
        // Rapid clicks/noise
        const count = 5;
        for (let i = 0; i < count; i++) {
            setTimeout(() => {
                this.createOscillator(200 + Math.random() * 200, 'square', 0.05, 0.05);
            }, i * 60);
        }
    }

    private playMoveSound() {
        // High pitched "pop" or "bloop"
        this.createOscillator(600, 'sine', 0.05, 0.05, 400); // Frequency drops slightly
    }

    private playBuySound() {
        // Classic "Coin" sound: Two rapid high sine waves
        // B5 (987Hz) -> E6 (1318Hz)
        const ctx = this.audioCtx!;
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc.frequency.setValueAtTime(987, now);
        osc.frequency.setValueAtTime(1318, now + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.4);
    }

    private playPaySound() {
        // "Frown" sound: Descending tone
        this.createOscillator(400, 'sawtooth', 0.1, 0.3, 150);
    }

    private playJailSound() {
        // Low buzzer
        this.createOscillator(100, 'sawtooth', 0.2, 0.5);
    }

    private playTurnStartSound() {
        // Gentle chime
        this.createOscillator(880, 'sine', 0.1, 0.5, 880); // A5
    }

    // Helper for simple tones
    private createOscillator(freq: number, type: OscillatorType, volume: number, duration: number, endFreq?: number) {
        if (!this.audioCtx) return;
        const ctx = this.audioCtx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (endFreq) {
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
        }

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }
}

export const soundManager = new SoundManager();
