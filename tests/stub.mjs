// Browser stub: enough DOM/canvas/audio for the game module to run in node.
const noop = () => {};
const mkCtx = () => new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? {} : (t[k] ??= noop)),
  set: () => true,
});
const mkEl = (tag='div') => {
  const e = {
    tagName:tag, textContent:'', innerHTML:'', hidden:false, width:0, height:0,
    offsetWidth:0, srcObject:null,
    style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{ _s:new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)},
      toggle(c,v){ v===undefined ? (this._s.has(c)?this._s.delete(c):this._s.add(c))
                                 : (v?this._s.add(c):this._s.delete(c)) },
      contains(c){return this._s.has(c)} },
    appendChild(){}, remove(){}, setAttribute(){}, addEventListener(){},
    getContext:()=>mkCtx(), play:async()=>{},
    _kids:[],
    querySelector(sel){ return (this._kids.find(k=>k._sel===sel) || mkEl()); },
    querySelectorAll(sel){ return this._kids.filter(k=>k._sel===sel); },
  };
  return e;
};
const bag = {};
globalThis.document = {
  getElementById:(id)=>(bag[id] ??= mkEl()),
  createElement:(t)=>mkEl(t),
  body:mkEl(), documentElement:mkEl(),
};
// #tries holds three .try pips
bag.tries = mkEl();
bag.tries._kids = [0,1,2].map(()=>{ const d=mkEl(); d._sel='.try'; return d; });
// #banner holds a <b> and a <span>
bag.banner = mkEl();
bag.banner._kids = ['b','span'].map(s=>{ const d=mkEl(s); d._sel=s; return d; });

globalThis.window = globalThis;
globalThis.location = { search:'' };
// Node 21+ defines a read-only global navigator, so plain assignment throws.
Object.defineProperty(globalThis, 'navigator', { configurable:true,
  value:{ vibrate(){}, mediaDevices:{ getUserMedia:async()=>({}) } } });
globalThis.devicePixelRatio = 2;
globalThis.innerWidth = 390; globalThis.innerHeight = 844;
globalThis.addEventListener = noop;
const store = new Map();
globalThis.localStorage = {
  getItem:(k)=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
};
globalThis.AudioContext = class {
  constructor(){ this.state='running'; this.currentTime=0; }
  resume(){}
  createOscillator(){ return { type:'', frequency:{value:0,setValueAtTime:noop},
    connect:(x)=>x, start:noop, stop:noop }; }
  createGain(){ return { gain:{setValueAtTime:noop,linearRampToValueAtTime:noop,
    exponentialRampToValueAtTime:noop}, connect:(x)=>x }; }
};
globalThis.__BAG = bag;
