const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const PORT=Number(process.env.PORT||3000);
const URLS={met:'https://www.ndbc.noaa.gov/data/realtime2/44065.txt',spec:'https://www.ndbc.noaa.gov/data/realtime2/44065.spec',forecast:'https://api.weather.gov/zones/forecast/ANZ450/forecast'};
const cache=new Map();
// Hand-curated, properly attributed NOAA/Smithsonian fish photography.
// No runtime image-search API: Commons Special:FilePath resolves verified file titles.
const FISH_PHOTOS=[
 {name:'Striped bass',file:'Morone saxatilis striped bass fish close up underwater high definiton image.jpg',credit:'U.S. Fish and Wildlife Service'},
 {name:'Black sea bass',file:'Centropristis striata underwater 2.jpg',credit:"Greg McFall / NOAA Gray's Reef"},
 {name:'Black sea bass at Gray’s Reef',file:"Black sea bass at Gray's Reef National Marine Sanctuary in Georgia.jpg",credit:'NOAA National Ocean Service'},
 {name:'Black sea bass at Gray’s Reef',file:'GRNMS - Black Sea Bass (26820993210).jpg',credit:'Greg McFall / NOAA'},
 {name:'Striped bass',file:'Striped bass.jpg',credit:'U.S. Fish and Wildlife Service'},
 {name:'Bluefish',file:'Bluefish noaa.jpg',credit:'NOAA'}
];
let fishQueue=[];
let lastFish=-1;
function nextFishIndex(){
 if(!fishQueue.length){
  fishQueue=FISH_PHOTOS.map((_,i)=>i);
  for(let i=fishQueue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[fishQueue[i],fishQueue[j]]=[fishQueue[j],fishQueue[i]];}
  if(fishQueue[0]===lastFish&&fishQueue.length>1)[fishQueue[0],fishQueue[1]]=[fishQueue[1],fishQueue[0]];
 }
 lastFish=fishQueue.shift();return lastFish;
}
async function randomFish(){
 const item=FISH_PHOTOS[nextFishIndex()];
 return {name:item.name,url:'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(item.file),source:'U.S. government wildlife photography via Wikimedia Commons',credit:item.credit,page:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(item.file.replace(/ /g,'_'))};
}

async function upstream(url){const old=cache.get(url);if(old&&Date.now()-old.at<300000)return old.body;const r=await fetch(url,{headers:{'User-Agent':'SandyHookMarineDashboard/1.0 (marine conditions informational dashboard)','Accept':'text/plain, application/geo+json, application/json'},signal:AbortSignal.timeout(13000)});if(!r.ok)throw Error('Upstream '+r.status);const body=await r.text();cache.set(url,{at:Date.now(),body});return body;}
function parseDate(a){return new Date(Date.UTC(+a[0],+a[1]-1,+a[2],+a[3],+a[4])).toISOString();}
function parseRows(t){return t.split(/\r?\n/).filter(x=>x.trim()&&!x.startsWith('#')).map(x=>x.trim().split(/\s+/));}
function val(s){const n=Number(s);return s&&s!=='MM'&&Number.isFinite(n)&&n<999?n:null;}
function latest(rows,i){for(const a of rows){if(val(a[i])!==null)return {value:val(a[i]),time:parseDate(a)};}return {value:null,time:null};}
function parseMet(t){const rows=parseRows(t),g=i=>latest(rows,i);return {wind:g(6),gust:g(7),windDirection:g(5),waveHeight:g(8),dominantPeriod:g(9),waterTemp:g(15)};}
function parseSpec(t){for(const a of parseRows(t)){if(a.length>=12&&val(a[8])!==null)return {time:parseDate(a),windWaveHeightM:val(a[8]),windWavePeriodS:val(a[9]),windWaveDirection:a[12],swellHeightM:val(a[6]),swellPeriodS:val(a[7]),swellDirection:a[11]};}return null;}
async function data(){const [m,s,f]=await Promise.allSettled([upstream(URLS.met),upstream(URLS.spec),upstream(URLS.forecast)]);let forecast=null;if(f.status==='fulfilled'){try{const j=JSON.parse(f.value);forecast={updated:j.properties?.updated||null,periods:(j.properties?.periods||[]).map(p=>({name:p.name,start:p.startTime,end:p.endTime,text:p.detailedForecast||p.shortForecast||''}))};}catch{}}return {fetchedAt:new Date().toISOString(),observed:m.status==='fulfilled'?parseMet(m.value):null,spectral:s.status==='fulfilled'?parseSpec(s.value):null,forecast,errors:{observed:m.status==='rejected'?'NOAA observations unavailable':null,spectral:s.status==='rejected'?'NOAA spectral summary unavailable':null,forecast:f.status==='rejected'?'NWS marine forecast unavailable: '+String(f.reason?.message||f.reason):forecast===null?'NWS forecast response could not be parsed':null}};}
function health(d){const now=Date.now(),recent=(t,max)=>!!t&&Number.isFinite(Date.parse(t))&&Math.abs(now-Date.parse(t))<=max*60000;const o=d.observed||{},s=d.spectral;const tests={wind:recent(o.wind?.time,90)&&o.wind.value!==null,waveHeight:recent(o.waveHeight?.time,90)&&o.waveHeight.value!==null,dominantPeriod:recent(o.dominantPeriod?.time,120)&&o.dominantPeriod.value!==null,windWave:recent(s?.time,120)&&s.windWaveHeightM!==null&&s.windWavePeriodS!==null,forecast:!!d.forecast?.periods?.some(p=>Date.parse(p.end)>now)};return {status:Object.values(tests).every(Boolean)?'ok':'degraded',tests,sourceTimes:{wind:o.wind?.time||null,waveHeight:o.waveHeight?.time||null,dominantPeriod:o.dominantPeriod?.time||null,windWave:s?.time||null,forecast:d.forecast?.updated||null},errors:d.errors,checkedAt:d.fetchedAt};}
http.createServer(async(req,res)=>{try{if(req.url==='/api/fish-photo'){try{const photo=await randomFish();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(photo));}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');}return;}if(req.url==='/api/health'){const h=health(await data());res.writeHead(h.status==='ok'?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(h));return;}if(req.url==='/api/conditions'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(await data()));return;}if(req.url==='/sandy_hook_exact_mockup_header.png'){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});fs.createReadStream(path.join(__dirname,'sandy_hook_exact_mockup_header.png')).pipe(res);return;}if(req.url==='/assets/striped-bass-pixel.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=86400'});fs.createReadStream(path.join(__dirname,'assets','striped-bass-pixel.svg')).pipe(res);return;}if(req.url==='/assets/great-wave-pixel.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=86400'});fs.createReadStream(path.join(__dirname,'assets','great-wave-pixel.svg')).pipe(res);return;}if(req.url==='/assets/buffett-postcard.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=3600'});fs.createReadStream(path.join(__dirname,'assets','buffett-postcard.svg')).pipe(res);return;}if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);return;}res.writeHead(404);res.end('Not found');}catch(e){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Data service unavailable'}));}}).listen(PORT,()=>console.log('Listening on '+PORT));