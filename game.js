/* ============================================
   DÉJÀ VU LOOP — Main Game Controller
   State machine, game loop, ghost management,
   UI integration, save/load.
   ============================================ */

(function() {
    'use strict';
    
    const {
        TILE, T, COLORS, GHOST_ALPHA_BASE, GHOST_ALPHA_DECAY,
        InputManager, ParticleSystem, SoundEngine,
        GhostRecorder, Ghost, Player, LevelRuntime,
        Camera, BackgroundRenderer,
    } = window.ENGINE;
    
    // ─── GAME STATE ───
    const STATE = {
        TITLE: 'title',
        PLAYING: 'playing',
        LOOP_TRANSITION: 'loop_transition',
        LEVEL_COMPLETE: 'level_complete',
        LEVEL_SELECT: 'level_select',
    };
    
    // ─── CANVAS SETUP ───
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    let _camera = null; // forward reference for resize handler
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (_camera) {
            _camera.resize(canvas.width, canvas.height);
        }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    
    // ─── DOM ELEMENTS ───
    const titleScreen = document.getElementById('titleScreen');
    const startBtn = document.getElementById('startBtn');
    const levelComplete = document.getElementById('levelComplete');
    const nextLevelBtn = document.getElementById('nextLevelBtn');
    const loopOverlay = document.getElementById('loopOverlay');
    const loopTitle = document.getElementById('loopTitle');
    const hud = document.getElementById('hud');
    const hudLevel = document.getElementById('hudLevel');
    const hudWorld = document.getElementById('hudWorld');
    const hudLoops = document.getElementById('hudLoops');
    const starsContainer = document.getElementById('starsContainer');
    const loopCountDisplay = document.getElementById('loopCountDisplay');
    const restartBtn = document.getElementById('restartBtn');
    const menuBtn = document.getElementById('menuBtn');
    const levelSelect = document.getElementById('levelSelect');
    const levelGrid = document.getElementById('levelGrid');
    const backToMenuBtn = document.getElementById('backToMenuBtn');
    
    // Generate title particles
    const titleParticles = document.getElementById('titleParticles');
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (8 + Math.random() * 12) + 's';
        p.style.animationDelay = (Math.random() * 10) + 's';
        p.style.width = (1 + Math.random() * 3) + 'px';
        p.style.height = p.style.width;
        titleParticles.appendChild(p);
    }
    
    // ─── GAME OBJECT ───
    const game = {
        state: STATE.TITLE,
        currentLevel: 0,
        loopCount: 1,
        
        // Core systems
        input: new InputManager(),
        particles: new ParticleSystem(),
        sound: new SoundEngine(),
        bg: new BackgroundRenderer(),
        camera: new Camera(canvas.width, canvas.height),
        
        // Per-level
        level: null,
        player: null,
        ghosts: [],
        ghostRecordings: [],
        recorder: new GhostRecorder(),
        
        // Transition
        transitionTimer: 0,
        
        // Save
        progress: loadProgress(),
        
        // Frame counter
        frameCount: 0,
        
        // Hint system
        hintText: '',
        hintAlpha: 0,
        hintShown: false,
    };
    _camera = game.camera; // link forward reference for resize handler
    
    // ─── SAVE / LOAD ───
    function loadProgress() {
        try {
            const data = JSON.parse(localStorage.getItem('dejavuloop_progress'));
            return data || { unlockedLevel: 0, levelStars: {} };
        } catch {
            return { unlockedLevel: 0, levelStars: {} };
        }
    }
    
    function saveProgress() {
        try {
            localStorage.setItem('dejavuloop_progress', JSON.stringify(game.progress));
        } catch {}
    }
    
    // ─── LEVEL MANAGEMENT ───
    function loadLevel(index) {
        if (index >= LEVELS.length) {
            // Beat the game - go back to title
            showTitle();
            return;
        }
        
        const levelData = LEVELS[index];
        game.currentLevel = index;
        game.loopCount = 1;
        game.level = new LevelRuntime(levelData);
        game.player = new Player(game.level.spawnX, game.level.spawnY);
        game.ghosts = [];
        game.ghostRecordings = [];
        game.recorder = new GhostRecorder();
        game.recorder.start();
        game.particles.clear();
        game.hintShown = false;
        game.hintAlpha = 0;
        game.hintText = levelData.hint || '';
        
        // Camera snap to player
        game.camera.x = game.player.x - canvas.width / 2;
        game.camera.y = game.player.y - canvas.height / 2;
        
        // Update HUD
        hudLevel.textContent = `Level ${index + 1}`;
        hudWorld.textContent = levelData.world;
        hudLoops.textContent = `Loop 1`;
        
        game.state = STATE.PLAYING;
        hud.classList.add('visible');
        titleScreen.classList.remove('active');
        levelComplete.classList.remove('active');
        loopOverlay.classList.remove('active');
        levelSelect.classList.remove('active');
    }
    
    function restartLoop() {
        // Save current recording
        const recording = game.recorder.stop();
        if (recording.length > 10) {
            game.ghostRecordings.push(recording);
        }
        
        game.loopCount++;
        
        // Create ghosts from all recordings
        game.ghosts = game.ghostRecordings.map((frames, i) => {
            return new Ghost(frames, game.ghostRecordings.length - 1 - i);
        });
        
        // Reset level dynamic state
        game.level.resetDynamicState();
        
        // Reset player
        game.player.reset(game.level.spawnX, game.level.spawnY);
        game.particles.clear();
        
        // Start new recording
        game.recorder = new GhostRecorder();
        game.recorder.start();
        
        // Update HUD
        hudLoops.textContent = `Loop ${game.loopCount}`;
        
        game.sound.loopRestart();
    }
    
    function showLoopTransition() {
        game.state = STATE.LOOP_TRANSITION;
        loopTitle.textContent = `Loop ${game.loopCount + 1}`;
        loopOverlay.classList.add('active');
        game.transitionTimer = 90; // frames (~1.5 seconds)
        
        game.camera.shake(8);
    }
    
    function showLevelComplete() {
        game.state = STATE.LEVEL_COMPLETE;
        game.sound.complete();
        
        const loops = game.loopCount;
        const level = game.level;
        
        // Calculate stars
        let stars = 1;
        if (loops <= level.targetLoops) stars = 2;
        if (loops <= level.optimalLoops) stars = 3;
        
        // Update progress
        const prevStars = game.progress.levelStars[game.currentLevel] || 0;
        if (stars > prevStars) {
            game.progress.levelStars[game.currentLevel] = stars;
        }
        if (game.currentLevel >= game.progress.unlockedLevel) {
            game.progress.unlockedLevel = game.currentLevel + 1;
        }
        saveProgress();
        
        // Show UI
        loopCountDisplay.textContent = `Loops used: ${loops} (Target: ${level.targetLoops} | Optimal: ${level.optimalLoops})`;
        
        const starElements = starsContainer.querySelectorAll('.star');
        starElements.forEach((s, i) => {
            s.classList.remove('earned');
            if (i < stars) {
                setTimeout(() => s.classList.add('earned'), i * 200 + 300);
            }
        });
        
        levelComplete.classList.add('active');
        hud.classList.remove('visible');
        
        // Celebration particles
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                game.particles.emit(
                    game.player.x + Math.random() * 100 - 50,
                    game.player.y + Math.random() * 50 - 25,
                    15, 
                    ['#ff3355', '#33ff88', '#4de8ff', '#ffaa33', '#ffd700'][i % 5],
                    { speed: 4, life: 40, size: 3 }
                );
            }, i * 150);
        }
    }
    
    function showTitle() {
        game.state = STATE.TITLE;
        titleScreen.classList.add('active');
        hud.classList.remove('visible');
        levelComplete.classList.remove('active');
        loopOverlay.classList.remove('active');
        levelSelect.classList.remove('active');
    }
    
    function showLevelSelect() {
        game.state = STATE.LEVEL_SELECT;
        levelSelect.classList.add('active');
        titleScreen.classList.remove('active');
        hud.classList.remove('visible');
        
        // Build level grid
        levelGrid.innerHTML = '';
        LEVELS.forEach((lvl, i) => {
            const tile = document.createElement('div');
            tile.className = 'level-tile';
            
            const isUnlocked = i <= game.progress.unlockedLevel;
            const stars = game.progress.levelStars[i] || 0;
            const isCurrent = i === game.currentLevel;
            
            if (!isUnlocked) tile.classList.add('locked');
            if (stars > 0) tile.classList.add('completed');
            if (isCurrent) tile.classList.add('current');
            
            if (isUnlocked) {
                const num = document.createElement('div');
                num.className = 'level-number';
                num.textContent = i + 1;
                tile.appendChild(num);
                
                if (stars > 0) {
                    const starsDiv = document.createElement('div');
                    starsDiv.className = 'level-stars';
                    starsDiv.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
                    tile.appendChild(starsDiv);
                }
                
                tile.addEventListener('click', () => {
                    loadLevel(i);
                });
            } else {
                const lock = document.createElement('div');
                lock.className = 'level-locked-icon';
                lock.textContent = '🔒';
                tile.appendChild(lock);
            }
            
            levelGrid.appendChild(tile);
        });
    }
    
    // ─── UI EVENT LISTENERS ───
    startBtn.addEventListener('click', () => {
        game.sound.resume();
        // If player has progress, show level select; otherwise start level 1
        if (game.progress.unlockedLevel > 0) {
            showLevelSelect();
        } else {
            loadLevel(0);
        }
    });
    
    nextLevelBtn.addEventListener('click', () => {
        loadLevel(game.currentLevel + 1);
    });
    
    restartBtn.addEventListener('click', () => {
        loadLevel(game.currentLevel);
    });
    
    menuBtn.addEventListener('click', () => {
        showLevelSelect();
    });
    
    backToMenuBtn.addEventListener('click', () => {
        showTitle();
    });
    
    // ─── MOBILE TOUCH CONTROLS ───
    function createMobileControls() {
        // Only show on touch devices
        if (!('ontouchstart' in window)) return;
        
        const controls = document.createElement('div');
        controls.id = 'mobileControls';
        controls.style.cssText = `
            position: fixed; bottom: 0; left: 0; width: 100%; 
            padding: 15px; display: flex; justify-content: space-between;
            z-index: 60; pointer-events: none;
        `;
        
        const btnStyle = `
            width: 60px; height: 60px; border-radius: 50%;
            background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
            color: rgba(255,255,255,0.5); font-size: 1.5rem;
            display: flex; align-items: center; justify-content: center;
            pointer-events: all; user-select: none; -webkit-user-select: none;
        `;
        
        const leftGroup = document.createElement('div');
        leftGroup.style.cssText = 'display: flex; gap: 10px;';
        
        const leftBtn = document.createElement('div');
        leftBtn.style.cssText = btnStyle;
        leftBtn.textContent = '←';
        leftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); game.input.touchLeft = true; });
        leftBtn.addEventListener('touchend', (e) => { e.preventDefault(); game.input.touchLeft = false; });
        
        const rightBtn = document.createElement('div');
        rightBtn.style.cssText = btnStyle;
        rightBtn.textContent = '→';
        rightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); game.input.touchRight = true; });
        rightBtn.addEventListener('touchend', (e) => { e.preventDefault(); game.input.touchRight = false; });
        
        leftGroup.appendChild(leftBtn);
        leftGroup.appendChild(rightBtn);
        
        const rightGroup = document.createElement('div');
        rightGroup.style.cssText = 'display: flex; gap: 10px;';
        
        const jumpBtn = document.createElement('div');
        jumpBtn.style.cssText = btnStyle + 'width: 70px; height: 70px; font-size: 1.2rem;';
        jumpBtn.textContent = 'Jump';
        jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); game.input.touchJump = true; });
        
        const restartTouchBtn = document.createElement('div');
        restartTouchBtn.style.cssText = btnStyle + 'width: 45px; height: 45px; font-size: 0.9rem;';
        restartTouchBtn.textContent = '↺';
        restartTouchBtn.addEventListener('touchstart', (e) => { e.preventDefault(); game.input.touchRestart = true; });
        
        rightGroup.appendChild(restartTouchBtn);
        rightGroup.appendChild(jumpBtn);
        
        controls.appendChild(leftGroup);
        controls.appendChild(rightGroup);
        document.body.appendChild(controls);
    }
    createMobileControls();
    
    // ─── MAIN GAME LOOP ───
    function update() {
        game.frameCount++;
        game.input.update();
        
        switch (game.state) {
            case STATE.TITLE:
                updateTitle();
                break;
            case STATE.PLAYING:
                updatePlaying();
                break;
            case STATE.LOOP_TRANSITION:
                updateLoopTransition();
                break;
            case STATE.LEVEL_COMPLETE:
                updateLevelComplete();
                break;
            case STATE.LEVEL_SELECT:
                // Just render background
                break;
        }
    }
    
    function updateTitle() {
        // Animated background
    }
    
    function updatePlaying() {
        const { player, level, ghosts, particles, input, sound, recorder, camera } = game;
        
        // Update level (crumble timers, moving platforms, etc.)
        level.update(particles);
        
        // Update ghosts
        for (const ghost of ghosts) {
            ghost.update();
            
            // Ghost button interactions
            if (ghost.alive && !ghost.finished && ghost.pressing) {
                const gcx = Math.floor((ghost.x + ghost.width / 2) / TILE);
                const gcy = Math.floor((ghost.y + ghost.height / 2) / TILE);
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const tx = gcx + dx;
                        const ty = gcy + dy;
                        if (level.getTile(tx, ty) === T.BUTTON) {
                            level.pressButton(tx, ty, `ghost_${ghost.index}`);
                        }
                    }
                }
            }
        }
        
        // Update player
        player.update(input, level, ghosts, particles, sound);
        
        // Record player state
        recorder.record(player.getState());
        
        // Camera follow
        if (player.alive) {
            camera.follow(
                player.x + player.width / 2,
                player.y + player.height / 2,
                level.width, level.height
            );
        }
        
        // Particles
        particles.update();
        
        // Check death → loop transition
        if (!player.alive) {
            showLoopTransition();
        }
        
        // Check level complete
        if (level.completed) {
            showLevelComplete();
        }
        
        // Manual restart
        if (input.wasJustPressed('restart')) {
            player.die(particles, sound);
        }
        
        // Hint display
        if (!game.hintShown && game.hintText && game.frameCount > 60) {
            game.hintAlpha = Math.min(1, game.hintAlpha + 0.02);
            if (game.frameCount > 300) {
                game.hintAlpha = Math.max(0, game.hintAlpha - 0.01);
                if (game.hintAlpha <= 0) game.hintShown = true;
            }
        }
    }
    
    function updateLoopTransition() {
        game.transitionTimer--;
        game.particles.update();
        
        if (game.transitionTimer <= 0) {
            loopOverlay.classList.remove('active');
            restartLoop();
            game.state = STATE.PLAYING;
        }
    }
    
    function updateLevelComplete() {
        game.particles.update();
        // Keep ghosts animating for visual effect
        for (const ghost of game.ghosts) {
            ghost.update();
        }
    }
    
    // ─── RENDER ───
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const { camera, bg } = game;
        
        // Background (always renders)
        bg.render(ctx, canvas.width, canvas.height, camera.x, camera.y, game.frameCount);
        
        switch (game.state) {
            case STATE.PLAYING:
            case STATE.LOOP_TRANSITION:
            case STATE.LEVEL_COMPLETE:
                renderGameplay();
                break;
            case STATE.TITLE:
            case STATE.LEVEL_SELECT:
                // Background only (UI overlays handle the rest)
                break;
        }
    }
    
    function renderGameplay() {
        const { level, player, ghosts, particles, camera } = game;
        
        if (!level) return;
        
        // Level tiles
        level.render(ctx, camera.x, camera.y, canvas.width, canvas.height);
        
        // Ghosts (render oldest first so newest are on top)
        for (let i = ghosts.length - 1; i >= 0; i--) {
            const ghost = ghosts[i];
            const alpha = Math.max(0.08, GHOST_ALPHA_BASE - ghost.index * GHOST_ALPHA_DECAY);
            ghost.render(ctx, camera.x, camera.y, alpha);
        }
        
        // Player
        player.render(ctx, camera.x, camera.y);
        
        // Particles
        particles.render(ctx, camera.x, camera.y);
        
        // Ghost count indicator
        if (ghosts.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.fillStyle = COLORS.ghost;
            ctx.font = '10px Orbitron, sans-serif';
            ctx.textAlign = 'left';
            const ghostText = `${ghosts.length} echo${ghosts.length > 1 ? 's' : ''}`;
            ctx.fillText(ghostText, 10, canvas.height - 10);
            ctx.restore();
        }
        
        // Hint text
        if (game.hintAlpha > 0 && game.hintText) {
            ctx.save();
            ctx.globalAlpha = game.hintAlpha * 0.7;
            ctx.fillStyle = COLORS.text;
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(game.hintText, canvas.width / 2, canvas.height - 40);
            ctx.restore();
        }
    }
    
    // ─── GAME LOOP ───
    function gameLoop() {
        update();
        render();
        requestAnimationFrame(gameLoop);
    }
    
    // Start
    gameLoop();
    
})();
