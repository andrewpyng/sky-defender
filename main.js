/* Sky Defender — main game loop and logic
   Single-file engine: player, bullets, enemies, collisions, scoring, mobile+keyboard controls
*/
(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const overlay = document.getElementById('overlay');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');

  // viewport scale for crisp rendering on high-dpi
  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = 480 * ratio;
    canvas.height = 768 * ratio;
    canvas.style.width = '480px';
    canvas.style.height = '768px';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // helpers
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // game state
  let running = false;
  let difficulty = 'normal';
  let score = 0;
  let lives = 3;

  // input
  const keys = {};
  let touchX = null;
  let touchPressed = false;

  window.addEventListener('keydown', e => (keys[e.code] = true));
  window.addEventListener('keyup', e => (keys[e.code] = false));
  canvas.addEventListener('touchstart', e => { e.preventDefault(); touchPressed = true; touchX = e.touches[0].clientX; });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); touchX = e.touches[0].clientX; });
  canvas.addEventListener('touchend', e => { e.preventDefault(); touchPressed = false; touchX = null; });

  // tiny WebAudio-based sound helper (synth + noise) — works without external files
  const sound = (function(){
    let ctx = null;
    function ensure(){ if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    function playShoot(){ ensure(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = 820; g.gain.value = 0.07; o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09); o.stop(ctx.currentTime + 0.09); }
    function playHit(){ ensure(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = 'square'; o.frequency.value = 520; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14); o.stop(ctx.currentTime + 0.14); }
    function playExplode(){ ensure(); const bufferSize = 2 * ctx.sampleRate; const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate); const data = buffer.getChannelData(0); for (let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1) * (1 - i/bufferSize); } const src = ctx.createBufferSource(); const g = ctx.createGain(); src.buffer = buffer; g.gain.value = 0.18; src.connect(g); g.connect(ctx.destination); src.start(); setTimeout(()=>{ try{ src.stop(); }catch(e){} }, 400);
    }
    return { play(n){ if (navigator.userAgent.includes('bot')) return; try{ if (n === 'shoot') playShoot(); else if (n === 'hit') playHit(); else if (n === 'explode') playExplode(); }catch(e){} } };
  })();

  // Entities
  const player = {
    x: 240, y: 680, w: 34, h: 40, speed: 240, cooldown: 0, maxCooldown: 0.15,
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      // simple triangular ship
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(0, -this.h/2);
      ctx.lineTo(this.w/2, this.h/2);
      ctx.lineTo(-this.w/2, this.h/2);
      ctx.closePath();
      ctx.fill();
      // cockpit
      ctx.fillStyle = '#073b4c';
      ctx.beginPath();
      ctx.ellipse(0, -4, 8, 6, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    },
    reset() { this.x = 240; this.y = 680; this.cooldown = 0; }
  };

  const bullets = [];
  const enemies = [];
  const enemyBullets = [];
  const particles = [];

  // bullets
  function spawnPlayerBullet(x, y) {
    bullets.push({x,y,w:6,h:12,vy:-520,age:0});
    // shoot sound
    sound.play('shoot');
  }

  // enemies
  function spawnEnemy(type = 'small'){
    const x = rand(30, 450);
    const y = -60;
    if (type === 'small') enemies.push({x,y,w:30,h:30,vy: rand(40,80),hp:1,score:100,type});
    else if (type === 'med') enemies.push({x,y,w:46,h:38,vy: rand(30,70),hp:3,score:300,type,shootTimer: rand(1.4,3)});
    else if (type === 'big') enemies.push({x,y,w:72,h:54,vy: rand(12,36),hp:8,score:1200,type,shootTimer: 1.2});
  }

  // collisions
  function collide(a,b){return Math.abs(a.x-b.x) < (a.w+b.w)/2 && Math.abs(a.y-b.y) < (a.h+b.h)/2}

  // game flow
  let last = 0;
  let spawnTimer = 0;
  let wave = 1;
  let waveTimer = 0;

