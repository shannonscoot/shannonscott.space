const map = document.querySelector('.map');
const field = document.querySelector('.field');
const panel = document.querySelector('aside');
const picker = document.querySelector('#index');
const photo = document.querySelector('#photo');
const pins = [...field.querySelectorAll('.pin')];
const zones = [...field.querySelectorAll('.region')];
// Bounds of the hand-drawn diagrams in land.svg (in map units).
const diagrams = [
  [144,276,184,316], [325,266,381,309], [647,388,691,432],
  [235,553,384,624], [949,529,993,556], [1149,339,1193,358],
  [822,326,893,368], [771,768,859,799], [697,456,744,472], [607,678,683,732]
];
const svgNS = 'http://www.w3.org/2000/svg';
const leaders = document.createElementNS(svgNS,'svg');
leaders.setAttribute('viewBox','0 0 1250 815');
leaders.setAttribute('aria-hidden','true');
leaders.classList.add('pin-leaders');
field.prepend(leaders);
const markerLines = pins.map(pin => {
  const line = document.createElementNS(svgNS,'line');
  const dot = document.createElementNS(svgNS,'circle');
  const spot = places[pin.dataset.site];
  for(const key of ['x','y']){
    line.setAttribute(key+'1',spot[key]);
    dot.setAttribute('c'+key,spot[key]);
  }
  line.setAttribute('x2',spot.x);
  dot.setAttribute('r',5);
  leaders.append(line,dot);
  return {pin,spot,line,dot};
});
const pointers = new Map();
let scale, x, y, active, lastFocus, dragged = false, gesture, fitted = true;
let oldWidth,oldHeight;
let lastLayout = '';
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const compact = () => map.clientWidth <= 1100;
function fitScale() {
  const w=map.clientWidth,h=map.clientHeight;
  if(!compact())return Math.min(w/1250,h/815);
  // Fit the inhabited area with space for thumbnail edges and the map controls.
  return Math.max(.14, Math.min((w-20)/1100,(h-92)/675));
}
function layoutMarkers() {
  const isCompact=compact();
  const layoutKey=[map.clientWidth,map.clientHeight,scale].join(':');
  if(layoutKey===lastLayout)return;
  lastLayout=layoutKey;
  field.classList.toggle('compact-markers',isCompact);
  const margin=isCompact ? 14 : Math.max(4,3/scale);
  const protectedAreas=diagrams.concat(zones.map(zone=>{
    const {offsetLeft:x,offsetTop:y,offsetWidth:w,offsetHeight:h}=zone;
    return [x-w/2,y-h/2,x+w/2,y+h/2];
  }));
  // At overview size keep every marker in the viewport. On zoom, use the
  // map limits instead so dragging never changes a card's map position.
  const overview=Math.abs(scale-fitScale())<.000001;
  const fitX=overview?Math.max(0,(1250-map.clientWidth/scale)/2):0;
  const fitY=overview?Math.max(0,(815-map.clientHeight/scale)/2):0;
  const metrics=markerLines.map(item=>({...item,w:item.pin.offsetWidth,h:item.pin.offsetHeight}));
  const intersects=(a,b)=>a[0]<b[2]+margin && a[2]>b[0]-margin && a[1]<b[3]+margin && a[3]>b[1]-margin;
  const used=[];
  for(const {pin,spot,line,dot,w,h} of metrics){
    const preferredY=spot.y;
    const obstacles=protectedAreas.concat(used);
    let choice;
    for(const size of [1,.94,.88,.82,.76]){
      const half=w*size/2, up=h*size*.77, down=h*size*.23;
      const minX=fitX+half, maxX=1250-fitX-half, minY=fitY+up, maxY=815-fitY-down;
      const xs=new Set([clamp(spot.x,minX,maxX)]), ys=new Set([clamp(preferredY,minY,maxY)]);
      for(const [l,t,r,b] of obstacles){
        for(const x of [l-margin-half,r+margin+half])if(x>=minX&&x<=maxX)xs.add(x);
        for(const y of [t-margin-down,b+margin+up])if(y>=minY&&y<=maxY)ys.add(y);
      }
      for(const x of xs)for(const y of ys){
        const distance=(x-spot.x)**2*1.3+(y-preferredY)**2;
        if(choice&&distance>=choice.distance)continue;
        const bounds=[x-half,y-up,x+half,y+down];
        if(!obstacles.some(area=>intersects(bounds,area)))choice={x,y,size,distance,bounds};
      }
      if(choice)break;
    }
    if(!choice){
      const bottom=Math.max(...obstacles.map(area=>area[3]))+margin+1;
      choice={x:spot.x,y:bottom+h*.77,size:1,bounds:[spot.x-w/2,bottom,spot.x+w/2,bottom+h]};
    }
    used.push(choice.bounds);
    pin.style.setProperty('--marker-offset-x',(choice.x-spot.x)+'px');
    pin.style.setProperty('--marker-offset-y',(choice.y-spot.y)+'px');
    pin.style.setProperty('--marker-size',choice.size);
    line.setAttribute('x2',choice.x);
    line.setAttribute('y2',choice.y);
    line.style.opacity=dot.style.opacity=Math.hypot(choice.x-spot.x,choice.y-spot.y)*scale<4?0:1;
  }
}
function paint() {
  function bound(value,viewport,length) {
    return length < viewport ? (viewport-length)/2 : clamp(value,viewport-length,0);
  }
  x=bound(x,map.clientWidth,1250*scale);
  y=bound(y,map.clientHeight,815*scale);
  field.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';
  map.style.backgroundSize=`${6250*scale}px ${5705*scale}px`;
  map.style.backgroundPosition=`${x-2500*scale}px ${y-2445*scale}px`;
  layoutMarkers();
}
function center(px,py) {
  x=map.clientWidth/2-px*scale;
  y=map.clientHeight/2-py*scale;
  paint();
}
function reset(fullOverview=false) {
  fitted=true;
  scale=fitScale();
  if(compact() && !fullOverview)scale=Math.max(scale,Math.min(.95,Math.max(.48,map.clientWidth/800),map.clientHeight/640));
  center(640,407.5);
}
function zoom(value,cx,cy) {
  fitted=false;
  const next=clamp(value,fitScale(),Math.max(3,fitScale()*3));
  x=cx-(cx-x)*next/scale;
  y=cy-(cy-y)*next/scale;
  scale=next; paint();
}
function select(slug,fromIndex=false) {
  const p=places[slug];
  if(!p)return;
  active=slug;
  lastFocus=fromIndex ? picker.querySelector('summary') : pins.find(pin=>pin.dataset.site===slug);
  picker.open=false;
  pins.forEach(pin=>pin.classList.toggle('selected',pin.dataset.site===slug));
  if(fromIndex) {fitted=false;scale=Math.max(.9,scale);center(p.x,p.y);}
  document.querySelector('#name').textContent=p.title;
  document.querySelector('#group').textContent=p.category+' · '+p.group;
  // The full case study retains the complete project description and credits.
  document.querySelector('#description').textContent=p.description.split(/(?<=\.)\s/)[0];
  photo.hidden=!p.photo;
  if(p.photo)photo.src=new URL('../assets/'+p.photo,document.baseURI).href;
  document.querySelector('#visit').href=slug+'.html';
  panel.hidden=false;
  history.replaceState(null,'',location.pathname+location.search+'#'+slug);
  document.querySelector('#visit').focus({preventScroll:true});
}
function closePanel() {
  if(panel.hidden)return;
  panel.hidden=true;
  pins.forEach(pin=>pin.classList.remove('selected'));
  active=null; history.replaceState(null,'',location.pathname+location.search);
  lastFocus?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
  const a=event.target.closest('.pin[data-site]');
  if(a && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey){
    event.preventDefault();
    if(!dragged)select(a.dataset.site);
  } else if(!picker.contains(event.target))picker.open=false;
});
document.querySelector('#close').onclick=closePanel;
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(picker.open)picker.open=false;else closePanel();}
});
for(const [id,factor] of [['plus',1.3],['minus',1/1.3]]) {
  document.getElementById(id).onclick=()=>zoom(scale*factor,map.clientWidth/2,map.clientHeight/2);
}
document.querySelector('#fit').onclick=()=>{closePanel();reset(true);};
function point(event) {
  const box=map.getBoundingClientRect();
  return {x:event.clientX-box.left,y:event.clientY-box.top};
}
function snapshot() {
  const [a,b]=pointers.values();
  if(!a)return;
  const cx=b?(a.x+b.x)/2:a.x,cy=b?(a.y+b.y)/2:a.y;
  gesture={cx,cy,x,y,scale,d:b?Math.hypot(a.x-b.x,a.y-b.y):0};
}
map.addEventListener('pointerdown',event=>{
  if(event.button!==0 || event.target.closest('button'))return;
  pointers.set(event.pointerId,point(event));
  if(pointers.size===1)dragged=false;
  snapshot();
});
map.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  pointers.set(event.pointerId,point(event));
  const [a,b]=pointers.values();
  const cx=b?(a.x+b.x)/2:a.x,cy=b?(a.y+b.y)/2:a.y;
  if(!b && !dragged && Math.hypot(cx-gesture.cx,cy-gesture.cy)<5)return;
  dragged=true;map.setPointerCapture(event.pointerId);
  fitted=false;
  map.classList.add('dragging');
  scale=b?clamp(gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.d),fitScale(),Math.max(3,fitScale()*3)):gesture.scale;
  x=cx-(gesture.cx-gesture.x)*scale/gesture.scale;
  y=cy-(gesture.cy-gesture.y)*scale/gesture.scale;
  paint();
});
function release(event) {
  if(!pointers.delete(event.pointerId))return;
  if(pointers.size)snapshot();
  else {map.classList.remove('dragging');setTimeout(()=>{dragged=false;},0);}
}
window.addEventListener('pointerup',release);
window.addEventListener('pointercancel',release);
map.addEventListener('wheel',event=>{
  event.preventDefault();
  const p=point(event);
  zoom(scale*Math.exp(-clamp(event.deltaY,-120,120)*.0025),p.x,p.y);
},{passive:false});
const resizeObserver=new ResizeObserver(()=>{
  if(!map.clientWidth || !map.clientHeight)return;
  const w=map.clientWidth,h=map.clientHeight;
  if(w===oldWidth && h===oldHeight)return;
  if(fitted || !oldWidth)reset();
  else {
    const px=(oldWidth/2-x)/scale,py=(oldHeight/2-y)/scale;
    scale=Math.max(scale,fitScale());
    center(px,py);
  }
  oldWidth=w;oldHeight=h;
});
reset();
oldWidth=map.clientWidth;oldHeight=map.clientHeight;
resizeObserver.observe(map);
if(Object.hasOwn(places,location.hash.slice(1)))select(location.hash.slice(1),true);
