const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const SIZE = 30, CELL = canvas.width / SIZE;

const ui = Object.fromEntries(['score','best','level','energyText','energyBar','combo','comboTimer','missionTitle','missionBar','missionText','finalScore','resultNote','startScreen','pauseScreen','gameOverScreen','toast'].map(id => [id, document.getElementById(id)]));
const powerUI = {
  shield: [document.getElementById('shieldPower'), document.getElementById('shieldStatus')],
  phase: [document.getElementById('phasePower'), document.getElementById('phaseStatus')],
  magnet: [document.getElementById('magnetPower'), document.getElementById('magnetStatus')]
};

const config = {
  rookie: { step: 125, obstacles: 2, label: 'ÇAYLAK' },
  normal: { step: 100, obstacles: 4, label: 'OPERATÖR' },
  insane: { step: 74, obstacles: 7, label: 'KÂBUS' }
};

let difficulty = 'normal';
let snake, direction, queuedDirection, food, rare, powerup, obstacles, particles;
let score, best = +(localStorage.getItem('neonSerpentBest') || 0), level, eaten, combo, comboUntil, energy;
let powers, running = false, paused = false, gameOver = false, lastStep = 0, lastFrame = 0, shake = 0, flash = 0;
let soundOn = true, audioCtx;
ui.best.textContent = String(best).padStart(6,'0');

function rnd(max){ return Math.floor(Math.random()*max); }
function same(a,b){ return a.x === b.x && a.y === b.y; }
function occupied(p, includeFood = true){
  return snake?.some(s=>same(s,p)) || obstacles?.some(s=>same(s,p)) || (includeFood && food && same(food,p));
}
function openCell(includeFood=true){
  let p, guard=0;
  do { p={x:rnd(SIZE), y:rnd(SIZE)}; guard++; } while(occupied(p,includeFood) && guard<1000);
  return p;
}
function beep(freq=440, duration=.06, type='sine', volume=.04){
  if(!soundOn) return;
  try{
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(volume,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);
    o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+duration);
  }catch(e){}
}

function resetGame(){
  snake = [{x:12,y:15},{x:11,y:15},{x:10,y:15},{x:9,y:15}];
  direction={x:1,y:0}; queuedDirection={...direction};
  score=0; level=1; eaten=0; combo=1; comboUntil=0; energy=100;
  powers={shield:0,phase:0,magnet:0}; particles=[]; obstacles=[]; rare=null; powerup=null;
  buildObstacles(config[difficulty].obstacles); food=openCell();
  running=true; paused=false; gameOver=false; lastStep=performance.now(); lastFrame=lastStep;
  ui.startScreen.classList.remove('active'); ui.gameOverScreen.classList.remove('active'); ui.pauseScreen.classList.remove('active');
  updateUI(); beep(220,.08,'square'); setTimeout(()=>beep(440,.12,'square'),70);
}

function buildObstacles(count){
  for(let i=0;i<count;i++){
    let p=openCell(false);
    if(p.x>7&&p.x<18&&p.y>11&&p.y<19){i--;continue;}
    obstacles.push(p);
    if(Math.random()>.45 && obstacles.length<count){
      const q={x:Math.min(SIZE-1,p.x+1),y:p.y};
      if(!occupied(q,false)) obstacles.push(q);
    }
  }
}

function setDirection(x,y){
  if(!running || paused) return;
  if(x === -direction.x && y === -direction.y) return;
  queuedDirection={x,y};
}

