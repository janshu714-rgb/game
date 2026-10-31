/* ============================================
   DÉJÀ VU LOOP — Core Engine
   Handles: Canvas, Physics, Rendering, Input,
   Ghost Recording & Replay, Particles, Camera
   ============================================ */

// ─── CONSTANTS ───
const TILE = 32;
const GRAVITY = 0.55;
const MAX_FALL = 12;
const PLAYER_SPEED = 3.2;
const PLAYER_JUMP = -9.5;
const WALL_SLIDE_SPEED = 1.5;
const WALL_JUMP_X = 5;
const WALL_JUMP_Y = -8.5;
const COYOTE_TIME = 6;       // frames of grace after leaving ground
const JUMP_BUFFER = 6;       // frames of jump buffer before landing
const GHOST_ALPHA_BASE = 0.35;
const GHOST_ALPHA_DECAY = 0.06; // each successive ghost is more faded

// Tile types
const T = {
    EMPTY: 0,
    WALL: 1,
    SPIKE: 2,
    EXIT: 3,
    BUTTON: 4,
    DOOR: 5,
    MOVING_PLAT: 6,
    CRUMBLE: 7,
    SPRING: 8,
    CHECKPOINT: 9,
    GHOST_BLOCK: 10, // only solid when a ghost stands on/near it
    KEY: 11,
    LOCKED_DOOR: 12,
};

// Colors
const COLORS = {
    bg: '#0d0d2b',
    bgGrad1: '#151535',
    bgGrad2: '#0d0d2b',
    wall: '#2a2755',
    wallHighlight: '#3d3877',
    wallShadow: '#1a1740',
    spike: '#ff3355',
    spikeGlow: 'rgba(255,51,85,0.3)',
    exit: '#33ff88',
    exitGlow: 'rgba(51,255,136,0.4)',
    player: '#ff7733',
    playerLight: '#ffaa55',
    playerDark: '#cc5522',
    ghost: '#4de8ff',
    ghostDim: '#2a8a9e',
    button: '#ffaa33',
    buttonActive: '#33ff88',
    door: '#665599',
    doorOpen: '#33665520',
    movingPlat: '#3d3877',
    crumble: '#554433',
    crumbleWarn: '#ff6644',
    spring: '#33ff88',
    springBase: '#227755',
    checkpoint: '#9966ff',
    checkpointActive: '#cc99ff',
    ghostBlock: '#1a3355',
    ghostBlockActive: '#4de8ff',
    key: '#ffd700',
    keyGlow: 'rgba(255,215,0,0.4)',
    lockedDoor: '#8B7355',
    text: '#e8e4e0',
    textDim: '#888899',
    particleDefault: '#4de8ff',
};

// ─── INPUT MANAGER ───
class InputManager {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this._prevKeys = {};
        
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            e.preventDefault();
        });
        
        // Touch / mobile controls state
        this.touchLeft = false;
        this.touchRight = false;
        this.touchJump = false;
        this.touchInteract = false;
        this.touchRestart = false;
    }
    
    update() {
        for (const key in this.keys) {
            this.justPressed[key] = this.keys[key] && !this._prevKeys[key];
        }
        this._prevKeys = { ...this.keys };

        // Reset one-shot touch flags
        this.touchJump = false;
        this.touchInteract = false;
        this.touchRestart = false;
    }
    
    isDown(action) {
        switch (action) {
            case 'left':
                return this.keys['KeyA'] || this.keys['ArrowLeft'] || this.touchLeft;
            case 'right':
                return this.keys['KeyD'] || this.keys['ArrowRight'] || this.touchRight;
            case 'jump':
                return this.keys['KeyW'] || this.keys['ArrowUp'] || this.keys['Space'] || this.touchJump;
            case 'interact':
                return this.keys['KeyE'] || this.touchInteract;
            case 'restart':
                return this.keys['KeyR'] || this.touchRestart;
            default:
                return false;
        }
    }
    
    wasJustPressed(action) {
        switch (action) {
            case 'jump':
                return this.justPressed['KeyW'] || this.justPressed['ArrowUp'] || this.justPressed['Space'] || this.touchJump;
            case 'interact':
                return this.justPressed['KeyE'] || this.touchInteract;
            case 'restart':
                return this.justPressed['KeyR'] || this.touchRestart;
            default:
                return false;
        }
    }
}

// ─── PARTICLE SYSTEM ───
class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size || 2;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.05; // light gravity on particles
        this.life--;
    }
    
    get alpha() {
        return Math.max(0, this.life / this.maxLife);
    }
    
    get alive() {
        return this.life > 0;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }
    
    emit(x, y, count, color, opts = {}) {
        const speed = opts.speed || 2;
        const life = opts.life || 30;
        const size = opts.size || 2;
        const spread = opts.spread || Math.PI * 2;
        const angle = opts.angle || 0;
        
        for (let i = 0; i < count; i++) {
            const a = angle + (Math.random() - 0.5) * spread;
            const s = Math.random() * speed;
            this.particles.push(new Particle(
                x, y,
                Math.cos(a) * s,
                Math.sin(a) * s,
                life + Math.random() * life * 0.5,
                color,
                size * (0.5 + Math.random() * 0.5)
            ));
        }
    }
    
    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (!this.particles[i].alive) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    render(ctx, camX, camY) {
        for (const p of this.particles) {
            ctx.globalAlpha = p.alpha * 0.8;
            ctx.fillStyle = p.color;
            ctx.fillRect(
                Math.round(p.x - camX - p.size / 2),
                Math.round(p.y - camY - p.size / 2),
                p.size, p.size
            );
        }
        ctx.globalAlpha = 1;
    }
    
    clear() {
        this.particles = [];
    }
}

