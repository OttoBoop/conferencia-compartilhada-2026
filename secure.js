'use strict';
(()=>{
 const enc=new TextEncoder(),dec=new TextDecoder();let key=null,config=null;const urls=new Map();
 const asBytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function openCipher(buffer,aad){const raw=new Uint8Array(buffer);if(raw.length<33||dec.decode(raw.slice(0,4))!=='RVC1')throw new Error('Arquivo protegido inválido.');return crypto.subtle.decrypt({name:'AES-GCM',iv:raw.slice(4,16),additionalData:enc.encode(aad),tagLength:128},key,raw.slice(16));}
 async function readAsset(path){const response=await fetch(path);if(!response.ok)throw new Error('Arquivo não encontrado.');return openCipher(await response.arrayBuffer(),path);}
 async function sealJSON(value,aad){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(aad),tagLength:128},key,enc.encode(JSON.stringify(value))));const result=new Uint8Array(16+cipher.length);result.set(enc.encode('RVC1'));result.set(iv,4);result.set(cipher,16);return result;}
 function b64(bytes){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
 function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function script(path){return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=path;el.onload=resolve;el.onerror=()=>reject(new Error('Não foi possível carregar a interface.'));document.head.append(el);});}
 document.querySelector('#unlockForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=document.querySelector('#unlockButton'),error=document.querySelector('#gateError');button.disabled=true;button.textContent='Abrindo…';error.textContent='';
  try{
   config=await (await fetch('config.json',{cache:'no-store'})).json();if(config.format!==1||config.iterations<600000||config.iterations>2000000)throw new Error('Configuração inválida.');
   const input=document.querySelector('#password');const password=enc.encode(input.value);input.value='';const material=await crypto.subtle.importKey('raw',password,'PBKDF2',false,['deriveKey']);password.fill(0);
   key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:asBytes(config.salt),iterations:config.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
   const data=JSON.parse(dec.decode(await readAsset(config.data_asset)));const html=dec.decode(await readAsset(config.html_asset));const storageKey='conferencia-protegida:'+data.dataset_id;
   window.CONFERENCIA=data;
   window.SECURE_SESSION={
    hasAsset:path=>Object.hasOwn(data.protected_assets,path),
    assetURL:async path=>{if(urls.has(path))return urls.get(path);const asset=data.protected_assets[path];if(!asset)throw new Error('Fonte não cadastrada.');const plain=await readAsset(asset.cipher);const url=URL.createObjectURL(new Blob([plain],{type:asset.mime}));urls.set(path,url);return url;},
    saveLocal:async payload=>{const cipher=await sealJSON(payload,'revisoes:'+data.dataset_id);localStorage.setItem(storageKey,b64(cipher));},
    loadLocal:async()=>{const cipher=localStorage.getItem(storageKey);if(!cipher)return null;return JSON.parse(dec.decode(await openCipher(asBytes(cipher),'revisoes:'+data.dataset_id)));},
    exportReview:async payload=>{const cipher=await sealJSON(payload,'revisoes:'+data.dataset_id);download(new Blob([JSON.stringify({format:'revisoes-criptografadas-v1',payload:b64(cipher)})],{type:'application/json'}),'revisoes-protegidas-'+new Date().toISOString().slice(0,10)+'.enc.json');},
    importReview:async file=>{const wrapper=JSON.parse(await file.text());if(wrapper.format!=='revisoes-criptografadas-v1'||typeof wrapper.payload!=='string')throw new Error('Use um arquivo de revisões protegidas exportado por esta consulta.');try{return JSON.parse(dec.decode(await openCipher(asBytes(wrapper.payload),'revisoes:'+data.dataset_id)));}catch(e){throw new Error('Senha/base diferente ou arquivo alterado.');}},
    lock:()=>{for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();key=null;location.reload();}
   };
   const parsed=new DOMParser().parseFromString(html,'text/html');document.body.classList.remove('locked');document.body.replaceChildren(...parsed.body.childNodes);document.title=parsed.title;await script('revisao.js');await script('painel.js');
  }catch(e){key=null;if(error.isConnected){error.textContent='Não foi possível abrir. Confira a senha e tente novamente.';button.disabled=false;button.textContent='Abrir conferência';}else{document.body.textContent='Falha ao abrir a interface. Recarregue a página e tente novamente.';}}
 });
})();
