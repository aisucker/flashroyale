import {randomUUID} from 'node:crypto';
import {BALANCE as B,BRIDGES,CARDS,Card,Entity,Fighter,H,RIVER_BOTTOM,RIVER_TOP,Side,Snapshot,W,cardById} from './shared';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
export class Match {
 state:Snapshot; private id=0; private seen=[new Set<string>(),new Set<string>()];
 constructor(players:{id:string;name:string}[]){
  this.state={phase:'battle',time:B.mainSeconds,overtime:false,elapsed:0,players:players.map(p=>({...p,energy:B.startEnergy,hand:CARDS.slice(0,4).map(c=>c.id),queue:CARDS.slice(4).map(c=>c.id),played:0,damage:0})),entities:[],shots:[],effects:[],fields:[],score:[0,0],winner:null,reason:'',matchId:randomUUID()};
  for(const side of [0,1] as Side[])for(const [x,y,core] of [[150,720,false],[450,720,false],[300,830,true]] as [number,number,boolean][]){const hp=core?B.coreHp:B.towerHp;this.state.entities.push({id:++this.id,kind:'tower',side,x,y:side===0?y:H-y,hp,maxHp:hp,radius:core?38:30,cooldown:.5,lane:x<300?150:450,core});}
 }
 play(side:Side,command:string,cardId:string,x:number,y:number):string|null{
  if(this.state.phase!=='battle')return 'Бой уже завершён';
  if(typeof command!=='string'||command.length>100||!command)return 'Некорректная команда';
  if(this.seen[side].has(command))return 'Эта команда уже обработана';
  this.seen[side].add(command);
  const p=this.state.players[side],c=CARDS.find(c=>c.id===cardId),index=p.hand.indexOf(cardId);
  if(!c||index<0||!Number.isFinite(x)||!Number.isFinite(y))return 'Некорректная карта или координаты';
  if(p.energy+1e-6<c.cost)return 'Недостаточно энергии';
  if(x<25||x>W-25||y<25||y>H-25)return 'Выберите место внутри арены';
  if(!c.spell){
   if(side===0?y<RIVER_BOTTOM+22:y>RIVER_TOP-22)return 'Войска можно размещать только на своей половине';
   if(this.state.entities.some(e=>e.kind==='tower'&&e.hp>0&&distance(e,{x,y})<e.radius+c.radius+22))return 'Слишком близко к башне';
  }
  p.energy-=c.cost;p.played++;p.hand[index]=p.queue.shift()!;p.queue.push(c.id);
  if(c.spell==='fire'){
   for(const e of this.state.entities)if(e.side!==side&&e.hp>0&&distance(e,{x,y})<=c.radius+e.radius)this.damage(e,c.damage,side);
   this.effect('fire',x,y,c.radius,side,.7);this.resolve();
  }else if(c.spell==='ice')this.state.fields.push({id:++this.id,side,x,y,radius:c.radius,ttl:c.duration!});
  else for(let i=0;i<(c.count||1);i++){
   const dx=c.count?(i-1)*20:0;
   this.state.entities.push({id:++this.id,kind:c.id,side,x:Math.max(15,Math.min(W-15,x+dx)),y:Math.max(15,Math.min(H-15,y+(i===1?15:0))),hp:c.hp,maxHp:c.hp,radius:c.radius,cooldown:.3,lane:BRIDGES.reduce((a,b)=>Math.abs(b-x)<Math.abs(a-x)?b:a)});
   this.effect('spawn',x+dx,y,25,side,.4);
  }
  return null;
 }
 private effect(kind:string,x:number,y:number,radius:number,side:Side,ttl=.35){this.state.effects.push({id:++this.id,kind,x,y,radius,side,ttl});}
 private damage(e:Entity,amount:number,side:Side){const actual=Math.min(Math.max(0,e.hp),amount);e.hp-=amount;this.state.players[side].damage+=actual;this.effect(e.hp<=0?'destroy':'hit',e.x,e.y,e.radius+8,side,e.hp<=0?.65:.2);}
 private slowed(e:Entity){return this.state.fields.some(f=>f.side!==e.side&&distance(e,f)<f.radius+e.radius)? .45:1;}
 tick(dt:number){
  const s=this.state;if(s.phase!=='battle')return;
  s.elapsed+=dt;s.time=Math.max(0,s.time-dt);
  for(const p of s.players)p.energy=Math.min(B.maxEnergy,p.energy+B.energyPerSecond*dt*(s.overtime?2:1));
  for(const e of s.effects)e.ttl-=dt;s.effects=s.effects.filter(e=>e.ttl>0);
  for(const f of s.fields)f.ttl-=dt;s.fields=s.fields.filter(f=>f.ttl>0);
  for(const shot of s.shots){
   const t=s.entities.find(e=>e.id===shot.target&&e.hp>0);if(t){shot.tx=t.x;shot.ty=t.y;}
   const d=distance(shot,{x:shot.tx,y:shot.ty}),step=480*dt;shot.ttl-=dt;
   if(d<=step||shot.ttl<=0){
    if(shot.splash){for(const e of s.entities)if(e.side!==shot.side&&e.hp>0&&distance(e,{x:shot.tx,y:shot.ty})<=shot.splash+e.radius)this.damage(e,shot.damage,shot.side);this.effect('blast',shot.tx,shot.ty,shot.splash,shot.side,.45);}
    else if(t)this.damage(t,shot.damage,shot.side);
    shot.ttl=0;
   }else{shot.x+=(shot.tx-shot.x)/d*step;shot.y+=(shot.ty-shot.y)/d*step;}
  }s.shots=s.shots.filter(p=>p.ttl>0);
  for(const e of s.entities){
   if(e.hp<=0)continue;
   const c=e.kind==='tower'?null:cardById(e.kind),range=c?.range??B.towerRange,speed=this.slowed(e);
   e.cooldown-=dt*speed;
   const foes=s.entities.filter(t=>t.side!==e.side&&t.hp>0&&(!c?.buildingOnly||t.kind==='tower'));
   // A reachable nearby troop takes priority; keep a live target until it leaves aggro.
   const reachable=(t:Entity)=>!(e.kind!=='tower'&&range<70&&this.acrossRiver(e,t)&&!this.onBridge(e.x));
   let target=foes.find(t=>t.id===e.target&&distance(e,t)<Math.max(B.aggro,range)+t.radius+35&&reachable(t));
   const nearby=foes.filter(t=>t.kind!=='tower'&&distance(e,t)<Math.max(B.aggro,range)+t.radius&&reachable(t)).sort((a,b)=>distance(e,a)-distance(e,b))[0];
   if(!target||target.kind==='tower'&&nearby)target=nearby;
   if(!target)target=foes.filter(t=>t.kind==='tower').sort((a,b)=>distance(e,a)-distance(e,b))[0];
   e.target=target?.id;if(!target)continue;
   const d=distance(e,target),canHit=d<=range+target.radius+(e.kind==='tower'?0:e.radius)&&reachable(target);
   if(canHit&&e.cooldown<=0){
    e.cooldown=c?.cooldown??B.towerCooldown;
    if(range>70)s.shots.push({id:++this.id,side:e.side,x:e.x,y:e.y,tx:target.x,ty:target.y,target:target.id,damage:c?.damage??B.towerDamage,splash:c?.splash??0,ttl:2,kind:c?.splash?'bomb':'arrow'});
    else this.damage(target,c!.damage,e.side);
   }
   if(c&&!canHit)this.move(e,target,c.speed*speed*dt);
  }
  this.separate(dt);this.resolve();
  if(s.phase==='battle'&&s.time<=1e-7){
   if(!s.overtime&&s.score[0]===s.score[1]){s.overtime=true;s.time=B.overtimeSeconds;this.effect('overtime',300,450,200,0,1);}
   else this.finish(s.score[0]===s.score[1]?null:s.score[0]>s.score[1]?0:1,s.overtime?'Дополнительное время истекло':'Время боя истекло');
  }
 }
 private onBridge(x:number){return BRIDGES.some(b=>Math.abs(x-b)<=36);}
 private acrossRiver(a:Entity,b:Entity){return a.y<RIVER_TOP&&b.y>RIVER_BOTTOM||b.y<RIVER_TOP&&a.y>RIVER_BOTTOM;}
 private move(e:Entity,t:Entity,step:number){
  let dest={x:t.x,y:t.y};
  if(e.side===0&&e.y>RIVER_TOP&&t.y<RIVER_BOTTOM){
   if(e.y>RIVER_BOTTOM+e.radius+5)dest={x:e.lane,y:RIVER_BOTTOM+e.radius+3};
   else if(Math.abs(e.x-e.lane)>12)dest={x:e.lane,y:e.y};
   else dest={x:e.lane,y:RIVER_TOP-e.radius-7};
  }else if(e.side===1&&e.y<RIVER_BOTTOM&&t.y>RIVER_TOP){
   if(e.y<RIVER_TOP-e.radius-5)dest={x:e.lane,y:RIVER_TOP-e.radius-3};
   else if(Math.abs(e.x-e.lane)>12)dest={x:e.lane,y:e.y};
   else dest={x:e.lane,y:RIVER_BOTTOM+e.radius+7};
  }
  const d=distance(e,dest);if(d>.1){e.x+=(dest.x-e.x)/d*Math.min(step,d);e.y+=(dest.y-e.y)/d*Math.min(step,d);}this.constrain(e);
 }
 private constrain(e:Entity){
  e.x=Math.max(e.radius,Math.min(W-e.radius,e.x));e.y=Math.max(e.radius,Math.min(H-e.radius,e.y));
  if(e.y>RIVER_TOP-e.radius&&e.y<RIVER_BOTTOM+e.radius){
   const bridge=BRIDGES.find(b=>Math.abs(e.x-b)<46);
   if(bridge!==undefined)e.x=Math.max(bridge-38+e.radius,Math.min(bridge+38-e.radius,e.x));
   else e.y=e.y<450?RIVER_TOP-e.radius:RIVER_BOTTOM+e.radius;
  }
 }
 private separate(dt:number){
  const units=this.state.entities.filter(e=>e.hp>0&&e.kind!=='tower');
  for(const u of units)for(const t of this.state.entities){
   if(u.id>=t.id&&t.kind!=='tower'||u.id===t.id||t.hp<=0)continue;
   const d=distance(u,t),min=u.radius+t.radius+1;if(d>=min)continue;
   const nx=d>.01?(u.x-t.x)/d:((u.id%2)?1:-1),ny=d>.01?(u.y-t.y)/d:0,push=Math.min((min-d)*.55,80*dt);
   u.x+=nx*push;u.y+=ny*push;if(t.kind!=='tower'){t.x-=nx*push;t.y-=ny*push;this.constrain(t);}this.constrain(u);
  }
 }
 private resolve(){
  const s=this.state,dead=s.entities.filter(e=>e.kind==='tower'&&e.hp<=0),cores=dead.filter(e=>e.core);
  s.score=[dead.filter(e=>e.side===1).length,dead.filter(e=>e.side===0).length];
  if(cores.length===2)this.finish(null,'Обе центральные крепости разрушены');
  else if(cores.length)this.finish((1-cores[0].side) as Side,'Центральная крепость разрушена');
  else if(s.overtime&&s.score[0]!==s.score[1])this.finish(s.score[0]>s.score[1]?0:1,'Первая башня в дополнительное время');
  s.entities=s.entities.filter(e=>e.kind==='tower'||e.hp>0);
 }
 finish(winner:Side|null,reason:string){if(this.state.phase==='result')return;this.state.phase='result';this.state.winner=winner;this.state.reason=reason;}
}
