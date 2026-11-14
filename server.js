const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const PORT=Number(process.env.PORT||3000);
const URLS={met:'https://www.ndbc.noaa.gov/data/realtime2/44065.txt',spec:'https://www.ndbc.noaa.gov/data/realtime2/44065.spec',forecast:'https://api.weather.gov/zones/forecast/ANZ450/forecast'};
const cache=new Map();
// Hand-curated, properly attributed NOAA/Smithsonian fish photography.
// No runtime image-search API: Commons Special:FilePath resolves verified file titles.
const FISH_PHOTOS=[
 {name:'Striped bass',file:'Morone saxatilis striped bass fish close up underwater high definiton image.jpg',credit:'Wikimedia Commons contributor'},
 {name:'Black sea bass',file:'Centropristis striata underwater 2.jpg',credit:"Greg McFall / NOAA Gray's Reef National Marine Sanctuary"},
 {name:'Black sea bass at Gray’s Reef',file:"Black sea bass at Gray's Reef National Marine Sanctuary in Georgia.jpg",credit:'NOAA National Ocean Service'},
 {name:'Bluefish',file:'Pomatomus saltatrix - SERC.jpg',credit:'Smithsonian Environmental Research Center'}
];
let previousFishIndex=-1;
async function randomFish(){
 let index=Math.floor(Math.random()*FISH_PHOTOS.length);
 if(index===previousFishIndex)index=(index+1)%FISH_PHOTOS.length;
 previousFishIndex=index;
 const item=FISH_PHOTOS[index];
 return {name:item.name,url:'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(item.file),source:'NOAA / Smithsonian photography via Wikimedia Commons',credit:item.credit,page:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(item.file.replace(/ /g,'_'))};
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
http.createServer(async(req,res)=>{try{if(req.url==='/api/fish-photo'){try{const photo=await randomFish();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(photo));}catch{res.writeHead(503,{'Content-Type':'application/json'});res.end('{}');}return;}if(req.url==='/api/health'){const h=health(await data());res.writeHead(h.status==='ok'?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(h));return;}if(req.url==='/api/conditions'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(await data()));return;}if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});fs.createReadStream(path.join(__dirname,'index.html')).pipe(res);return;}res.writeHead(404);res.end('Not found');}catch(e){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Data service unavailable'}));}}).listen(PORT,()=>console.log('Listening on '+PORT));