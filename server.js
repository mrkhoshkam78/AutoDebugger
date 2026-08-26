import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app=express(), port=Number(process.env.PORT||3000);
const key=process.env.KENAR_API_KEY;
const dir=path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
app.use(express.static(path.join(dir,"public")));

app.post("/api/search",async(req,res)=>{
 try{
  if(!key)return res.status(500).json({error:"KENAR_API_KEY تنظیم نشده است."});
  const body={category:req.body.category||"cars",city:req.body.city||"tehran"};
  if(req.body.query?.trim())body.query=req.body.query.trim();
  const r=await fetch("https://open-api.divar.ir/v2/open-platform/finder/post",{
   method:"POST",
   headers:{"Content-Type":"application/json","Accept":"application/json","x-api-key":key},
   body:JSON.stringify(body)
  });
  const text=await r.text(); let data;
  try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!r.ok)return res.status(r.status).json({error:"Kenar API خطا برگرداند.",status:r.status,details:data});
  res.json(data);
 }catch(e){res.status(500).json({error:"خطا در درخواست.",details:e.message})}
});
app.listen(port,()=>console.log(`http://localhost:${port}`));
