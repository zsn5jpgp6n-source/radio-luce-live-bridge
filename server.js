import express from "express";
import {WebSocketServer} from "ws";
import {spawn} from "node:child_process";
import {promises as dns} from "node:dns";
import http from "node:http";

const app=express(), server=http.createServer(app);
const PORT=Number(process.env.PORT||10000);
const ORIGIN=process.env.ALLOWED_ORIGIN||"https://radio-luce-soldati-di-cristo.netlify.app";
app.get("/",(_,r)=>r.send("Radio Luce Bridge v3 IPv4: OK"));
app.get("/health",(_,r)=>r.json({ok:true,version:"3-ipv4"}));

let active=false;
const wss=new WebSocketServer({server,path:"/live"});
wss.on("connection",(ws,req)=>{
 const u=new URL(req.url,"http://x");
 console.log("[studio] connect",req.headers.origin);
 if(req.headers.origin!==ORIGIN) return ws.close(1008,"Origine non autorizzata");
 if(u.searchParams.get("pin")!==process.env.STUDIO_PIN) return ws.close(1008,"PIN non corretto");
 if(active) return ws.close(1013,"Diretta già attiva");
 active=true; let ff,started=false;
 ws.on("message",async(data,binary)=>{
   if(!binary&&!started){
     let m; try{m=JSON.parse(data)}catch{return}
     if(m.type!=="start")return;
     try{
       const host=process.env.ICECAST_HOST;
       const a=await dns.resolve4(host);
       if(!a.length) throw new Error("Nessun IPv4 trovato");
       const ip=a[0];
       const fmt=(m.mime||"").includes("mp4")?"mp4":"webm";
       let mount=process.env.ICECAST_MOUNT||"/fu8xv"; if(!mount.startsWith("/"))mount="/"+mount;
       const user=process.env.ICECAST_USER||"source", pass=process.env.ICECAST_PASSWORD||"";
       const out=`icecast://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${process.env.ICECAST_PORT}${mount}`;
       console.log("[studio] encoder IPv4",{host,ip,port:process.env.ICECAST_PORT,mount,fmt});
       ff=spawn("ffmpeg",["-hide_banner","-loglevel","warning","-f",fmt,"-i","pipe:0","-vn","-ac","1","-ar","48000","-c:a","libopus","-b:a","96k","-content_type","audio/ogg","-f","ogg",out],{stdio:["pipe","ignore","pipe"]});
       ff.stderr.on("data",d=>console.log("[ffmpeg]",d.toString().replace(/icecast:\/\/[^@]+@/g,"icecast://***@").trim()));
       ff.on("close",c=>{console.log("[ffmpeg closed]",c);active=false;if(ws.readyState===1)ws.close(1011,"Encoder terminato")});
       started=true; ws.send(JSON.stringify({type:"ready"}));
     }catch(e){console.log("[ipv4 error]",e.message);active=false;ws.close(1011,"IPv4 Caster non disponibile")}
     return;
   }
   if(binary&&ff&&!ff.stdin.destroyed)ff.stdin.write(data);
 });
 const end=()=>{active=false;try{ff?.stdin.end()}catch{}};
 ws.on("close",(c,r)=>{console.log("[studio] close",c,r.toString());end()});
 ws.on("error",end);
});
server.listen(PORT,"0.0.0.0",()=>console.log("Radio Luce Bridge v3 IPv4 pronto"));