// ─── SOUND ENGINE (procedural) ───
class SoundEngine {
    constructor() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.enabled = true;
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.ctx.destination);
        } catch (e) {
            this.enabled = false;
        }
    }
    
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    
    _play(freq, type, duration, volume = 0.3, detune = 0) {
        if (!this.enabled) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.detune.value = detune;
            gain.gain.setValueAtTime(volume, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    }
    
    jump() {
        this._play(300, 'square', 0.12, 0.15);
        setTimeout(() => this._play(450, 'square', 0.08, 0.1), 30);
    }
    
    land() {
        this._play(100, 'triangle', 0.08, 0.1);
    }
    
    die() {
        this._play(200, 'sawtooth', 0.3, 0.2);
        setTimeout(() => this._play(150, 'sawtooth', 0.3, 0.15), 100);
        setTimeout(() => this._play(100, 'sawtooth', 0.4, 0.1), 200);
    }
    
    complete() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((n, i) => {
            setTimeout(() => this._play(n, 'square', 0.2, 0.15), i * 100);
        });
    }
    
    button() {
        this._play(600, 'sine', 0.1, 0.15);
        setTimeout(() => this._play(800, 'sine', 0.1, 0.1), 50);
    }
    
    spring() {
        this._play(400, 'sine', 0.15, 0.15);
        setTimeout(() => this._play(800, 'sine', 0.15, 0.12), 50);
        setTimeout(() => this._play(1200, 'sine', 0.1, 0.08), 100);
    }
    
    collectKey() {
        this._play(880, 'sine', 0.15, 0.15);
        setTimeout(() => this._play(1100, 'sine', 0.15, 0.12), 80);
        setTimeout(() => this._play(1320, 'sine', 0.2, 0.1), 160);
    }
    
    unlock() {
        this._play(440, 'triangle', 0.2, 0.15);
        setTimeout(() => this._play(554, 'triangle', 0.2, 0.12), 120);
        setTimeout(() => this._play(659, 'triangle', 0.25, 0.1), 240);
    }

    loopRestart() {
        this._play(250, 'sine', 0.3, 0.12, -10);
        this._play(250, 'sine', 0.3, 0.12, 10);
    }
}

// ─── GHOST RECORDER ───
class GhostRecorder {
    constructor() {
        this.frames = [];
        this.recording = false;
    }
    
    start() {
        this.frames = [];
        this.recording = true;
    }
    
    record(playerState) {
        if (!this.recording) return;
        this.frames.push({
            x: playerState.x,
            y: playerState.y,
            facingRight: playerState.facingRight,
            grounded: playerState.grounded,
            vx: playerState.vx,
            vy: playerState.vy,
            pressing: playerState.pressing,
            alive: playerState.alive,
        });
    }
    
    stop() {
        this.recording = false;
        return [...this.frames];
    }
}

// ─── GHOST (replayed past run) ───
class Ghost {
    constructor(frames, index) {
        this.frames = frames;
        this.index = index; // which ghost (0 = newest, higher = older)
        this.currentFrame = 0;
        this.x = frames[0]?.x || 0;
        this.y = frames[0]?.y || 0;
        this.facingRight = true;
        this.grounded = false;
        this.alive = true;
        this.pressing = false;
        this.width = 14;
        this.height = 22;
        this.finished = false;
        this.deathFrame = -1;
        
        // Find the frame where ghost died (last alive frame)
        for (let i = 0; i < frames.length; i++) {
            if (!frames[i].alive) {
                this.deathFrame = i;
                break;
            }
        }
    }
    
    update() {
        if (this.finished) return;
        
        if (this.currentFrame < this.frames.length) {
            const f = this.frames[this.currentFrame];
            this.x = f.x;
            this.y = f.y;
            this.facingRight = f.facingRight;
            this.grounded = f.grounded;
            this.alive = f.alive;
            this.pressing = f.pressing;
            this.currentFrame++;
        } else {
            this.finished = true;
        }
    }
    
    getBounds() {
        return {
            x: this.x,
            y: this.y,
            w: this.width,
            h: this.height,
        };
    }
    
    render(ctx, camX, camY, globalAlpha) {
        if (!this.alive && this.currentFrame >= this.deathFrame && this.deathFrame > 0) {
            // Render dead ghost as a faded body on the ground
            const f = this.frames[Math.max(0, this.deathFrame - 1)];
            ctx.globalAlpha = globalAlpha * 0.3;
            ctx.fillStyle = COLORS.ghostDim;
            const rx = Math.round(f.x - camX);
            const ry = Math.round(f.y - camY);
            // Collapsed body
            ctx.fillRect(rx - 1, ry + this.height - 6, this.width + 2, 6);
            ctx.globalAlpha = 1;
            return;
        }
        
        if (this.finished || !this.alive) return;
        
        const alpha = globalAlpha;
        ctx.globalAlpha = alpha;
        
        const rx = Math.round(this.x - camX);
        const ry = Math.round(this.y - camY);
        
        // Ghost glow
        ctx.shadowColor = COLORS.ghost;
        ctx.shadowBlur = 8;
        
        // Body
        ctx.fillStyle = COLORS.ghost;
        ctx.fillRect(rx, ry + 4, this.width, this.height - 4);
        
        // Head (rounded top)
        ctx.beginPath();
        ctx.arc(rx + this.width / 2, ry + 6, this.width / 2, Math.PI, 0);
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = this.facingRight ? '#ffffff' : '#ffffff';
        const eyeOffset = this.facingRight ? 2 : -2;
        ctx.fillRect(rx + 3 + eyeOffset, ry + 5, 3, 3);
        ctx.fillRect(rx + 8 + eyeOffset, ry + 5, 3, 3);
        
        // Wavy bottom edge
        ctx.fillStyle = COLORS.ghost;
        const waveOffset = (this.currentFrame * 0.1) % (Math.PI * 2);
        for (let i = 0; i < this.width; i += 4) {
            const waveY = Math.sin(waveOffset + i * 0.5) * 2;
            ctx.fillRect(rx + i, ry + this.height - 2 + waveY, 4, 3);
        }
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}

// ─── PLAYER ───
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = 14;
        this.height = 22;
        this.grounded = false;
        this.facingRight = true;
        this.alive = true;
        this.pressing = false; // standing on a button
        this.coyoteCounter = 0;
        this.jumpBufferCounter = 0;
        this.wasGrounded = false;
        this.wallSliding = false;
        this.wallDir = 0;
        this.hasKey = false;
        