function step(now){
  direction=queuedDirection;
  const head={x:snake[0].x+direction.x,y:snake[0].y+direction.y};
  const phaseActive=powers.phase>now;
  if(phaseActive){ head.x=(head.x+SIZE)%SIZE; head.y=(head.y+SIZE)%SIZE; }
  const wall=head.x<0||head.y<0||head.x>=SIZE||head.y>=SIZE;
  const body=snake.some((s,i)=>i>0&&same(s,head));
  const block=obstacles.some(o=>same(o,head));
  if(wall||body||block){
    if(powers.shield>now){
      powers.shield=0; queuedDirection=direction={x:-direction.x,y:-direction.y};
      burst(snake[0].x,snake[0].y,'#27e6d0',22); shake=9; flash=.35; beep(130,.18,'sawtooth'); return;
    }
    endGame(); return;
  }
  snake.unshift(head);
  let grew=false;
  if(same(head,food)){
    collectFood(now,false); grew=true;
  } else if(rare && same(head,rare)){
    collectFood(now,true); rare=null; grew=true;
  } else if(powerup && same(head,powerup)){
    collectPower(now); powerup=null;
  }
  if(!grew) snake.pop();

  if(powers.magnet>now){
    const dx=head.x-food.x, dy=head.y-food.y;
    if(Math.abs(dx)+Math.abs(dy)<=4){
      food.x += Math.sign(dx); food.y += Math.sign(dy);
      if(same(head,food)){ collectFood(now,false); snake.push({...snake[snake.length-1]}); }
    }
  }
  energy=Math.min(100,energy+.65);
}

function collectFood(now,isRare){
  const fast=now<comboUntil;
  combo=fast?Math.min(8,combo+1):1; comboUntil=now+2600;
  const gain=(isRare?500:100)*combo*level; score+=gain; eaten++;
  energy=Math.min(100,energy+(isRare?35:12));
  burst(isRare?rare.x:food.x,isRare?rare.y:food.y,isRare?'#27e6d0':'#ff9d3d',isRare?30:16);
  beep(isRare?760:440+combo*45,isRare?.14:.07,isRare?'sine':'square',.045);
  food=openCell();
  if(eaten%5===0 && !rare) rare={...openCell(),expires:now+7000};
  if(eaten%6===0 && !powerup){ const types=['shield','phase','magnet']; powerup={...openCell(),type:types[rnd(3)],expires:now+9000}; }
  const newLevel=1+Math.floor(eaten/8);
  if(newLevel>level){ level=newLevel; buildObstacles(2); showToast(`SEVİYE ${level} // ARENA GENİŞLEDİ`); flash=.3; }
  if(eaten%5===0) showToast('HEDEF TAMAMLANDI +500');
  updateUI();
}

function collectPower(now){
  powers[powerup.type]=now+(powerup.type==='shield'?30000:8000);
  burst(powerup.x,powerup.y,'#a8ff3e',28); showToast(`${powerup.type.toUpperCase()} AKTİF`); beep(620,.2,'sine');
}

function dash(){
  if(!running||paused||gameOver||energy<28) return;
  energy-=28; const now=performance.now();
  step(now); if(!gameOver) step(now); shake=4; beep(180,.09,'sawtooth'); updateUI();
}

function endGame(){
  running=false; gameOver=true; shake=15; flash=.65; burst(snake[0].x,snake[0].y,'#ff496a',50); beep(90,.45,'sawtooth',.07);
  if(score>best){best=score;localStorage.setItem('neonSerpentBest',best);ui.resultNote.textContent='YENİ REKOR // Ağ seni hatırlayacak.';}
  else ui.resultNote.textContent=`Rekora ${Math.max(0,best-score).toLocaleString('tr-TR')} puan kaldı.`;
  ui.finalScore.textContent=score.toLocaleString('tr-TR'); ui.best.textContent=String(best).padStart(6,'0');
  setTimeout(()=>ui.gameOverScreen.classList.add('active'),450);
}

function togglePause(force){
  if(!running||gameOver) return;
  paused=typeof force==='boolean'?force:!paused;
  ui.pauseScreen.classList.toggle('active',paused); lastStep=performance.now();
}

function burst(x,y,color,count){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2, speed=40+Math.random()*150;
    particles.push({x:(x+.5)*CELL,y:(y+.5)*CELL,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:.35+Math.random()*.45,max:.8,color,size:1+Math.random()*3});
  }
}
function updateParticles(dt){
  particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt;});
  particles=particles.filter(p=>p.life>0);
}