function startGame(selectedDifficulty='normal'){
    difficulty = selectedDifficulty;
    running = true; overlay.classList.remove('visible');
    score = 0; lives = 3; wave = 1; waveTimer = 0; enemies.length=0; bullets.length=0; enemyBullets.length=0; player.reset();
    updateHUD();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame(){ running = false; overlay.classList.add('visible'); startBtn.textContent = 'Restart'; }

  function updateHUD(){ scoreEl.textContent = `Score: ${score}`; livesEl.textContent = `Lives: ${lives}`; }

  function loop(t){
    if (!running) return;
    const dt = Math.min(0.033, (t - last)/1000);
    last = t;

    // spawn logic
    spawnTimer -= dt;
    waveTimer += dt;
    if (spawnTimer <= 0){
      // spawn based on difficulty & wave
      const base = difficulty === 'hard' ? 0.65 : 1.05;
      const rate = Math.max(0.35, base - (wave * 0.02));
      const spawnCount = 1 + Math.floor(Math.random()*Math.min(3, 0.5 + wave/3));
      for (let i=0;i<spawnCount;i++){
        const pick = Math.random();
        if (pick < 0.66) spawnEnemy('small');
        else if (pick < 0.93) spawnEnemy('med');
        else spawnEnemy('big');
      }
      spawnTimer = rate;
    }

    // wave progression
    if (waveTimer > Math.max(12, 8 - wave/2)) { wave++; waveTimer = 0; }

    // handle input
    let moveX = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) moveX -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) moveX += 1;
    if (keys['ArrowUp'] || keys['KeyW']) player.y -= player.speed * dt;
    if (keys['ArrowDown'] || keys['KeyS']) player.y += player.speed * dt;
    if (touchX !== null){
      // map touch X to canvas coordinate (centered)
      const rect = canvas.getBoundingClientRect();
      const x = (touchX - rect.left) / (rect.width) * 480;
      player.x += (x - player.x) * 12 * dt;
    }
    player.x += moveX * player.speed * dt;

    player.x = clamp(player.x, player.w/2, 480-player.w/2);
    player.y = clamp(player.y, player.h/2, 750);

    // shooting
    player.cooldown = Math.max(0, player.cooldown - dt);
    const shooting = keys['Space'] || keys['KeyK'] || touchPressed;
    if (shooting && player.cooldown <= 0){
      const spread = (wave > 6) ? 3 : (wave > 3 ? 2 : 1);
      if (spread === 1) spawnPlayerBullet(player.x, player.y-20);
      else if (spread === 2){ spawnPlayerBullet(player.x-8, player.y-18); spawnPlayerBullet(player.x+8, player.y-18); }
      else { spawnPlayerBullet(player.x-12, player.y-18); spawnPlayerBullet(player.x, player.y-20); spawnPlayerBullet(player.x+12, player.y-18); }
      player.cooldown = Math.max(0.06, player.maxCooldown - wave*0.006);
    }

    // update bullets
    for (let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.y += b.vy * dt; b.age += dt;
      if (b.y < -30 || b.age > 4) bullets.splice(i,1);
    }

    // update enemy bullets
    for (let i=enemyBullets.length-1;i>=0;i--){
      const b = enemyBullets[i]; b.y += b.vy * dt; if (b.y > 880) enemyBullets.splice(i,1);
    }

    // update enemies
    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i]; e.y += e.vy * dt; if (e.y > 820) { enemies.splice(i,1); continue; }

      // enemy shooting
      if (e.shootTimer !== undefined){ e.shootTimer -= dt; if (e.shootTimer <= 0){
        enemyBullets.push({x:e.x,y:e.y+18,w:6,h:10,vy:200});
        e.shootTimer = rand(1.2, 3.2) / (difficulty === 'hard' ? 1.2 : 1);
      }}
    }

    // collisions: bullets -> enemies
    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      for (let j=bullets.length-1;j>=0;j--){
        const b = bullets[j];
        if (collide(b, e)){
          bullets.splice(j,1);
          e.hp -= 1;
          // hit effect
          spawnParticles(e.x, e.y, 6, '#ffd166');
          sound.play('hit');
          if (e.hp <= 0){ score += e.score; // explosion
            spawnParticles(e.x, e.y, 18, '#ff6b6b');
            sound.play('explode');
            enemies.splice(i,1);
          }
          break;
        }
      }
    }

    // collisions: enemies or enemy bullets -> player
    for (let i=enemies.length-1;i>=0;i--){ const e = enemies[i]; if (collide(e, player)) { enemies.splice(i,1); loseLife(); } }
    for (let i=enemyBullets.length-1;i>=0;i--){ const b = enemyBullets[i]; if (collide(b, player)) { enemyBullets.splice(i,1); loseLife(); } }

    // draw
    ctx.clearRect(0,0,480,768);

    // background stars
    drawBackground(t);

    // entities
    bullets.forEach(drawBullet);
    enemyBullets.forEach(drawEnemyBullet);
    enemies.forEach(drawEnemy);
    particles.forEach(drawParticle);

    player.draw();

    // UI overlays

    // progress next frame
    updateHUD();
    requestAnimationFrame(loop);

    function loseLife(){
      lives -= 1; updateHUD();
      // player explosion
      spawnParticles(player.x, player.y, 28, '#ff9f1c');
      sound.play('explode');
      // death flash
      flash(200, '#ff8fa3');
      if (lives <= 0) { endGame(); }
    }
  }

  // particle system
  function spawnParticles(x, y, count = 8, color = '#fff'){
    for (let i=0;i<count;i++){
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 160 + 40;
      particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,ttl:0.6 + Math.random()*0.8,color});
    }
  }

  // update/draw particles every frame
  (function particleTick(){
    for (let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.age += 1/60;
      p.x += p.vx / 60; p.y += p.vy / 60;
      p.vx *= 0.98; p.vy *= 0.98;
      if (p.age > p.ttl) particles.splice(i,1);
    }
    // draw particles in main loop; keep this running so particles are processed
    requestAnimationFrame(particleTick);
  })();

  // drawing helpers
  let starPhase = 0;
  function drawBackground(t){
    starPhase += 0.008;
    // parallax star field
    const s = Math.sin(starPhase);
    for (let i=0;i<40;i++){
      const seed = i*23.1;
      const x = ((seed*12345)%480) + ((t*0.02* (i%3+1))%480);
      const y = ((seed*54321)%760) + (((t*0.005)*(i%5+1))%760);
      const r = 0.5 + ((seed%3)+1)*0.4;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + (i%7)*0.02})`;
      ctx.beginPath(); ctx.arc(x%480, y%768, r, 0, Math.PI*2); ctx.fill();
    }
  }
  function drawBullet(b){ ctx.fillStyle = '#ffd166'; ctx.fillRect(b.x-3, b.y-12, 6, 12); }
  function drawEnemyBullet(b){ ctx.fillStyle = '#ff6b6b'; ctx.fillRect(b.x-3, b.y-10, 6, 10); }

  function drawEnemy(e){
    ctx.save(); ctx.translate(e.x, e.y);
    // body
    if (e.type === 'small'){
      ctx.fillStyle = '#5f6caf'; ctx.beginPath(); ctx.ellipse(0,0,e.w/2,e.h/2,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#dbe7ff'; ctx.fillRect(-6,-2,12,4);
    } else if (e.type === 'med'){
      ctx.fillStyle = '#ef476f'; ctx.fillRect(-e.w/2, -e.h/2, e.w, e.h, 8);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill();
    } else {
      // big
      ctx.fillStyle = '#06d6a0'; ctx.fillRect(-e.w/2, -e.h/2, e.w, e.h, 6);
      ctx.fillStyle = '#073b4c'; ctx.fillRect(-18,-10,36,10);
    }
    ctx.restore();
  }

  function drawParticle(p){
    const t = 1 - (p.age / p.ttl);
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, t)); ctx.fillStyle = p.color || '#fff';
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, t*4), 0, Math.PI*2); ctx.fill(); ctx.restore();
  }

  // screen flash
  let flashAlpha = 0; let flashColor = '#fff';
  function flash(ms, color){ flashAlpha = 1; flashColor = color || '#fff'; setTimeout(()=> flashAlpha = 0, ms); }

  // drawing loop overlay vs background
  (function drawLoop(){
    requestAnimationFrame(drawLoop);
    if (flashAlpha > 0){ ctx.fillStyle = flashColor; ctx.globalAlpha = flashAlpha * 0.08; ctx.fillRect(0,0,480,768); ctx.globalAlpha = 1; }
  })();

  // Start / UI events
  startBtn.addEventListener('click', () => startGame('normal'));
  

  // mobile control buttons
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnFire = document.getElementById('btn-fire');
  if (btnLeft && btnRight && btnFire){
    const bind = (el, on, off, key) => {
      el.addEventListener('touchstart', e => { e.preventDefault(); keys[key] = true; });
      el.addEventListener('mousedown', e => { e.preventDefault(); keys[key] = true; });
      const release = e => { e && e.preventDefault(); keys[key] = false; };
      el.addEventListener('touchend', release);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);
    };
    bind(btnLeft,'down','up','ArrowLeft');
    bind(btnRight,'down','up','ArrowRight');
    // fire acts like spacebar
    btnFire.addEventListener('touchstart', e => { e.preventDefault(); keys['Space'] = true; });
    btnFire.addEventListener('mousedown', e => { e.preventDefault(); keys['Space'] = true; });
    btnFire.addEventListener('touchend', e => { e && e.preventDefault(); keys['Space'] = false; });
    btnFire.addEventListener('mouseup', e => { e && e.preventDefault(); keys['Space'] = false; });
  }

  // allow clicking canvas to shoot on desktop
  canvas.addEventListener('mousedown', (e) => { keys['Space'] = true; setTimeout(()=> keys['Space'] = false, 160); });

  // simple helpful note if page hosted on GitHub Pages
  console.log('Sky Defender ready. Host this folder on GitHub Pages (gh-pages branch or main/docs) to publish.');
})();