        // Animation
        this.animFrame = 0;
        this.animTimer = 0;
        this.squash = 1;
        this.stretch = 1;
        this.eyeBlink = 0;
        this.trail = [];
    }
    
    reset(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.grounded = false;
        this.alive = true;
        this.pressing = false;
        this.coyoteCounter = 0;
        this.jumpBufferCounter = 0;
        this.wallSliding = false;
        this.wallDir = 0;
        this.squash = 1;
        this.stretch = 1;
        this.hasKey = false;
        this.trail = [];
    }
    
    getState() {
        return {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            facingRight: this.facingRight,
            grounded: this.grounded,
            pressing: this.pressing,
            alive: this.alive,
        };
    }
    
    update(input, level, ghosts, particles, sound) {
        if (!this.alive) return;
        
        // ── Movement ──
        let moveX = 0;
        if (input.isDown('left')) moveX -= 1;
        if (input.isDown('right')) moveX += 1;
        
        if (moveX !== 0) {
            this.facingRight = moveX > 0;
        }
        
        this.vx = moveX * PLAYER_SPEED;
        
        // ── Coyote time ──
        if (this.grounded) {
            this.coyoteCounter = COYOTE_TIME;
        } else {
            this.coyoteCounter--;
        }
        
        // ── Jump buffer ──
        if (input.wasJustPressed('jump')) {
            this.jumpBufferCounter = JUMP_BUFFER;
        } else {
            this.jumpBufferCounter--;
        }
        
        // ── Wall detection ──
        this.wallSliding = false;
        this.wallDir = 0;
        if (!this.grounded && this.vy > 0) {
            if (this._checkWall(level, -1)) {
                this.wallSliding = true;
                this.wallDir = -1;
            } else if (this._checkWall(level, 1)) {
                this.wallSliding = true;
                this.wallDir = 1;
            }
        }
        
        // ── Jump ──
        if (this.jumpBufferCounter > 0) {
            if (this.coyoteCounter > 0) {
                // Normal jump
                this.vy = PLAYER_JUMP;
                this.coyoteCounter = 0;
                this.jumpBufferCounter = 0;
                this.squash = 0.6;
                this.stretch = 1.3;
                sound.jump();
                particles.emit(this.x + this.width/2, this.y + this.height, 5, COLORS.player, {
                    speed: 1.5, life: 15, spread: Math.PI * 0.5, angle: -Math.PI/2
                });
            } else if (this.wallSliding) {
                // Wall jump
                this.vx = -this.wallDir * WALL_JUMP_X;
                this.vy = WALL_JUMP_Y;
                this.facingRight = this.wallDir < 0;
                this.jumpBufferCounter = 0;
                this.wallSliding = false;
                this.squash = 0.7;
                this.stretch = 1.2;
                sound.jump();
                particles.emit(
                    this.x + (this.wallDir > 0 ? this.width : 0), 
                    this.y + this.height/2, 6, COLORS.player, {
                    speed: 2, life: 15, spread: Math.PI * 0.4, 
                    angle: this.wallDir > 0 ? Math.PI : 0
                });
            }
        }
        
        // ── Gravity ──
        if (this.wallSliding) {
            this.vy = Math.min(this.vy + GRAVITY * 0.3, WALL_SLIDE_SPEED);
        } else {
            this.vy = Math.min(this.vy + GRAVITY, MAX_FALL);
        }
        
        // ── Variable jump height ──
        if (!input.isDown('jump') && this.vy < -2) {
            this.vy *= 0.7;
        }
        
        // ── Apply movement & collide ──
        this.wasGrounded = this.grounded;
        this._moveAndCollide(level, ghosts, particles, sound);
        
        // ── Land squash ──
        if (this.grounded && !this.wasGrounded && this.vy >= 0) {
            this.squash = 1.3;
            this.stretch = 0.7;
            sound.land();
            particles.emit(this.x + this.width/2, this.y + this.height, 4, '#aaaacc', {
                speed: 1, life: 10, spread: Math.PI * 0.6, angle: -Math.PI/2
            });
        }
        
        // ── Squash/stretch recovery ──
        this.squash += (1 - this.squash) * 0.2;
        this.stretch += (1 - this.stretch) * 0.2;
        
        // ── Animation ──
        this.animTimer++;
        if (this.animTimer > 6) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }
        
        // ── Blink ──
        this.eyeBlink--;
        if (this.eyeBlink <= 0) {
            this.eyeBlink = 120 + Math.random() * 180;
        }
        
        // ── Trail ──
        if (Math.abs(this.vx) > 0.5 || Math.abs(this.vy) > 1) {
            this.trail.push({ x: this.x + this.width/2, y: this.y + this.height/2, life: 8 });
        }
        for (let i = this.trail.length - 1; i >= 0; i--) {
            this.trail[i].life--;
            if (this.trail[i].life <= 0) this.trail.splice(i, 1);
        }
        
        // ── Check interactions ──
        this.pressing = false;
        this._checkTileInteractions(level, ghosts, particles, sound);
    }
    
    _checkWall(level, dir) {
        const checkX = dir < 0 ? this.x - 2 : this.x + this.width + 1;
        const ty1 = Math.floor(this.y / TILE);
        const ty2 = Math.floor((this.y + this.height - 1) / TILE);
        const tx = Math.floor(checkX / TILE);
        
        for (let ty = ty1; ty <= ty2; ty++) {
            const tile = level.getTile(tx, ty);
            if (tile === T.WALL) return true;
        }
        return false;
    }
    
    _moveAndCollide(level, ghosts, particles, sound) {
        // Move X
        this.x += this.vx;
        this._resolveCollisionX(level);
        
        // Move Y
        this.grounded = false;
        this.y += this.vy;
        this._resolveCollisionY(level, ghosts, particles, sound);
        
        // Check ghost collision (stand on ghosts)
        for (const ghost of ghosts) {
            if (!ghost.alive || ghost.finished) continue;
            const gb = ghost.getBounds();
            if (this._overlaps(gb) && this.vy >= 0) {
                // Only count if player is above ghost
                if (this.y + this.height - this.vy <= gb.y + 2) {
                    this.y = gb.y - this.height;
                    this.vy = 0;
                    this.grounded = true;
                }
            }
        }
    }
    
    _overlaps(rect) {
        return this.x < rect.x + rect.w &&
               this.x + this.width > rect.x &&
               this.y < rect.y + rect.h &&
               this.y + this.height > rect.y;
    }
    
    _resolveCollisionX(level) {
        const left = Math.floor(this.x / TILE);
        const right = Math.floor((this.x + this.width - 1) / TILE);
        const top = Math.floor(this.y / TILE);
        const bottom = Math.floor((this.y + this.height - 1) / TILE);
        
        for (let ty = top; ty <= bottom; ty++) {
            for (let tx = left; tx <= right; tx++) {
                const tile = level.getTile(tx, ty);
                if (tile === T.WALL || (tile === T.DOOR && !level.isDoorOpen(tx, ty)) || (tile === T.LOCKED_DOOR && !level.isLockedDoorOpen(tx, ty))) {
                    // Push out
                    if (this.vx > 0) {
                        this.x = tx * TILE - this.width;
                    } else if (this.vx < 0) {
                        this.x = (tx + 1) * TILE;
                    }
                    this.vx = 0;
                }
            }
        }
    }
    
    _resolveCollisionY(level, ghosts, particles, sound) {
        const left = Math.floor(this.x / TILE);
        const right = Math.floor((this.x + this.width - 1) / TILE);
        const top = Math.floor(this.y / TILE);
        const bottom = Math.floor((this.y + this.height - 1) / TILE);
        
        for (let ty = top; ty <= bottom; ty++) {
            for (let tx = left; tx <= right; tx++) {
                const tile = level.getTile(tx, ty);
                if (tile === T.WALL || (tile === T.DOOR && !level.isDoorOpen(tx, ty)) || (tile === T.LOCKED_DOOR && !level.isLockedDoorOpen(tx, ty))) {
                    if (this.vy > 0) {
                        this.y = ty * TILE - this.height;
                        this.vy = 0;
                        this.grounded = true;
                    } else if (this.vy < 0) {
                        this.y = (ty + 1) * TILE;
                        this.vy = 0;
                    }
                }
            }
        }
    }
    
    _checkTileInteractions(level, ghosts, particles, sound) {
        const cx = Math.floor((this.x + this.width/2) / TILE);
        const cy = Math.floor((this.y + this.height/2) / TILE);
        
        // Check surrounding tiles
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const tx = cx + dx;
                const ty = cy + dy;
                const tile = level.getTile(tx, ty);
                
                // Spike collision
                if (tile === T.SPIKE) {
                    const spikeRect = { x: tx * TILE + 4, y: ty * TILE + TILE/2, w: TILE - 8, h: TILE/2 };
                    if (this._overlaps(spikeRect)) {
                        this.die(particles, sound);
                        return;
                    }
                }
                
                // Exit
                if (tile === T.EXIT) {
                    const exitRect = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
                    if (this._overlaps(exitRect)) {
                        level.completed = true;
                    }
                }
                
                // Button
                if (tile === T.BUTTON) {
                    const btnRect = { x: tx * TILE, y: ty * TILE + TILE - 8, w: TILE, h: 8 };
                    if (this._overlaps(btnRect)) {
                        if (!level.isButtonPressed(tx, ty)) {
                            sound.button();
                            particles.emit(tx * TILE + TILE/2, ty * TILE + TILE - 4, 8, COLORS.buttonActive, {
                                speed: 2, life: 20
                            });
                        }
                        level.pressButton(tx, ty, 'player');
                        this.pressing = true;
                    }
                }
                
                // Spring
                if (tile === T.SPRING && this.grounded) {
                    const springRect = { x: tx * TILE, y: ty * TILE + TILE/2, w: TILE, h: TILE/2 };
                    if (this._overlaps(springRect)) {
                        this.vy = PLAYER_JUMP * 1.5;
                        this.grounded = false;
                        this.squash = 0.5;
                        this.stretch = 1.5;
                        sound.spring();
                        particles.emit(tx * TILE + TILE/2, ty * TILE + TILE/2, 10, COLORS.spring, {
                            speed: 3, life: 20, spread: Math.PI, angle: -Math.PI/2
                        });
                    }
                }
                
                // Key
                if (tile === T.KEY) {
                    const keyRect = { x: tx * TILE + 4, y: ty * TILE + 4, w: TILE - 8, h: TILE - 8 };
                    if (this._overlaps(keyRect) && !this.hasKey) {
                        this.hasKey = true;
                        level.collectKey(tx, ty);
                        sound.collectKey();
                        particles.emit(tx * TILE + TILE/2, ty * TILE + TILE/2, 15, COLORS.key, {
                            speed: 3, life: 25
                        });
                    }
                }
                
                // Locked Door
                if (tile === T.LOCKED_DOOR && this.hasKey) {
                    const doorRect = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
                    if (this._overlaps(doorRect)) {
                        level.openLockedDoor(tx, ty);
                        this.hasKey = false;
                        sound.unlock();
                        particles.emit(tx * TILE + TILE/2, ty * TILE + TILE/2, 15, COLORS.key, {
                            speed: 2, life: 30
                        });
                    }
                }
                
                // Crumble block
                if (tile === T.CRUMBLE) {
                    const crumbleRect = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
                    if (this.grounded && Math.abs(this.y + this.height - ty * TILE) < 4 && 
                        this.x + this.width > tx * TILE && this.x < (tx + 1) * TILE) {
                        level.startCrumble(tx, ty);
                    }
                }
            }
        }
        
        // Ghost button pressing
        for (const ghost of ghosts) {
            if (!ghost.alive || ghost.finished) continue;
            if (ghost.pressing) {
                const gcx = Math.floor((ghost.x + ghost.width/2) / TILE);
                const gcy = Math.floor((ghost.y + ghost.height/2) / TILE);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const tx = gcx + dx;
                        const ty = gcy + dy;
                        if (level.getTile(tx, ty) === T.BUTTON) {
                            level.pressButton(tx, ty, 'ghost');
                        }
                    }
                }
            }
        }
        
        // Fall off map
        if (this.y > level.height * TILE + 100) {
            this.die(particles, sound);
        }
    }
    
    die(particles, sound) {
        if (!this.alive) return;
        this.alive = false;
        sound.die();
        particles.emit(this.x + this.width/2, this.y + this.height/2, 20, COLORS.player, {
            speed: 4, life: 30, size: 3
        });
        particles.emit(this.x + this.width/2, this.y + this.height/2, 10, COLORS.ghost, {
            speed: 2, life: 40, size: 2
        });
    }
    
    render(ctx, camX, camY) {
        if (!this.alive) return;
        
        const rx = Math.round(this.x - camX);
        const ry = Math.round(this.y - camY);
        
        // Trail
        for (const t of this.trail) {
            ctx.globalAlpha = (t.life / 8) * 0.2;
            ctx.fillStyle = COLORS.player;
            ctx.fillRect(
                Math.round(t.x - camX) - 1,
                Math.round(t.y - camY) - 1,
                3, 3
            );
        }
        ctx.globalAlpha = 1;
        
        // Player glow
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 6;
        
        // Squash/stretch
        const sw = this.width * this.squash;
        const sh = this.height * this.stretch;
        const sox = (this.width - sw) / 2;
        const soy = this.height - sh;
        
        // Body
        ctx.fillStyle = COLORS.player;
        ctx.fillRect(rx + sox, ry + soy + 4, sw, sh - 4);
        
        // Head
        ctx.beginPath();
        ctx.arc(rx + this.width / 2, ry + soy + 6, sw / 2, Math.PI, 0);
        ctx.fill();
        
        // Eyes
        const blinking = this.eyeBlink < 4;
        ctx.fillStyle = '#ffffff';
        const eyeOffset = this.facingRight ? 2 : -2;
        if (blinking) {
            ctx.fillRect(rx + 3 + eyeOffset, ry + soy + 7, 3, 1);
            ctx.fillRect(rx + 8 + eyeOffset, ry + soy + 7, 3, 1);
        } else {
            ctx.fillRect(rx + 3 + eyeOffset, ry + soy + 5, 3, 3);
            ctx.fillRect(rx + 8 + eyeOffset, ry + soy + 5, 3, 3);
            // Pupils
            ctx.fillStyle = '#221100';
            const pupilOff = this.facingRight ? 1 : 0;
            ctx.fillRect(rx + 4 + eyeOffset + pupilOff, ry + soy + 6, 1, 1);
            ctx.fillRect(rx + 9 + eyeOffset + pupilOff, ry + soy + 6, 1, 1);
        }
        
        // Legs (simple animation)
        ctx.fillStyle = COLORS.playerDark;
        if (!this.grounded) {
            // Airborne legs
            ctx.fillRect(rx + sox + 1, ry + soy + sh - 3, 4, 3);
            ctx.fillRect(rx + sox + sw - 5, ry + soy + sh - 3, 4, 3);
        } else if (Math.abs(this.vx) > 0.5) {
            // Running legs
            const legPhase = Math.sin(this.animTimer * 0.5 + this.animFrame);
            ctx.fillRect(rx + sox + 2, ry + soy + sh - 3 + legPhase * 2, 3, 3);
            ctx.fillRect(rx + sox + sw - 5, ry + soy + sh - 3 - legPhase * 2, 3, 3);
        } else {
            // Standing legs
            ctx.fillRect(rx + sox + 2, ry + soy + sh - 2, 3, 2);
            ctx.fillRect(rx + sox + sw - 5, ry + soy + sh - 2, 3, 2);
        }
        
        // Key indicator
        if (this.hasKey) {
            ctx.fillStyle = COLORS.key;
            ctx.shadowColor = COLORS.key;
            ctx.shadowBlur = 6;
            ctx.fillRect(rx + this.width/2 - 2, ry - 6, 4, 4);
            ctx.fillRect(rx + this.width/2 - 1, ry - 3, 2, 3);
        }
        
        ctx.shadowBlur = 0;
    }
}

