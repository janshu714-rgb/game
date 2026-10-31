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
    
    function isTouchDevice() {
        return ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0) ||
               window.matchMedia('(pointer: coarse)').matches ||
               window.innerWidth <= 900;
    }
    
    function updateTouchMode() {
        if (isTouchDevice()) {
            document.body.classList.add('is-touch');
        } else {
            document.body.classList.remove('is-touch');
        }
    }
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        updateTouchMode();
        if (_camera) {
            _camera.resize(canvas.width, canvas.height);
            if (typeof game !== 'undefined' && game.level) {
                _camera.updateViewport(game.level.width, game.level.height, isTouchDevice());
            }
        }
    }
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => {
        setTimeout(resizeCanvas, 100);
    });
    updateTouchMode();
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
    
    // Mobile Gamepad Controls DOM
    const mobileControls = document.getElementById('mobileControls');
    const touchBtnLeft = document.getElementById('touchBtnLeft');
    const touchBtnRight = document.getElementById('touchBtnRight');
    const touchBtnJump = document.getElementById('touchBtnJump');
    const touchBtnRewind = document.getElementById('touchBtnRewind');
    const touchBtnInteract = document.getElementById('touchBtnInteract');
    
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
        
        // Camera snap to player with responsive viewport
        game.camera.updateViewport(levelData.width, levelData.height, isTouchDevice());
        game.camera.follow(
            game.player.x + game.player.width / 2,
            game.player.y + game.player.height / 2,
            levelData.width,
            levelData.height,
            isTouchDevice()
        );
        game.camera.x = game.camera.targetX;
        game.camera.y = game.camera.targetY;
        
        // Update HUD
        hudLevel.textContent = `Level ${index + 1}`;
        hudWorld.textContent = levelData.world;
        hudLoops.textContent = `Loop 1`;
        
        game.state = STATE.PLAYING;
        hud.classList.add('visible');
        if (mobileControls) mobileControls.classList.add('visible');
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
        if (mobileControls) mobileControls.classList.remove('visible');
        
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
        if (mobileControls) mobileControls.classList.remove('visible');
        levelComplete.classList.remove('active');
        loopOverlay.classList.remove('active');
        levelSelect.classList.remove('active');
    }
    
    function showLevelSelect() {
        game.state = STATE.LEVEL_SELECT;
        levelSelect.classList.add('active');
        titleScreen.classList.remove('active');
        hud.classList.remove('visible');
        if (mobileControls) mobileControls.classList.remove('visible');
        
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
    function startGame() {
        game.sound.resume();
        if (game.progress.unlockedLevel > 0) {
            showLevelSelect();
        } else {
            loadLevel(0);
        }
    }
    startBtn.addEventListener('click', startGame);
    startBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        startGame();
    });
    
    nextLevelBtn.addEventListener('click', () => {
        game.sound.resume();
        loadLevel(game.currentLevel + 1);
    });
    
    restartBtn.addEventListener('click', () => {
        game.sound.resume();
        loadLevel(game.currentLevel);
    });
    
    menuBtn.addEventListener('click', () => {
        game.sound.resume();
        showLevelSelect();
    });
    
    backToMenuBtn.addEventListener('click', () => {
        game.sound.resume();
        showTitle();
    });
    
    // ─── MOBILE TOUCH CONTROLS SETUP ───
    function setupMobileControls() {
        function bindTouchBtn(btn, action) {
            if (!btn) return;
            
            let isDown = false;
            
            const handleStart = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                game.sound.resume();
                if (!isDown) {
                    isDown = true;
                    btn.classList.add('pressed');
                    game.input.setTouch(action, true);
                    if (action === 'jump' && navigator.vibrate) {
                        try { navigator.vibrate(12); } catch (err) {}
                    }
                }
            };
            
            const handleEnd = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                if (isDown) {
                    isDown = false;
                    btn.classList.remove('pressed');
                    game.input.setTouch(action, false);
                }
            };
            
            // Pointer events with capture
            btn.addEventListener('pointerdown', (e) => {
                handleStart(e);
                try { btn.setPointerCapture(e.pointerId); } catch(err) {}
            });
            btn.addEventListener('pointerup', (e) => {
                handleEnd(e);
                try { btn.releasePointerCapture(e.pointerId); } catch(err) {}
            });
            btn.addEventListener('pointercancel', (e) => {
                handleEnd(e);
                try { btn.releasePointerCapture(e.pointerId); } catch(err) {}
            });
            
            // Touch events
            btn.addEventListener('touchstart', handleStart, { passive: false });
            btn.addEventListener('touchend', handleEnd, { passive: false });
            btn.addEventListener('touchcancel', handleEnd, { passive: false });
            
            // Mouse events
            btn.addEventListener('mousedown', handleStart);
            btn.addEventListener('mouseup', handleEnd);
            btn.addEventListener('mouseleave', handleEnd);
            
            // Click fallback for assistive tap or synthetic clicks
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                game.sound.resume();
                game.input.triggerTap(action);
            });
        }
        
        bindTouchBtn(touchBtnLeft, 'left');
        bindTouchBtn(touchBtnRight, 'right');
        bindTouchBtn(touchBtnJump, 'jump');
        bindTouchBtn(touchBtnRewind, 'restart');
        bindTouchBtn(touchBtnInteract, 'interact');
        
        // Canvas touch tap to jump
        canvas.addEventListener('pointerdown', (e) => {
            game.sound.resume();
            if (game.state === STATE.PLAYING && isTouchDevice()) {
                const rect = canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                // If tapped on the right side of the screen within the game viewport
                if (clickX > rect.width * 0.45 && clickY < game.camera.viewportH) {
                    game.input.triggerTap('jump');
                }
            }
        });
    }
    setupMobileControls();
    
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
                level.width,
                level.height,
                isTouchDevice()
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
        
        ctx.save();
        ctx.translate(Math.round(camera.screenOffsetX), Math.round(camera.screenOffsetY));
        ctx.scale(camera.zoom, camera.zoom);
        
        // Level tiles
        level.render(ctx, camera.x, camera.y, camera.viewportW / camera.zoom, camera.viewportH / camera.zoom);
        
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
        
        ctx.restore();
        
        // Ghost count indicator
        if (ghosts.length > 0) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = COLORS.ghost;
            ctx.font = '10px Orbitron, sans-serif';
            ctx.textAlign = 'left';
            const ghostText = `${ghosts.length} echo${ghosts.length > 1 ? 's' : ''}`;
            const gy = (camera.isPortrait && isTouchDevice()) ? (camera.viewportH - 8) : (canvas.height - 12);
            ctx.fillText(ghostText, 12, gy);
            ctx.restore();
        }
        
        // Hint text
        if (game.hintAlpha > 0 && game.hintText) {
            ctx.save();
            ctx.globalAlpha = game.hintAlpha * 0.8;
            ctx.fillStyle = COLORS.text;
            ctx.font = '12px Inter, sans-serif';
            ctx.textAlign = 'center';
            const hy = (camera.isPortrait && isTouchDevice()) ? (camera.viewportH - 8) : 58;
            ctx.fillText(game.hintText, canvas.width / 2, hy);
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
    window.game = game;
})();