function updateUI(now=performance.now()){
  ui.score.textContent=String(score||0).padStart(6,'0'); ui.level.textContent=String(level||1).padStart(2,'0');
  ui.combo.textContent=combo||1; ui.energyText.textContent=`${Math.round(energy||100)}%`; ui.energyBar.style.width=`${energy||100}%`;
  const mission=(eaten||0)%5; ui.missionBar.style.width=`${mission/5*100}%`; ui.missionText.textContent=`${mission} / 5`;
  ui.missionTitle.textContent=level>2?'Zinciri koru':'5 çekirdek topla';
  ui.comboTimer.textContent=now<comboUntil?`${((comboUntil-now)/1000).toFixed(1)} sn kaldı`:'Zinciri sürdür';
  Object.entries(powerUI).forEach(([key,[el,status]])=>{
    const active=powers&&powers[key]>now; el.classList.toggle('active',active);
    status.textContent=active?(key==='shield'?'HAZIR':`${Math.ceil((powers[key]-now)/1000)} SN`):'PASİF';
  });
}

function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawGrid(){
  ctx.fillStyle='#07100d';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(95,151,126,.075)';ctx.lineWidth=1;
  for(let i=0;i<=SIZE;i++){ctx.beginPath();ctx.moveTo(i*CELL,0);ctx.lineTo(i*CELL,canvas.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*CELL);ctx.lineTo(canvas.width,i*CELL);ctx.stroke();}
  const g=ctx.createRadialGradient(canvas.width/2,canvas.height/2,20,canvas.width/2,canvas.height/2,500);g.addColorStop(0,'rgba(41,118,81,.08)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
}
function drawObstacles(now){
  obstacles?.forEach((o,i)=>{const x=o.x*CELL+3,y=o.y*CELL+3,s=CELL-6;ctx.save();ctx.shadowColor='#ff496a';ctx.shadowBlur=6;ctx.fillStyle='#28141a';ctx.strokeStyle='#ff496a88';ctx.lineWidth=1;roundedRect(x,y,s,s,3);ctx.fill();ctx.stroke();ctx.fillStyle='#ff496a';ctx.globalAlpha=.5+.25*Math.sin(now/300+i);ctx.fillRect(x+5,y+s/2-1,s-10,2);ctx.restore();});
}
function drawFood(now){
  if(!food)return; const pulse=1+Math.sin(now/130)*.12,x=(food.x+.5)*CELL,y=(food.y+.5)*CELL;
  ctx.save();ctx.translate(x,y);ctx.scale(pulse,pulse);ctx.shadowColor='#ff9d3d';ctx.shadowBlur=18;ctx.fillStyle='#ffb255';ctx.rotate(now/600);ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?6:10;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.restore();
  if(rare){const r=(rare.x+.5)*CELL,q=(rare.y+.5)*CELL;ctx.save();ctx.translate(r,q);ctx.rotate(-now/500);ctx.shadowColor='#27e6d0';ctx.shadowBlur=20;ctx.strokeStyle='#27e6d0';ctx.lineWidth=3;ctx.strokeRect(-8,-8,16,16);ctx.fillStyle='#dffff8';ctx.fillRect(-3,-3,6,6);ctx.restore();}
  if(powerup){const x=(powerup.x+.5)*CELL,y=(powerup.y+.5)*CELL;ctx.save();ctx.translate(x,y);ctx.rotate(now/800);ctx.shadowColor='#a8ff3e';ctx.shadowBlur=22;ctx.strokeStyle='#a8ff3e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*1.5);ctx.stroke();ctx.rotate(Math.PI);ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*1.5);ctx.stroke();ctx.restore();}
}
function drawSnake(now){
  if(!snake)return;
  for(let i=snake.length-1;i>=0;i--){const s=snake[i],head=i===0,pad=head?2.5:4,x=s.x*CELL+pad,y=s.y*CELL+pad,z=CELL-pad*2;ctx.save();const alpha=.42+.58*(1-i/Math.max(snake.length,8));ctx.globalAlpha=Math.max(.25,alpha);ctx.shadowColor=head?'#d9ff7b':'#62f191';ctx.shadowBlur=head?18:7;ctx.fillStyle=head?'#b9ff45':`hsl(${138+i*1.1} 72% ${47-Math.min(i,18)*.8}%)`;roundedRect(x,y,z,z,head?7:5);ctx.fill();if(i>0){ctx.fillStyle='rgba(4,30,20,.28)';ctx.fillRect(x+5,y+5,3,3)}ctx.restore();}
  const h=snake[0],cx=(h.x+.5)*CELL,cy=(h.y+.5)*CELL;ctx.save();ctx.fillStyle='#06110c';const px=-direction.y*5,py=direction.x*5,fx=direction.x*5,fy=direction.y*5;ctx.beginPath();ctx.arc(cx+fx+px,cy+fy+py,2.1,0,Math.PI*2);ctx.arc(cx+fx-px,cy+fy-py,2.1,0,Math.PI*2);ctx.fill();ctx.restore();
  if(powers?.shield>now){ctx.save();ctx.strokeStyle='#27e6d0';ctx.shadowColor='#27e6d0';ctx.shadowBlur=12;ctx.globalAlpha=.65+.25*Math.sin(now/90);ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,CELL*.72,0,Math.PI*2);ctx.stroke();ctx.restore();}
}
function drawParticles(){particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)});ctx.globalAlpha=1;}
function render(now){
  const dt=Math.min(.04,(now-lastFrame)/1000||0);lastFrame=now;if(!paused)updateParticles(dt);
  ctx.save();if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.86;if(shake<.2)shake=0;}
  drawGrid();drawObstacles(now);drawFood(now);drawSnake(now);drawParticles();
  if(flash>0){ctx.fillStyle=`rgba(168,255,62,${flash})`;ctx.fillRect(0,0,canvas.width,canvas.height);flash*=.84;}
  ctx.restore();
}
function loop(now){
  if(running&&!paused){
    const speed=Math.max(42,config[difficulty].step-(level-1)*5);
    if(now-lastStep>speed){step(now);lastStep=now;}
    if(rare&&rare.expires<now)rare=null;if(powerup&&powerup.expires<now)powerup=null;
    if(comboUntil&&now>comboUntil)combo=1; updateUI(now);
  }
  render(now);requestAnimationFrame(loop);
}
function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');setTimeout(()=>ui.toast.classList.remove('show'),1600);}