// ─── LEVEL RUNTIME ───
class LevelRuntime {
    constructor(levelData) {
        this.data = levelData;
        this.width = levelData.width;
        this.height = levelData.height;
        this.grid = levelData.grid.map(row => [...row]); // deep copy
        this.spawnX = levelData.spawnX * TILE;
        this.spawnY = levelData.spawnY * TILE;
        this.completed = false;
        this.targetLoops = levelData.targetLoops || 3;
        this.optimalLoops = levelData.optimalLoops || 2;
        
        // Dynamic state
        this.buttonStates = {};  // "x,y" => { pressed: bool, pressedBy: set }
        this.doorStates = {};    // "x,y" => { open: bool }
        this.crumbleStates = {}; // "x,y" => { timer: int, destroyed: bool }
        this.collectedKeys = new Set(); // "x,y"
        this.openedLockedDoors = new Set(); // "x,y"
        
        // Build button-door mapping
        this.buttonDoorMap = levelData.buttonDoorMap || {};
        
        // Moving platforms
        this.movingPlatforms = (levelData.movingPlatforms || []).map(p => ({
            ...p,
            currentX: p.x,
            currentY: p.y,
            progress: 0,
            direction: 1,
        }));
        
        // Animated tiles
        this.animTimer = 0;
    }
    
