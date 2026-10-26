import {BRIDGES,CARDS,Card,Entity,H,RIVER_BOTTOM,RIVER_TOP,Side,Snapshot,W,cardById,viewPoint} from './shared';
const $=(id:string)=>document.getElementById(id)!;
const show=(id:string,on:boolean)=>$(id).classList.toggle('hidden',!on);
let socket:WebSocket|null=null,myId='',token=localStorage.getItem('fortress-token')||'',name=localStorage.getItem('fortress-name')||'',lobby:any=null,state:Snapshot|null=null,previous:Snapshot|null=null,received=0,side:Side|null=null,selected:string|null=null,hover:{x:number;y:number}|null=null,connected=false,joining=false,manualLeave=false,pending:string|null=null,toastTimer=0,handKey='',lobbyKey='';
const canvas=$('arena') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
($('name') as HTMLInputElement).value=name;
function toast(text:string){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('toast').classList.remove('show'),2800);}
function send(m:unknown){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(m));else toast('Соединение восстанавливается…');}
function status(text:string,online=false){$('connection').textContent='● '+text;$('connection').classList.toggle('online',online);}
function connect(){
 manualLeave=false;joining=true;status('Подключение…');socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
 socket.onopen=()=>send({type:'join',name,token});
 socket.onmessage=e=>{
  let m:any;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){
   myId=m.id;token=m.token;localStorage.setItem('fortress-token',token);localStorage.setItem('fortress-name',name);connected=true;joining=false;status('В комнате',true);show('entry',false);show('lobby',true);($('joinForm').querySelector('button') as HTMLButtonElement).disabled=false;
  }else if(m.type==='lobby'){
   lobby=m;if(m.phase==='lobby'){state=null;previous=null;side=null;selected=null;handKey='';document.body.classList.remove('playing');show('game',false);show('lobby',true);show('result',false);}
   renderLobby();
  }else if(m.type==='state'){
   previous=state;state=m.state;received=performance.now();side=state!.players.findIndex(p=>p.id===myId) as Side;if(side!==0&&side!==1)side=null;
   document.body.classList.add('playing');show('entry',false);show('lobby',false);show('game',true);show('controls',side!==null);show('spectatorBar',side===null);renderBattle();
  }else if(m.type==='ack'){pending=null;selected=null;hover=null;handKey='';renderBattle();}
  else if(m.type==='error'){pending=null;toast(m.message);if(!connected){joining=false;($('joinForm').querySelector('button') as HTMLButtonElement).disabled=false;}renderBattle();}
 };
 socket.onclose=e=>{
  connected=false;pending=null;if(manualLeave){status('Не подключено');return;}status('Нет связи · повторное подключение');
  if(e.code===4001||e.code===4000){status(e.code===4001?'Сессия открыта в другой вкладке':'Комната заполнена');show('entry',true);show('lobby',false);show('game',false);document.body.classList.remove('playing');joining=false;($('joinForm').querySelector('button') as HTMLButtonElement).disabled=false;return;}
  setTimeout(connect,1500);
 };
 socket.onerror=()=>{};
}
$('joinForm').addEventListener('submit',e=>{e.preventDefault();if(joining)return;name=($('name') as HTMLInputElement).value.trim();if(!name)return;($('joinForm').querySelector('button') as HTMLButtonElement).disabled=true;connect();});
function renderLobby(){
 if(!lobby)return;const key=JSON.stringify(lobby)+myId;if(lobbyKey===key)return;lobbyKey=key;
 $('roomCount').textContent=`${lobby.players.length} / 8`;$('slots').replaceChildren();
 for(let i=0;i<2;i++){
  const p=lobby.players.find((p:any)=>p.id===lobby.slots[i]),el=document.createElement('div');el.className='slot';
  const small=document.createElement('small');small.textContent=i===0?'СИНЯЯ КРЕПОСТЬ':'АЛАЯ КРЕПОСТЬ';const title=document.createElement('strong');title.textContent=p?.name||'Свободное место';const tag=document.createElement('span');tag.textContent=p?p.ready?'✓ Готов к бою':p.online?'Ожидает готовности':'Восстанавливает связь…':'Присоединяйтесь к бою';el.append(small,title,tag);$('slots').append(el);
 }
 const ownSlot=lobby.slots.indexOf(myId),me=lobby.players.find((p:any)=>p.id===myId);show('ready',ownSlot>=0);show('takeSlot',ownSlot<0);($('takeSlot') as HTMLButtonElement).disabled=!lobby.slots.includes(null);$('ready').textContent=me?.ready?'Отменить готовность':'Я готов';$('roleHint').textContent=lobby.host===myId?'Вы — ведущий':'Ведущий выбирает игроков';
 $('players').replaceChildren();
 for(const p of lobby.players){
  const row=document.createElement('div');row.className='player';const identity=document.createElement('div');identity.className='identity';const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=p.name[0].toUpperCase();const text=document.createElement('div');const title=document.createElement('div');title.textContent=p.name+(p.id===myId?' · вы':'')+(p.id===lobby.host?' ♜':'');const tag=document.createElement('small');tag.textContent=!p.online?'Нет связи · место сохранено':lobby.slots.includes(p.id)?'Игрок':'Зритель';text.append(title,tag);identity.append(avatar,text);row.append(identity);
  if(lobby.host===myId){const controls=document.createElement('div');controls.className='player-controls';for(const [label,slot]of [['Синий',0],['Алый',1],['Зритель',-1]] as [string,number][]){const b=document.createElement('button');b.className='secondary';b.textContent=label;b.disabled=!p.online;b.onclick=()=>send({type:'slot',player:p.id,slot});controls.append(b);}row.append(controls);}
  $('players').append(row);
 }
 if(state?.phase==='result')renderResult();
}
$('takeSlot').onclick=()=>send({type:'slot',player:myId,slot:lobby.slots.indexOf(null)});
$('spectate').onclick=()=>send({type:'slot',player:myId,slot:-1});
$('ready').onclick=()=>send({type:'ready'});
$('leave').onclick=()=>{send({type:'leave'});manualLeave=true;token='';localStorage.removeItem('fortress-token');myId='';state=null;lobby=null;socket?.close();show('lobby',false);show('entry',true);status('Не подключено');};
$('backLobby').onclick=()=>send({type:'lobby'});$('rematch').onclick=()=>send({type:'rematch'});
function iconSvg(c:Card){
 const forms:Record<string,string>={guard:'<path d="M17 15 32 9l15 6v18Q45 46 32 53 19 46 17 33Z" fill="#9ed4d4"/><path d="M32 14v31m-9-21h18" stroke="#315d6b" stroke-width="5"/>',archer:'<path d="M19 14q28 18 0 36m0-36v36" fill="none" stroke="#e7bb78" stroke-width="4"/><path d="M13 32h39l-9-7m9 7-9 7" stroke="#d7e9df" stroke-width="4" fill="none"/>',giant:'<path d="m15 17 17-9 17 9 6 24-11 13H20L9 41Z" fill="#a5aaa5"/><path d="m19 21 13-5 13 5-3 17H22Z" fill="#cbd0bd"/><path d="M24 27h5m7 0h5" stroke="#365663" stroke-width="4"/>',runners:'<path d="m13 18 14 14-14 14m17-28 14 14-14 14m17-28 12 14-12 14" stroke="#b9ddaa" stroke-width="6" fill="none"/>',bomber:'<circle cx="31" cy="36" r="19" fill="#20323a" stroke="#93b0b6" stroke-width="3"/><path d="m35 17 5-10 7 1m-1-5 5 5-6 5" stroke="#f3bf69" stroke-width="4" fill="none"/>',knight:'<path d="m13 7 34 39-5 6L8 13Zm38 0L17 46l5 6 34-39Z" fill="#d6e4de"/><path d="m11 39 14 14m14 0 14-14" stroke="#e6b76f" stroke-width="5"/>',fire:'<path d="M32 5q1 17 14 23 16 19-3 28-30 7-31-16 0-12 13-22-2 16 6 18 8-10 1-31Z" fill="#ee965b"/><path d="M30 34q-14 21 5 22 18-2-5-22" fill="#ffe0a0"/>',ice:'<path d="M32 6v52M10 19l44 26M10 45l44-26M25 10l7 7 7-7m-14 44 7-7 7 7M10 27l10-2-3-10m30 34-3-10 10-2M10 37l10 2-3 10m30-34-3 10 10 2" fill="none" stroke="#aae2ed" stroke-width="4"/>'};
 return `<svg viewBox="0 0 64 64" aria-hidden="true">${forms[c.id]}</svg>`;
}
function cardEl(c:Card,next=false){const b=document.createElement(next?'div':'button');b.className='card'+(c.spell?' spell':'');b.innerHTML=`<span class="cost">${c.cost}</span>${iconSvg(c)}<span class="card-name">${c.name}</span>`;if(!next){b.setAttribute('aria-label',`${c.name}, ${c.cost} энергии. ${c.description}`);b.dataset.card=c.id;b.addEventListener('pointerdown',e=>beginCard(e as PointerEvent,c.id));b.addEventListener('click',()=>{if(!suppressClick)selectCard(c.id);});}return b;}
for(const c of CARDS){const el=document.createElement('div');el.className='catalog-card';el.innerHTML=`<b>${c.icon} ${c.name} · ${c.cost} ◆</b><p>${c.description}</p><p>${c.spell?'':`Здоровье ${c.hp} · Урон ${c.damage} · Скорость ${c.speed}`}</p>`;$('catalog').append(el);}
function selectCard(id:string){if(pending)return;selected=selected===id?null:id;hover=null;handKey='';renderBattle();}
function renderBattle(){
 if(!state)return;const s=state,a=side===null?0:side,b=1-a;
 $('ownName').textContent=s.players[a].name;$('enemyName').textContent=s.players[b].name;$('ownScore').textContent=s.score[a]+' ♜';$('enemyScore').textContent=s.score[b]+' ♜';$('timeLabel').textContent=s.overtime?'ДОП. ВРЕМЯ ×2':'БОЙ';$('timer').parentElement!.classList.toggle('extra',s.overtime);
 const secs=Math.ceil(s.time);$('timer').textContent=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
 const off=lobby?.players.filter((p:any)=>!p.online&&s.players.some(f=>f.id===p.id));status(connected?(off?.length?'Соперник восстанавливает связь':'Бой в сети'):'Нет связи · место сохранено',connected);
 if(side!==null){
  const p=s.players[side];$('energy').textContent=String(Math.floor(p.energy));$('energyFill').style.width=`${p.energy*10}%`;
  const key=p.hand.join(',')+'|'+p.queue[0]+'|'+selected;
  if(key!==handKey){handKey=key;$('hand').replaceChildren(...p.hand.map(id=>cardEl(cardById(id))));$('nextCard').replaceChildren(cardEl(cardById(p.queue[0]),true));}
  $('hand').querySelectorAll<HTMLElement>('.card').forEach(el=>{el.classList.toggle('selected',el.dataset.card===selected);el.classList.toggle('unaffordable',cardById(el.dataset.card!).cost>p.energy);});
 }
 $('arenaHint').textContent=selected?cardById(selected).spell?'Нажмите в любом месте арены':'Разместите отряд на своей половине':side===null?'Зритель · вся арена':'Ваша крепость внизу';
 $('cardDescription').textContent=pending?'Сервер проверяет размещение…':selected?cardById(selected).description:'Выберите карту, затем место на арене';
 show('result',s.phase==='result');if(s.phase==='result')renderResult();
}
function renderResult(){if(!state)return;const s=state;
 $('resultTitle').textContent=s.winner===null?'Ничья':side===null?`${s.players[s.winner].name} побеждает`:s.winner===side?'Ваша победа!':'Крепость пала';$('resultReason').textContent=s.reason;
 $('stats').replaceChildren();for(let i=0;i<2;i++){const p=s.players[i],row=document.createElement('div');row.textContent=`${p.name} · ${s.score[i]} ♜ · ${p.played} карт · ${Math.round(p.damage)} урона`;$('stats').append(row);}
 show('rematch',side!==null);show('backLobby',side!==null||lobby?.host===myId);
 const me=lobby?.players.find((p:any)=>p.id===myId);$('rematch').textContent=me?.rematch?'Отменить реванш':'Реванш';$('rematchStatus').textContent=lobby?.players.some((p:any)=>p.rematch)?'Запрос реванша: ждём готовности второго игрока':side===null?'Игроки выбирают следующий бой':'';
}
function cancel(){selected=null;hover=null;handKey='';renderBattle();}$('cancel').onclick=cancel;window.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
function pointer(e:{clientX:number;clientY:number}){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*W,y:(e.clientY-r.top)/r.height*H};}
function play(p:{x:number;y:number}){if(!state||state.phase!=='battle'||side===null||!selected||pending)return;if(!connected){toast('Дождитесь восстановления связи');return;}const world=viewPoint(p.x,p.y,side),id=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;pending=id;send({type:'play',id,card:selected,...world});renderBattle();window.setTimeout(()=>{if(pending===id){pending=null;renderBattle();}},2500);}
canvas.addEventListener('pointermove',e=>{hover=pointer(e);});canvas.addEventListener('pointerleave',()=>{if(!drag)hover=null;});canvas.addEventListener('pointerdown',e=>{e.preventDefault();play(pointer(e));});
let drag:{id:string;x:number;y:number;moving:boolean}|null=null,suppressClick=false;
function beginCard(e:PointerEvent,id:string){if(pending)return;drag={id,x:e.clientX,y:e.clientY,moving:false};}
window.addEventListener('pointermove',e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>8){drag.moving=true;selected=drag.id;hover=pointer(e);handKey='';renderBattle();}});
window.addEventListener('pointerup',e=>{if(!drag)return;if(drag.moving){suppressClick=true;const r=canvas.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)play(pointer(e));setTimeout(()=>suppressClick=false,100);}drag=null;});
window.addEventListener('pointercancel',()=>{drag=null;hover=null;});
function roundRect(x:number,y:number,w:number,h:number,r:number,color:string){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function circle(x:number,y:number,r:number,color:string){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function line(x:number,y:number,x2:number,y2:number,color:string,width:number){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();}
function team(s:Side){return s===(side??0)?'#8fd4e4':'#ee967f';}
function tower(e:Entity,p:{x:number;y:number}){
 const r=e.radius,alive=e.hp>0,color=team(e.side);
 ctx.save();ctx.translate(p.x,p.y);
 ctx.fillStyle='#0a252f55';ctx.beginPath();ctx.ellipse(4,r+8,r+12,12,0,0,7);ctx.fill();
 if(!alive){for(let i=0;i<5;i++)roundRect(-r+i*12,0+(i%2)*9,12,11,2,'#67796b');ctx.restore();return;}
 roundRect(-r-5,-r-4,2*r+10,2*r+15,9,'#1d3d49');roundRect(-r,-r,2*r,2*r,6,color);roundRect(-r+5,-r+9,2*r-10,2*r-15,3,e.side===(side??0)?'#3d6c80':'#815b56');
 for(let i=0;i<3;i++)roundRect(-r+i*(r-.5),-r-8,12,15,2,color);
 roundRect(-9,3,18,r-3,8,'#17333d');
 if(e.core){ctx.fillStyle='#e9c784';ctx.beginPath();ctx.moveTo(-21,-r-10);ctx.lineTo(-25,-r-28);ctx.lineTo(-8,-r-20);ctx.lineTo(0,-r-36);ctx.lineTo(8,-r-20);ctx.lineTo(25,-r-28);ctx.lineTo(21,-r-10);ctx.closePath();ctx.fill();}
 else{line(0,-r-3,0,-r-28,'#ccd7cb',3);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-r-29);ctx.lineTo(21,-r-21);ctx.lineTo(0,-r-13);ctx.fill();}
 ctx.restore();health(e,p,r+40,true);
}
function health(e:Entity,p:{x:number;y:number},offset:number,label=false){const w=label?70:Math.max(24,e.radius*2.7),barY=label&&p.y-offset<25?p.y+e.radius+22:p.y-offset;roundRect(p.x-w/2-1,barY-1,w+2,7,3,'#14252b');roundRect(p.x-w/2,barY,w*Math.max(0,e.hp/e.maxHp),5,2,team(e.side));if(label){ctx.font='bold 13px Segoe UI';ctx.textAlign='center';ctx.fillStyle='#f2edcf';ctx.fillText(String(Math.max(0,Math.ceil(e.hp))),p.x,barY-5);}}
function unit(e:Entity,p:{x:number;y:number},time:number){
 const r=e.radius,color=team(e.side),bob=Math.sin(time/140+e.id)*1.4;
 ctx.save();ctx.translate(p.x,p.y+bob);circle(2,r*.8,r*1.12,'#102d3655');
 if(e.kind==='giant'){roundRect(-r,-r,r*2,r*2,7,'#4e625f');roundRect(-r+3,-r+3,r*2-6,r*1.4,6,color);roundRect(-r-5,0,10,20,3,'#a1aaa0');roundRect(r-5,0,10,20,3,'#a1aaa0');line(-7,-8,-2,-8,'#25414b',3);line(3,-8,8,-8,'#25414b',3);}
 else if(e.kind==='knight'){circle(0,0,r+2,'#2b3f4c');roundRect(-r,-r,r*2,r*2,5,color);line(-10,-3,10,-3,'#263743',5);line(r,-r,r+8,r+9,'#e1dfc1',5);line(-r-4,0,-r-4,13,'#e4c281',7);}
 else if(e.kind==='archer'){ctx.fillStyle='#6b567f';ctx.beginPath();ctx.moveTo(-r,r+5);ctx.lineTo(0,-r-8);ctx.lineTo(r,r+5);ctx.fill();circle(0,-3,7,'#e6c5a2');line(-r-6,-7,-r-6,12,'#e6bb76',3);line(-r-10,2,r+7,2,color,3);}
 else if(e.kind==='bomber'){circle(0,0,r,color);circle(-2,-6,7,'#e7d3ab');circle(r+1,5,8,'#25313e');line(r+2,-3,r+7,-7,'#e9b66b',3);}
 else if(e.kind==='runners'){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-r-3);ctx.lineTo(r,r);ctx.lineTo(-r,r);ctx.fill();circle(0,-4,4,'#e5d3ac');line(r,0,r+6,-6,'#e8e6ca',3);}
 else{circle(0,-5,9,'#e6d0aa');roundRect(-10,-4,20,21,5,color);roundRect(-14,1,10,17,3,'#d8d8bb');line(12,-13,12,11,'#c6d9d2',4);}
 ctx.restore();health(e,p,r+11);
}
function render(now:number){
 requestAnimationFrame(render);if(!state||$('game').classList.contains('hidden'))return;
 const s=state;ctx.clearRect(0,0,W,H);
 // Local procedural art: grass tiles, paved lanes, river and wooden bridges.
 ctx.fillStyle='#315f58';ctx.fillRect(0,0,W,H);
 for(let row=0;row<18;row++)for(let col=0;col<12;col++){ctx.fillStyle=(row+col)%2?'#38665a':'#336256';ctx.fillRect(col*50+1,row*50+1,48,48);}
 ctx.fillStyle='#6b8370';for(const x of BRIDGES){ctx.fillRect(x-35,95,70,710);ctx.fillStyle='#7a8b71';for(let y=105;y<805;y+=23){ctx.fillRect(x-31+(y%2)*2,y,61,1);}ctx.fillStyle='#6b8370';}
 // Border stones and scattered flora are deterministic, with no downloaded assets.
 for(let y=12;y<H;y+=29){roundRect(4,y,14,23,3,'#789084');roundRect(W-18,y,14,23,3,'#789084');}
 for(let i=0;i<44;i++){const x=30+((i*137)%540),y=35+((i*211)%830);if(Math.abs(y-450)<65||BRIDGES.some(b=>Math.abs(x-b)<60))continue;line(x,y,x-3,y-6,'#779675',2);line(x,y,x+4,y-8,'#779675',2);}
 ctx.fillStyle='#183e51';ctx.fillRect(18,RIVER_TOP-7,W-36,74);ctx.fillStyle='#2c8090';ctx.fillRect(18,RIVER_TOP,W-36,60);
 ctx.save();ctx.beginPath();ctx.rect(18,RIVER_TOP,W-36,60);ctx.clip();for(let i=0;i<23;i++){const x=((i*77+now*.018)%650)-30,y=RIVER_TOP+8+(i%4)*14;line(x,y,x+30,y,'#61b2b34d',2);}ctx.restore();
 for(const x of BRIDGES){roundRect(x-40,412,80,76,5,'#294a4c');ctx.fillStyle='#ab9369';ctx.fillRect(x-36,414,72,72);for(let y=417;y<485;y+=11)line(x-34,y,x+34,y,'#695e4b',3);line(x-39,412,x-39,488,'#d0b580',5);line(x+39,412,x+39,488,'#d0b580',5);}
 ctx.strokeStyle='#b7c8aa40';ctx.lineWidth=2;ctx.setLineDash([8,9]);ctx.beginPath();ctx.moveTo(25,450);ctx.lineTo(575,450);ctx.stroke();ctx.setLineDash([]);
 const point=(x:number,y:number)=>viewPoint(x,y,side);
 for(const f of s.fields){const p=point(f.x,f.y);circle(p.x,p.y,f.radius,'#96deef32');ctx.strokeStyle='#b2e7ed88';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,f.radius,0,Math.PI*2);ctx.stroke();for(let i=0;i<10;i++){const angle=i*.628+now*.0003;circle(p.x+Math.cos(angle)*f.radius*.7,p.y+Math.sin(angle)*f.radius*.7,3,'#d1f7ff99');}}
 if(selected&&s.phase==='battle'){
  const c=cardById(selected);ctx.fillStyle=c.spell?'#eac57a12':'#92dfcf26';ctx.fillRect(20,c.spell?20:502,W-40,c.spell?860:378);
  if(!c.spell){ctx.fillStyle='#081c3155';ctx.fillRect(20,20,560,480);for(const e of s.entities.filter(e=>e.kind==='tower'&&e.hp>0)){const p=point(e.x,e.y);circle(p.x,p.y,e.radius+c.radius+22,'#d46d6538');}}
  if(hover){circle(hover.x,hover.y,c.spell?c.radius:c.radius+13,'#ead29740');ctx.strokeStyle='#ffe1a0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(hover.x,hover.y,c.spell?c.radius:c.radius+13,0,7);ctx.stroke();}
 }
 const alpha=Math.max(0,Math.min(1,(now-received)/100));
 const old=new Map(previous?.entities.map(e=>[e.id,e])||[]);
 for(const e of [...s.entities].sort((a,b)=>point(a.x,a.y).y-point(b.x,b.y).y)){
  const o=old.get(e.id),x=o?o.x+(e.x-o.x)*alpha:e.x,y=o?o.y+(e.y-o.y)*alpha:e.y,p=point(x,y);if(e.kind==='tower')tower(e,p);else unit(e,p,now);
 }
 for(const shot of s.shots){const p=point(shot.x,shot.y),t=point(shot.tx,shot.ty);if(shot.kind==='bomb')circle(p.x,p.y,7,'#1a2936');else{const d=Math.hypot(t.x-p.x,t.y-p.y)||1;line(p.x,p.y,p.x-(t.x-p.x)/d*12,p.y-(t.y-p.y)/d*12,'#ffe2a0',4);}circle(p.x,p.y,3,team(shot.side));}
 for(const e of s.effects){const p=point(e.x,e.y),fade=Math.min(1,e.ttl*3);ctx.globalAlpha=fade;if(e.kind==='hit'){circle(p.x,p.y,e.radius,'#ffe7b0aa');}else if(e.kind==='fire'||e.kind==='blast'){circle(p.x,p.y,e.radius*(1.15-e.ttl*.3),'#ed9a5b44');circle(p.x,p.y,e.radius*.5,'#ffda9c77');for(let i=0;i<8;i++){const a=i*Math.PI/4;circle(p.x+Math.cos(a)*e.radius*(1-e.ttl*.4),p.y+Math.sin(a)*e.radius*(1-e.ttl*.4),7,'#f4c58d');}}else if(e.kind==='destroy'){for(let i=0;i<6;i++){const a=i*Math.PI/3;roundRect(p.x+Math.cos(a)*e.radius*(1-e.ttl),p.y+Math.sin(a)*e.radius*(1-e.ttl),6,6,1,'#e5c58a');}}else if(e.kind==='spawn'){ctx.strokeStyle=team(e.side);ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,e.radius*(1.5-e.ttl),0,7);ctx.stroke();}ctx.globalAlpha=1;}
}
requestAnimationFrame(render);
fetch('/api/network').then(r=>r.json()).then(data=>{
 const select=$('addresses') as HTMLSelectElement;for(const a of data.addresses){const opt=document.createElement('option');opt.value=a.url;opt.textContent=`${a.name} · ${a.url}`;select.append(opt);}
 function update(){const address=select.value;if(!address){$('networkLink').textContent='Сетевой IPv4 не найден. Подключите компьютер к Wi-Fi.';show('qr',false);return;}($('qr') as HTMLImageElement).src='/api/qr?address='+encodeURIComponent(address);$('networkLink').textContent=address;($('networkLink') as HTMLAnchorElement).href=address;}
 select.onchange=update;update();
 $('copyAddress').onclick=async()=>{try{await navigator.clipboard.writeText(select.value);toast('Адрес скопирован');}catch{toast('Адрес: '+select.value);}};
}).catch(()=>toast('Не удалось получить адрес сети'));
setInterval(()=>{if(connected)send({type:'ping',at:Date.now()});},10000);
if(token&&name)connect();