window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d'].includes(k))e.preventDefault();
  if(k==='arrowup'||k==='w')setDirection(0,-1);if(k==='arrowdown'||k==='s')setDirection(0,1);
  if(k==='arrowleft'||k==='a')setDirection(-1,0);if(k==='arrowright'||k==='d')setDirection(1,0);
  if(k===' ')dash();if(k==='p'||k==='escape')togglePause();if(k==='enter'&&!running)resetGame();
});
document.querySelectorAll('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>{difficulty=b.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('selected',x===b));beep(300,.04,'square');}));
document.querySelectorAll('[data-dir]').forEach(b=>b.addEventListener('pointerdown',()=>{const map={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};setDirection(...map[b.dataset.dir]);}));
document.getElementById('startBtn').onclick=resetGame;document.getElementById('restartBtn').onclick=resetGame;document.getElementById('resumeBtn').onclick=()=>togglePause(false);document.getElementById('dashBtn').onclick=dash;
document.getElementById('soundBtn').onclick=e=>{soundOn=!soundOn;e.currentTarget.textContent=`SES: ${soundOn?'AÇIK':'KAPALI'}`;if(soundOn)beep(520,.06);};
window.addEventListener('blur',()=>{if(running&&!gameOver)togglePause(true)});

// Start screen ambience
snake=[{x:15,y:15},{x:14,y:15},{x:13,y:15},{x:12,y:15},{x:11,y:15}];direction={x:1,y:0};obstacles=[];particles=[];food={x:20,y:15};powers={shield:0,phase:0,magnet:0};energy=100;eaten=0;level=1;combo=1;score=0;
requestAnimationFrame(loop);