    getTile(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return T.WALL;
        const tile = this.grid[y]?.[x];
        
        // Check crumbled
        if (tile === T.CRUMBLE && this.crumbleStates[`${x},${y}`]?.destroyed) return T.EMPTY;
        
        // Check collected keys
        if (tile === T.KEY && this.collectedKeys.has(`${x},${y}`)) return T.EMPTY;
        
        return tile ?? T.EMPTY;
    }
    
    isDoorOpen(x, y) {
        const key = `${x},${y}`;
        return this.doorStates[key]?.open || false;
    }
    
    isLockedDoorOpen(x, y) {
        return this.openedLockedDoors.has(`${x},${y}`);
    }
    
    pressButton(x, y, source) {
        const key = `${x},${y}`;
        if (!this.buttonStates[key]) {
            this.buttonStates[key] = { pressed: false, pressedBy: new Set() };
        }
        this.buttonStates[key].pressedBy.add(source);
        this.buttonStates[key].pressed = true;
        
        // Open linked doors
        const linked = this.buttonDoorMap[key];
        if (linked) {
            for (const doorKey of linked) {
                if (!this.doorStates[doorKey]) this.doorStates[doorKey] = { open: false };
                this.doorStates[doorKey].open = true;
            }
        }
    }
    
    isButtonPressed(x, y) {
        const key = `${x},${y}`;
        return this.buttonStates[key]?.pressed || false;
    }
    
