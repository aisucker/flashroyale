import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import QRCode from 'qrcode';
import {Match} from './engine';
import {CARDS,Side} from './shared';
export interface Session{id:string;token:string;name:string;socket:WebSocket|null;disconnected:number|null;alive:number;ready:boolean;rematch:boolean;commands:number;window:number}
export function createGameServer(){
 const sessions=new Map<string,Session>();let slots:(string|null)[]=[null,null],host:string|null=null,match:Match|null=null;
 const port=Number(process.env.PORT||3000),publicRoot=path.join(__dirname,'public');
 function addresses(){const a=[] as {name:string;url:string}[];for(const [name,list]of Object.entries(os.networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)a.push({name,url:`http://${n.address}:${port}`});return a.sort((x,y)=>Number(/VPN|Virtual|vEthernet|Tunnel/i.test(x.name))-Number(/VPN|Virtual|vEthernet|Tunnel/i.test(y.name)));}
 const server=http.createServer(async(req,res)=>{
  try{
   const u=new URL(req.url||'/', 'http://localhost');
   if(u.pathname==='/api/network'){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({addresses:addresses(),port}));return;}
   if(u.pathname==='/api/qr'){
    const allowed=addresses().map(a=>a.url),address=u.searchParams.get('address')||allowed[0];
    if(!allowed.includes(address)){res.writeHead(400);res.end('Unknown LAN address');return;}
    res.setHeader('Content-Type','image/svg+xml');res.end(await QRCode.toString(address,{type:'svg',margin:2,width:220,color:{dark:'#112b35',light:'#ffffff'}}));return;
   }
   const files:Record<string,string>={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/client.js':'client.js'};
   const file=files[u.pathname];if(!file){res.writeHead(404);res.end('Not found');return;}
   res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8');
   res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');fs.createReadStream(path.join(publicRoot,file)).pipe(res);
  }catch{res.writeHead(500);res.end('Server error');}
 });
 const wss=new WebSocketServer({server,maxPayload:4096});
 function send(s:Session,data:unknown){if(s.socket?.readyState===WebSocket.OPEN)s.socket.send(JSON.stringify(data));}
 function lobby(){return {type:'lobby',players:[...sessions.values()].map(s=>({id:s.id,name:s.name,online:!!s.socket,ready:s.ready,rematch:s.rematch})),slots,host,phase:match?.state.phase||'lobby'};}
 function broadcastLobby(){const state=lobby();for(const s of sessions.values())send(s,state);}
 function broadcastMatch(){if(match)for(const s of sessions.values())send(s,{type:'state',state:match.state});}
 function err(s:Session,message:string,id?:string){send(s,{type:'error',message,id});}
 function newMatch(){
  if(!slots.every(id=>id&&sessions.get(id)?.socket&&sessions.get(id)?.ready))return;
  match=new Match(slots.map(id=>({id:id!,name:sessions.get(id!)!.name})));for(const s of sessions.values()){s.ready=false;s.rematch=false;}broadcastLobby();broadcastMatch();
 }
 function backToLobby(){match=null;for(const s of sessions.values()){s.ready=false;s.rematch=false;}broadcastLobby();}
 function chooseHost(){if(!host||!sessions.get(host)?.socket)host=[...sessions.values()].find(s=>s.socket)?.id||null;}
 wss.on('connection',(socket,req)=>{
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host){socket.close(1008,'Origin not allowed');return;}}catch{socket.close(1008);return;}}
  let current:Session|null=null;const timeout=setTimeout(()=>{if(!current)socket.close(1008,'Join timeout');},10000);
  socket.on('message',raw=>{
   let m:any;try{m=JSON.parse(raw.toString());if(!m||typeof m.type!=='string')throw Error();}catch{socket.close(1008,'Invalid message');return;}
   if(!current){
    if(m.type!=='join')return;
    const existing=typeof m.token==='string'?[...sessions.values()].find(s=>s.token===m.token):undefined;
    if(existing){existing.socket?.close(4001,'Session moved');current=existing;current.socket=socket;current.disconnected=null;current.alive=Date.now();}
    else{
     if(sessions.size>=8){socket.send(JSON.stringify({type:'error',message:'Все 8 мест заняты. Попробуйте позже.'}));socket.close(4000,'Room full');return;}
     const name=typeof m.name==='string'?m.name.trim().slice(0,18):'';if(!name){socket.send(JSON.stringify({type:'error',message:'Введите имя'}));return;}
     current={id:randomUUID(),token:randomBytes(24).toString('hex'),name,socket,disconnected:null,alive:Date.now(),ready:false,rematch:false,commands:0,window:Date.now()};sessions.set(current.id,current);
    }
    clearTimeout(timeout);chooseHost();send(current,{type:'welcome',id:current.id,token:current.token,cards:CARDS});broadcastLobby();if(match)send(current,{type:'state',state:match.state});return;
   }
   const s=current;if(s.socket!==socket)return;
   const now=Date.now();if(now-s.window>1000){s.window=now;s.commands=0;}if(++s.commands>25)return err(s,'Слишком много команд');
   if(m.type==='ping'){send(s,{type:'pong',at:m.at});return;}
   if(m.type==='play'){
    if(!match||match.state.phase!=='battle')return err(s,'Сейчас нет активного боя',m.id);
    const side=match.state.players.findIndex(p=>p.id===s.id);if(side<0)return err(s,'Зритель не может разыгрывать карты',m.id);
    const error=match.play(side as Side,m.id,m.card,m.x,m.y);if(error)err(s,error,m.id);else{send(s,{type:'ack',id:m.id});broadcastMatch();}return;
   }
   if(m.type==='leave'){
    if(match?.state.phase==='battle'&&slots.includes(s.id))match.finish((1-slots.indexOf(s.id)) as Side,'Соперник покинул бой');
    slots=slots.map(id=>id===s.id?null:id);sessions.delete(s.id);socket.close(1000,'Left');chooseHost();broadcastLobby();broadcastMatch();return;
   }
   if(m.type==='rematch'&&match?.state.phase==='result'&&slots.includes(s.id)){
    s.rematch=!s.rematch;s.ready=s.rematch;broadcastLobby();if(slots.every(id=>id&&sessions.get(id)?.rematch))newMatch();return;
   }
   if(m.type==='lobby'&&match?.state.phase==='result'&&(host===s.id||slots.includes(s.id))){backToLobby();return;}
   if(match)return err(s,'Сначала завершите текущий бой');
   if(m.type==='slot'){
    const index=m.slot;if(index!==0&&index!==1&&index!==-1)return;
    if(typeof m.player!=='string')return;
    const who=m.player;if(who!==s.id&&host!==s.id)return err(s,'Выбор соперника доступен ведущему');
    if(!sessions.get(who)?.socket)return err(s,'Игрок отключён');
    if(index>=0&&slots[index]&&slots[index]!==who&&host!==s.id)return err(s,'Место уже занято');
    slots=slots.map(id=>id===who?null:id);if(index>=0)slots[index]=who;
    for(const p of sessions.values())p.ready=false;broadcastLobby();return;
   }
   if(m.type==='ready'&&slots.includes(s.id)){s.ready=!s.ready;broadcastLobby();newMatch();}
  });
  socket.on('pong',()=>{if(current?.socket===socket)current.alive=Date.now();});
  socket.on('close',()=>{clearTimeout(timeout);if(current?.socket===socket){current.socket=null;current.disconnected??=Date.now();current.ready=false;chooseHost();broadcastLobby();}});
  socket.on('error',()=>{});
 });
 let last=performance.now(),accum=0,lastPing=Date.now();
 const timer=setInterval(()=>{
  const now=performance.now(),dt=Math.min(.2,(now-last)/1000);last=now;
  if(Date.now()-lastPing>=5000){lastPing=Date.now();for(const s of sessions.values())if(s.socket){if(Date.now()-s.alive>10000){s.disconnected=s.alive;s.socket.terminate();}else s.socket.ping();}}
  const expired=[...sessions.values()].filter(s=>s.disconnected!==null&&Date.now()-s.disconnected>30000);
  if(match?.state.phase==='battle'){
   const missing=match.state.players.map(p=>expired.some(s=>s.id===p.id));
   if(missing[0]&&missing[1])match.finish(null,'Оба игрока отключены больше 30 секунд');
   else if(missing[0]||missing[1])match.finish(missing[0]?1:0,'Техническая победа: соперник отсутствовал 30 секунд');
   match.tick(dt);
  }
  for(const s of expired){sessions.delete(s.id);if(match?.state.phase!=='battle')slots=slots.map(id=>id===s.id?null:id);}
  if(expired.length){chooseHost();broadcastLobby();}
  accum+=dt;if(accum>=.1){accum=0;broadcastMatch();}
 },50);
 return {server,wss,sessions,get match(){return match;},addresses,close:()=>{clearInterval(timer);wss.clients.forEach(s=>s.close());wss.close();server.close();}};
}
if(require.main===module){
 const app=createGameServer(),runtime=path.join(__dirname,'../.arena-server.json');const port=Number(process.env.PORT||3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be 1…65535');
 app.server.listen(port,'0.0.0.0',()=>{
  fs.writeFileSync(runtime,JSON.stringify({pid:process.pid,started:new Date(Date.now()-process.uptime()*1000).toISOString(),port}));
  console.log(`Арена крепостей — http://localhost:${port}`);for(const a of app.addresses())console.log(`Телефоны (${a.name}): ${a.url}`);
 });
 process.on('exit',()=>{try{if(JSON.parse(fs.readFileSync(runtime,'utf8')).pid===process.pid)fs.unlinkSync(runtime);}catch{}});
 for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{app.close();process.exit(0);});
 app.server.on('error',e=>{console.error('Не удалось запустить сервер:',e.message);process.exit(1);});
}
