import express from "express";
import { WebSocketServer } from "ws";
import { spawn } from "node:child_process";
import http from "node:http";

const app=express(), server=http.createServer(app);
const wss=new WebSocketServer({server,path:"/live"});
const PORT=Number(process.env.PORT||10000);
const {ICECAST_HOST,ICECAST_PORT,ICECAST_PASSWORD,ICECAST_MOUNT,STUDIO_PIN}=process.env;
const ICECAST_USER=process.env.ICECAST_USER||"source";
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||"https://radio-luce-soldati-di-cristo.netlify.app";
app.get("/",(_q,r)=>r.send("Radio Luce Live Bridge: OK"));
app.get("/health",(_q,r)=>r.json({ok:true}));
let active=false;

wss.on("connection",(ws,req)=>{
  const origin=req.headers.origin||"";
  const u=new URL(req.url,"http://localhost");
  if(!ICECAST_HOST||!ICECAST_PORT||!ICECAST_PASSWORD||!ICECAST_MOUNT||!STUDIO_PIN){ws.close(1011,"Server non configurato");return;}
  if(origin!==ALLOWED_ORIGIN){ws.close(1008,"Origine non autorizzata");return;}
  if(u.searchParams.get("pin")!==STUDIO_PIN){ws.close(1008,"PIN non corretto");return;}
  if(active){ws.close(1013,"Studio già in diretta");return;}
  active=true;
  const mount=ICECAST_MOUNT.startsWith("/")?ICECAST_MOUNT:"/"+ICECAST_MOUNT;
  const out=`icecast://${encodeURIComponent(ICECAST_USER)}:${encodeURIComponent(ICECAST_PASSWORD)}@${ICECAST_HOST}:${ICECAST_PORT}${mount}`;
  const ff=spawn("ffmpeg",["-hide_banner","-loglevel","warning","-i","pipe:0","-vn","-ac","1","-ar","44100","-codec:a","libmp3lame","-b:a","96k","-content_type","audio/mpeg","-f","mp3",out],{stdio:["pipe","ignore","pipe"]});
  let ended=false;
  const finish=()=>{if(ended)return;ended=true;active=false;try{ff.stdin.end()}catch{};setTimeout(()=>{try{ff.kill("SIGTERM")}catch{}},1200)};
  ff.stderr.on("data",d=>console.log("[ffmpeg]",d.toString().trim()));
  ff.on("error",()=>{try{ws.close(1011,"Errore encoder")}catch{};finish()});
  ff.on("close",()=>{active=false;if(ws.readyState===1)ws.close(1011,"Encoder terminato")});
  ws.on("message",data=>{if(!ff.stdin.destroyed)ff.stdin.write(data)});
  ws.on("close",finish); ws.on("error",finish);
  ws.send(JSON.stringify({type:"ready"}));
});
server.listen(PORT,"0.0.0.0",()=>console.log("Radio Luce bridge pronto"));