    startCrumble(x, y) {
        const key = `${x},${y}`;
        if (!this.crumbleStates[key]) {
            this.crumbleStates[key] = { timer: 30, destroyed: false };
        }
    }
    
    collectKey(x, y) {
        this.collectedKeys.add(`${x},${y}`);
    }
    
    openLockedDoor(x, y) {
        this.openedLockedDoors.add(`${x},${y}`);
    }
    
    resetDynamicState() {
        // Reset buttons (they need to be re-pressed each loop)
        this.buttonStates = {};
        this.doorStates = {};
        this.crumbleStates = {};
        this.collectedKeys = new Set();
        this.openedLockedDoors = new Set();
        this.completed = false;
        
        // Reset grid
        this.grid = this.data.grid.map(row => [...row]);
        
        // Reset moving platforms
        this.movingPlatforms = (this.data.movingPlatforms || []).map(p => ({
            ...p,
            currentX: p.x,
            currentY: p.y,
            progress: 0,
            direction: 1,
        }));
    }
    
    update(particles) {
        this.animTimer++;
        
        // Update crumble timers
        for (const key in this.crumbleStates) {
            const state = this.crumbleStates[key];
            if (!state.destroyed) {
                state.timer--;
                if (state.timer <= 0) {
                    state.destroyed = true;
                    const [x, y] = key.split(',').map(Number);
                    particles.emit(x * TILE + TILE/2, y * TILE + TILE/2, 12, COLORS.crumble, {
                        speed: 3, life: 20, size: 3
                    });
                }
            }
        }
        
        // Update moving platforms
        for (const p of this.movingPlatforms) {
            p.progress += p.speed || 0.01;
            const t = (Math.sin(p.progress) + 1) / 2;
            p.currentX = p.x + (p.endX - p.x) * t;
            p.currentY = p.y + (p.endY - p.y) * t;
        }
        
        // Reset button states each frame (they're only active while pressed)
        for (const key in this.buttonStates) {
            this.buttonStates[key].pressed = false;
            this.buttonStates[key].pressedBy.clear();
        }
        // Doors close when buttons not pressed
        for (const key in this.doorStates) {
            this.doorStates[key].open = false;
        }
    }
    
    render(ctx, camX, camY, canvasWidth, canvasHeight) {
        // Determine visible tile range
        const startTX = Math.max(0, Math.floor(camX / TILE) - 1);
        const startTY = Math.max(0, Math.floor(camY / TILE) - 1);
        const endTX = Math.min(this.width, Math.ceil((camX + canvasWidth) / TILE) + 1);
        const endTY = Math.min(this.height, Math.ceil((camY + canvasHeight) / TILE) + 1);
        
        for (let ty = startTY; ty < endTY; ty++) {
            for (let tx = startTX; tx < endTX; tx++) {
                const tile = this.getTile(tx, ty);
                const rx = Math.round(tx * TILE - camX);
                const ry = Math.round(ty * TILE - camY);
                
                this._renderTile(ctx, tile, tx, ty, rx, ry);
            }
        }
        
        // Render moving platforms
        for (const p of this.movingPlatforms) {
            const rx = Math.round(p.currentX * TILE - camX);
            const ry = Math.round(p.currentY * TILE - camY);
            ctx.fillStyle = COLORS.movingPlat;
            ctx.fillRect(rx, ry, TILE * (p.w || 1), TILE * 0.6);
            ctx.fillStyle = COLORS.wallHighlight;
            ctx.fillRect(rx, ry, TILE * (p.w || 1), 2);
        }
    }
    
