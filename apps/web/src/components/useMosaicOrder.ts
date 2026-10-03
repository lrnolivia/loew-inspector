import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {normalizeOrder,moveCard} from '../../public/mosaic-order.js';
const storageKey='relay.telemetry.order.v1';
export function useMosaicOrder(){
 const [order,setOrder]=useState<string[]>(()=>{try{return normalizeOrder(JSON.parse(localStorage.getItem(storageKey)||'null'));}catch{return normalizeOrder(null);}});
 const [editing,setEditing]=useState(false),[message,setMessage]=useState('');
 const gesture=useRef<{id:number;x:number;y:number;key:string;dragging:boolean;host:HTMLElement}|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
 useEffect(()=>()=>clear(),[]);
 function down(e:PointerEvent<HTMLElement>){
  if(e.button!==0||(e.target as HTMLElement).closest('a,button,input,select,textarea'))return;
  const card=(e.target as HTMLElement).closest<HTMLElement>('[data-card]');if(!card?.dataset.card)return;
  gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,key:card.dataset.card,dragging:editing,host:e.currentTarget};
  if(editing){e.currentTarget.setPointerCapture(e.pointerId);return;}
  clear();timer.current=setTimeout(()=>{const g=gesture.current;if(!g)return;g.dragging=true;setEditing(true);setMessage('arrange cards, then choose done to save');try{g.host.setPointerCapture(g.id);}catch{}},500);
 }
 function move(e:PointerEvent<HTMLElement>){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  if(!g.dragging){if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>8){clear();gesture.current=null;}return;}
  const cards=[...e.currentTarget.querySelectorAll<HTMLElement>('[data-card]')];
  const target=cards.find(card=>{const r=card.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});
  const targetKey=target?.dataset.card;
  if(targetKey&&targetKey!==g.key)setOrder(current=>moveCard(current,g.key,targetKey));
 }
 function end(){clear();gesture.current=null;}
 function finish(){end();setEditing(false);try{localStorage.setItem(storageKey,JSON.stringify(order));setMessage('layout saved');}catch{setMessage('layout changed for this visit; saving is unavailable');}}
 function step(key:string,direction:number){setOrder(current=>{const i=current.indexOf(key),target=current[i+direction];return target?moveCard(current,key,target):current;});}
 return {order,editing,message,start:()=>{setEditing(true);setMessage('arrange cards, then choose done to save');},finish,step,handlers:{onPointerDown:down,onPointerMove:move,onPointerUp:end,onPointerCancel:end}};
}
