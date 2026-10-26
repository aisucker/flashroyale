export const W=600, H=900, RIVER_TOP=420, RIVER_BOTTOM=480;
export const BRIDGES=[150,450];
export type Side=0|1;
export interface Card {id:string;name:string;cost:number;description:string;icon:string;hp:number;damage:number;speed:number;range:number;cooldown:number;radius:number;count?:number;buildingOnly?:boolean;spell?:'fire'|'ice';splash?:number;duration?:number}
export const CARDS:Card[]=[
 {id:'guard',name:'Страж',cost:3,description:'Надёжный боец ближнего боя.',icon:'🛡',hp:520,damage:85,speed:50,range:23,cooldown:.9,radius:13},
 {id:'archer',name:'Арбалетчица',cost:3,description:'Стреляет издалека. Берегите от ближнего боя.',icon:'➶',hp:240,damage:65,speed:47,range:155,cooldown:1.05,radius:10},
 {id:'giant',name:'Каменный великан',cost:5,description:'Медленный исполин. Атакует только здания.',icon:'◆',hp:1650,damage:125,speed:29,range:25,cooldown:1.4,radius:21,buildingOnly:true},
 {id:'runners',name:'Бегуны',cost:2,description:'Три быстрых бойца с небольшим запасом здоровья.',icon:'»',hp:130,damage:38,speed:86,range:18,cooldown:.65,radius:8,count:3},
 {id:'bomber',name:'Подрывник',cost:4,description:'Бросает бомбы. Поражает врагов в радиусе 52.',icon:'✹',hp:290,damage:115,speed:42,range:130,cooldown:1.65,radius:12,splash:52},
 {id:'knight',name:'Железный рыцарь',cost:6,description:'Тяжёлая броня и мощный удар.',icon:'⚔',hp:1100,damage:190,speed:40,range:26,cooldown:1.15,radius:17},
 {id:'fire',name:'Огненный удар',cost:4,description:'Мгновенно наносит 260 урона в радиусе 82.',icon:'☄',hp:0,damage:260,speed:0,range:0,cooldown:0,radius:82,spell:'fire'},
 {id:'ice',name:'Ледяное поле',cost:3,description:'Замедляет движение и атаки врагов на 55% на 6 секунд.',icon:'❄',hp:0,damage:0,speed:0,range:0,cooldown:0,radius:95,spell:'ice',duration:6}
];
export const BALANCE={maxEnergy:10,startEnergy:5,energyPerSecond:.55,mainSeconds:180,overtimeSeconds:60,towerHp:1800,coreHp:2800,towerDamage:70,towerRange:190,towerCooldown:1,aggro:150};
export interface Entity {id:number;side:Side;x:number;y:number;hp:number;maxHp:number;radius:number;kind:string;cooldown:number;target?:number;lane:number;core?:boolean}
export interface Effect {id:number;kind:string;x:number;y:number;radius:number;ttl:number;side:Side}
export interface Shot {id:number;side:Side;x:number;y:number;tx:number;ty:number;target:number;damage:number;splash:number;ttl:number;kind:string}
export interface Field {id:number;side:Side;x:number;y:number;radius:number;ttl:number}
export interface Fighter {id:string;name:string;energy:number;hand:string[];queue:string[];played:number;damage:number}
export interface Snapshot {phase:'battle'|'result';time:number;overtime:boolean;elapsed:number;players:Fighter[];entities:Entity[];effects:Effect[];shots:Shot[];fields:Field[];score:number[];winner:Side|null;reason:string;matchId:string}
export function viewPoint(x:number,y:number,side:Side|null){return side===1?{x:W-x,y:H-y}:{x,y};}
export function cardById(id:string){return CARDS.find(c=>c.id===id)!;}