    _renderTile(ctx, tile, tx, ty, rx, ry) {
        switch (tile) {
            case T.WALL:
                // Main wall
                ctx.fillStyle = COLORS.wall;
                ctx.fillRect(rx, ry, TILE, TILE);
                // Top highlight
                ctx.fillStyle = COLORS.wallHighlight;
                ctx.fillRect(rx, ry, TILE, 2);
                // Left highlight
                ctx.fillRect(rx, ry, 2, TILE);
                // Bottom shadow
                ctx.fillStyle = COLORS.wallShadow;
                ctx.fillRect(rx, ry + TILE - 2, TILE, 2);
                // Inner detail
                ctx.fillStyle = COLORS.wallShadow;
                ctx.fillRect(rx + 8, ry + 8, TILE - 16, 1);
                ctx.fillRect(rx + TILE/2, ry + 4, 1, TILE - 8);
                break;
                
            case T.SPIKE:
                // Spike triangles
                ctx.fillStyle = COLORS.spike;
                ctx.shadowColor = COLORS.spike;
                ctx.shadowBlur = 4;
                for (let i = 0; i < 4; i++) {
                    const sx = rx + i * 8;
                    ctx.beginPath();
                    ctx.moveTo(sx, ry + TILE);
                    ctx.lineTo(sx + 4, ry + TILE/2);
                    ctx.lineTo(sx + 8, ry + TILE);
                    ctx.fill();
                }
                ctx.shadowBlur = 0;
                break;
                
            case T.EXIT:
                // Exit portal
                const exitPulse = Math.sin(this.animTimer * 0.05) * 0.3 + 0.7;
                ctx.globalAlpha = exitPulse;
                ctx.fillStyle = COLORS.exit;
                ctx.shadowColor = COLORS.exit;
                ctx.shadowBlur = 15;
                ctx.fillRect(rx + 4, ry + 2, TILE - 8, TILE - 4);
                ctx.shadowBlur = 0;
                // Inner glow
                ctx.fillStyle = '#88ffbb';
                ctx.fillRect(rx + 8, ry + 6, TILE - 16, TILE - 12);
                // Arrow up
                ctx.fillStyle = '#ffffff';
                const arrowY = Math.sin(this.animTimer * 0.08) * 3;
                ctx.beginPath();
                ctx.moveTo(rx + TILE/2, ry + 8 + arrowY);
                ctx.lineTo(rx + TILE/2 - 5, ry + 16 + arrowY);
                ctx.lineTo(rx + TILE/2 + 5, ry + 16 + arrowY);
                ctx.fill();
                ctx.globalAlpha = 1;
                break;
                
            case T.BUTTON: {
                const key = `${tx},${ty}`;
                const pressed = this.buttonStates[key]?.pressed;
                ctx.fillStyle = pressed ? COLORS.buttonActive : COLORS.button;
                ctx.shadowColor = pressed ? COLORS.buttonActive : COLORS.button;
                ctx.shadowBlur = pressed ? 8 : 4;
                // Base
                ctx.fillRect(rx + 4, ry + TILE - 6, TILE - 8, 6);
                // Button top
                const btnTop = pressed ? TILE - 6 : TILE - 10;
                ctx.fillRect(rx + 6, ry + btnTop, TILE - 12, 4);
                ctx.shadowBlur = 0;
                break;
            }
                
            case T.DOOR: {
                const key = `${tx},${ty}`;
                const open = this.doorStates[key]?.open;
                if (!open) {
                    ctx.fillStyle = COLORS.door;
                    ctx.fillRect(rx + 2, ry, TILE - 4, TILE);
                    // Bars
                    ctx.fillStyle = COLORS.wallHighlight;
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(rx + 6 + i * 8, ry, 2, TILE);
                    }
                    // Glow edges
                    ctx.fillStyle = COLORS.ghost;
                    ctx.globalAlpha = 0.3;
                    ctx.fillRect(rx + 1, ry, 1, TILE);
                    ctx.fillRect(rx + TILE - 2, ry, 1, TILE);
                    ctx.globalAlpha = 1;
                } else {
                    // Open door - faded
                    ctx.globalAlpha = 0.15;
                    ctx.fillStyle = COLORS.door;
                    ctx.fillRect(rx + 2, ry, TILE - 4, TILE);
                    ctx.globalAlpha = 1;
                }
                break;
            }
                
            case T.CRUMBLE: {
                const key = `${tx},${ty}`;
                const state = this.crumbleStates[key];
                if (state && !state.destroyed) {
                    // Shaking crumble block
                    const shake = Math.sin(state.timer * 0.5) * 2;
                    ctx.fillStyle = state.timer < 15 ? COLORS.crumbleWarn : COLORS.crumble;
                    ctx.fillRect(rx + shake, ry, TILE, TILE);
                    // Cracks
                    ctx.strokeStyle = COLORS.wallShadow;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(rx + 8 + shake, ry);
                    ctx.lineTo(rx + 12 + shake, ry + TILE/2);
                    ctx.lineTo(rx + 20 + shake, ry + TILE);
                    ctx.stroke();
                } else if (!state) {
                    ctx.fillStyle = COLORS.crumble;
                    ctx.fillRect(rx, ry, TILE, TILE);
                    // Subtle crack pattern
                    ctx.strokeStyle = '#443322';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(rx + 8, ry);
                    ctx.lineTo(rx + 12, ry + TILE/2);
                    ctx.lineTo(rx + 20, ry + TILE);
                    ctx.stroke();
                }
                break;
            }
                
            case T.SPRING:
                // Spring base
                ctx.fillStyle = COLORS.springBase;
                ctx.fillRect(rx + 4, ry + TILE - 8, TILE - 8, 8);
                // Spring coil
                ctx.fillStyle = COLORS.spring;
                ctx.shadowColor = COLORS.spring;
                ctx.shadowBlur = 4;
                const springY = ry + TILE/2;
                ctx.fillRect(rx + 2, springY, TILE - 4, 4);
                // Zigzag
                ctx.strokeStyle = COLORS.spring;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(rx + 6, springY + 4);
                ctx.lineTo(rx + 10, ry + TILE - 8);
                ctx.lineTo(rx + 14, springY + 4);
                ctx.lineTo(rx + 18, ry + TILE - 8);
                ctx.lineTo(rx + 22, springY + 4);
                ctx.lineTo(rx + 26, ry + TILE - 8);
                ctx.stroke();
                ctx.shadowBlur = 0;
                break;
                
            case T.KEY: {
                const keyKey = `${tx},${ty}`;
                if (!this.collectedKeys.has(keyKey)) {
                    const keyBob = Math.sin(this.animTimer * 0.06) * 3;
                    ctx.fillStyle = COLORS.key;
                    ctx.shadowColor = COLORS.key;
                    ctx.shadowBlur = 8;
                    // Key head (circle)
                    ctx.beginPath();
                    ctx.arc(rx + TILE/2, ry + TILE/2 - 4 + keyBob, 6, 0, Math.PI * 2);
                    ctx.fill();
                    // Key shaft
                    ctx.fillRect(rx + TILE/2 - 1.5, ry + TILE/2 + keyBob, 3, 10);
                    // Key teeth
                    ctx.fillRect(rx + TILE/2 + 1, ry + TILE/2 + 6 + keyBob, 4, 2);
                    ctx.fillRect(rx + TILE/2 + 1, ry + TILE/2 + 2 + keyBob, 3, 2);
                    ctx.shadowBlur = 0;
                }
                break;
            }
                
            case T.LOCKED_DOOR: {
                const ldKey = `${tx},${ty}`;
                if (!this.openedLockedDoors.has(ldKey)) {
                    ctx.fillStyle = COLORS.lockedDoor;
                    ctx.fillRect(rx + 2, ry, TILE - 4, TILE);
                    // Lock icon
                    ctx.fillStyle = COLORS.key;
                    ctx.beginPath();
                    ctx.arc(rx + TILE/2, ry + TILE/2 - 2, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillRect(rx + TILE/2 - 4, ry + TILE/2 + 2, 8, 8);
                    // Keyhole
                    ctx.fillStyle = COLORS.lockedDoor;
                    ctx.fillRect(rx + TILE/2 - 1, ry + TILE/2 + 4, 2, 4);
                } else {
                    ctx.globalAlpha = 0.1;
                    ctx.fillStyle = COLORS.lockedDoor;
                    ctx.fillRect(rx + 2, ry, TILE - 4, TILE);
                    ctx.globalAlpha = 1;
                }
                break;
            }
                
            case T.GHOST_BLOCK: {
                // Ghost block - only visible, styled differently
                const gbPulse = Math.sin(this.animTimer * 0.04) * 0.15 + 0.3;
                ctx.globalAlpha = gbPulse;
                ctx.fillStyle = COLORS.ghostBlock;
                ctx.fillRect(rx, ry, TILE, TILE);
                ctx.strokeStyle = COLORS.ghostBlockActive;
                ctx.lineWidth = 1;
                ctx.strokeRect(rx + 1, ry + 1, TILE - 2, TILE - 2);
                // Dashed pattern
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(rx + 4, ry + 4, TILE - 8, TILE - 8);
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
                break;
            }
        }
    }
}

