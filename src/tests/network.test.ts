import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server';
import {viewPoint} from '../shared';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
class Client{
 ws:WebSocket;messages:any[]=[];token='';id='';
 constructor(url:string){this.ws=new WebSocket(url);this.ws.on('error',()=>{});this.ws.on('message',raw=>{const m=JSON.parse(raw.toString());this.messages.push(m);if(m.type==='welcome'){this.token=m.token;this.id=m.id;}});}
 async join(name:string,token=''){if(this.ws.readyState!==WebSocket.OPEN)await new Promise<void>((r,j)=>{this.ws.once('open',()=>r());this.ws.once('error',j);});this.send({type:'join',name,token});await this.until(m=>m.type==='welcome');}
 send(m:unknown){this.ws.send(JSON.stringify(m));}
 async until(fn:(m:any)=>boolean){for(let i=0;i<150;i++){const m=this.messages.find(fn);if(m)return m;await sleep(20);}throw Error('Timeout waiting for message');}
}
test('real WebSocket clients: lobby, match, both perspectives, sync, reconnect, result, rematch, slots, capacity and forfeit',async()=>{
 const app=createGameServer();await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const port=(app.server.address() as any).port,url=`ws://127.0.0.1:${port}`,clients:Client[]=[];
 try{
  const a=new Client(url),b=new Client(url),watch=new Client(url);clients.push(a,b,watch);await a.join('Игрок A');await b.join('Игрок B');await watch.join('Зритель');
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200);assert.equal((await fetch(`http://127.0.0.1:${port}/api/network`)).status,200);
  a.send({type:'slot',player:a.id,slot:0});a.send({type:'slot',player:b.id,slot:1});await sleep(50);a.send({type:'ready'});b.send({type:'ready'});
  await a.until(m=>m.type==='state'&&m.state.phase==='battle');await b.until(m=>m.type==='state');await watch.until(m=>m.type==='state');assert.ok(app.match);
  const rotated=viewPoint(100,580,1);a.send({type:'play',id:'aa',card:'guard',x:100,y:580});b.send({type:'play',id:'bb',card:'guard',...rotated});await a.until(m=>m.type==='ack'&&m.id==='aa');await b.until(m=>m.type==='ack'&&m.id==='bb');
  assert.equal(app.match!.state.entities.filter(e=>e.kind==='guard').length,2);assert.ok(app.match!.state.players[0].energy<3);assert.ok(app.match!.state.players[1].energy<3);
  watch.send({type:'play',id:'spectate',card:'guard',x:100,y:580});await watch.until(m=>m.type==='error'&&m.id==='spectate');
  a.send({type:'play',id:'aa',card:'guard',x:100,y:580});await a.until(m=>m.type==='error'&&m.id==='aa');assert.equal(app.match!.state.players[0].played,1);
  const oldId=b.id,savedToken=b.token;b.ws.close();await sleep(80);const reconnect=new Client(url);clients.push(reconnect);await reconnect.join('Игрок B',savedToken);assert.equal(reconnect.id,oldId);await reconnect.until(m=>m.type==='state'&&m.state.entities.some((e:any)=>e.side===1&&e.kind==='guard'));
  // Server-controlled damage must reach every real socket with the same hp.
  const tower=app.match!.state.entities.find(e=>e.side===1&&!e.core)!;tower.hp-=123;await sleep(160);
  for(const c of [a,reconnect,watch]){const m=c.messages.filter(m=>m.type==='state').at(-1);assert.equal(m.state.entities.find((e:any)=>e.id===tower.id).hp,tower.hp);}
  app.match!.state.time=.01;app.match!.tick(.05);assert.equal(app.match!.state.overtime,true);tower.hp=0;app.match!.tick(.05);await a.until(m=>m.type==='state'&&m.state.phase==='result');
  const oldMatch=app.match!.state.matchId;a.send({type:'rematch'});reconnect.send({type:'rematch'});await a.until(m=>m.type==='state'&&m.state.matchId!==oldMatch);assert.equal(app.match!.state.phase,'battle');assert.equal(app.match!.state.players[0].energy,5);
  reconnect.ws.close();await sleep(100);app.sessions.get(oldId)!.disconnected=Date.now()-31000;await sleep(130);assert.equal(app.match!.state.phase,'result');assert.equal(app.match!.state.winner,0);assert.match(app.match!.state.reason,/30 секунд/);
  a.send({type:'lobby'});await sleep(60);a.send({type:'slot',player:watch.id,slot:1});await sleep(60);a.send({type:'ready'});watch.send({type:'ready'});await sleep(100);assert.equal(app.match!.state.players[1].id,watch.id);
  for(let i=0;i<7;i++){const c=new Client(url);clients.push(c);if(i<6)await c.join('Зритель '+i);else{if(c.ws.readyState!==WebSocket.OPEN)await new Promise<void>(r=>c.ws.once('open',()=>r()));c.send({type:'join',name:'Девятый'});await c.until(m=>m.type==='error'&&m.message.includes('8'));}}
  assert.equal(app.sessions.size,8);
 }finally{for(const c of clients)c.ws.close();await sleep(30);app.close();}
});