// ─── CAMERA ───
class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.smoothing = 0.08;
        this.shakeAmount = 0;
        this.shakeDecay = 0.9;
    }
    
    follow(targetX, targetY, levelWidth, levelHeight) {
        this.targetX = targetX - this.canvasWidth / 2;
        this.targetY = targetY - this.canvasHeight / 2;
        
        // Clamp to level bounds
        const maxX = levelWidth * TILE - this.canvasWidth;
        const maxY = levelHeight * TILE - this.canvasHeight;
        this.targetX = Math.max(0, Math.min(this.targetX, maxX));
        this.targetY = Math.max(0, Math.min(this.targetY, maxY));
        
        // Smooth follow
        this.x += (this.targetX - this.x) * this.smoothing;
        this.y += (this.targetY - this.y) * this.smoothing;
        
        // Screen shake
        if (this.shakeAmount > 0.5) {
            this.x += (Math.random() - 0.5) * this.shakeAmount;
            this.y += (Math.random() - 0.5) * this.shakeAmount;
            this.shakeAmount *= this.shakeDecay;
        } else {
            this.shakeAmount = 0;
        }
    }
    
    shake(amount) {
        this.shakeAmount = amount;
    }
    
    resize(w, h) {
        this.canvasWidth = w;
        this.canvasHeight = h;
    }
}

// ─── BACKGROUND RENDERER ───
class BackgroundRenderer {
    constructor() {
        this.stars = [];
        for (let i = 0; i < 80; i++) {
            this.stars.push({
                x: Math.random(),
                y: Math.random(),
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.0002 + 0.0001,
                brightness: Math.random() * 0.5 + 0.2,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }
    
    render(ctx, w, h, camX, camY, time) {
        // Gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, COLORS.bgGrad1);
        grad.addColorStop(1, COLORS.bgGrad2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        // Stars / particles
        for (const star of this.stars) {
            const px = ((star.x * w - camX * 0.05) % w + w) % w;
            const py = ((star.y * h - camY * 0.03) % h + h) % h;
            const twinkle = Math.sin(time * star.speed * 100 + star.phase) * 0.3 + 0.7;
            ctx.globalAlpha = star.brightness * twinkle;
            ctx.fillStyle = COLORS.ghost;
            ctx.fillRect(Math.round(px), Math.round(py), star.size, star.size);
        }
        ctx.globalAlpha = 1;
    }
}

// Export all for use in game.js
window.ENGINE = {
    TILE, GRAVITY, MAX_FALL, PLAYER_SPEED, PLAYER_JUMP, T, COLORS,
    GHOST_ALPHA_BASE, GHOST_ALPHA_DECAY,
    InputManager, ParticleSystem, SoundEngine,
    GhostRecorder, Ghost, Player, LevelRuntime,
    Camera, BackgroundRenderer,
};
