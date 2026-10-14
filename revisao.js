/* Revisões humanas: fonte inicial preservada, histórico e importação com conflitos. */
'use strict';
window.REVISAO=(()=>{
 const dataset=window.CONFERENCIA;const rows=dataset.processos.flatMap(p=>p.despesas);const ids=new Set(rows.map(r=>r.id));
 let events=[];let author='';let fallback={};let saveQueue=Promise.resolve();let error=null;
 const empty=()=>({conferido:false,valor_centavos:null,erro:false,tipo_erro:'',nota:''});
 const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw new Error('Texto de revisão inválido.');return v;};
 function validateValue(v){
  if(!v||typeof v!=='object'||typeof v.conferido!=='boolean'||typeof v.erro!=='boolean')throw new Error('Formato de revisão inválido.');
  if(v.valor_centavos!==null&&(!Number.isSafeInteger(v.valor_centavos)||v.valor_centavos<0||v.valor_centavos>1e12))throw new Error('Valor de revisão inválido.');
  return {conferido:v.conferido,valor_centavos:v.valor_centavos,erro:v.erro,tipo_erro:text(v.tipo_erro,60),nota:text(v.nota,5000)};
 }
 function validateEvent(e){
  if(!e||typeof e!=='object'||!ids.has(e.row_id)||typeof e.id!=='string'||!/^[a-f0-9-]{36}$/.test(e.id)||!Array.isArray(e.parents)||e.parents.length>30||e.parents.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x)))throw new Error('Evento de revisão inválido.');
  if(!Number.isFinite(Date.parse(e.at)))throw new Error('Data de revisão inválida.');
  return {id:e.id,row_id:e.row_id,parents:[...e.parents],author:text(e.author,120),at:e.at,value:validateValue(e.value)};
 }
 function validateLedger(incoming){
  if(!Array.isArray(incoming)||incoming.length>15000)throw new Error('Histórico de revisão inválido ou muito grande.');
  const values=incoming.map(validateEvent),map=new Map(values.map(e=>[e.id,e]));
  if(map.size!==values.length)throw new Error('IDs de revisão duplicados.');
  const visited=new Set(),active=new Set();
  const visit=e=>{if(active.has(e.id))throw new Error('Histórico cíclico inválido.');if(visited.has(e.id))return;active.add(e.id);for(const p of e.parents){const parent=map.get(p);if(!parent||parent.row_id!==e.row_id)throw new Error('Histórico incompleto ou referência incorreta.');visit(parent);}active.delete(e.id);visited.add(e.id);};
  values.forEach(visit);return values;
 }
 function heads(id,ledger=events){const items=ledger.filter(e=>e.row_id===id),parents=new Set(items.flatMap(e=>e.parents));return items.filter(e=>!parents.has(e.id));}
 function state(id){
  const hs=heads(id);const event=hs.length===1?hs[0]:hs.find(e=>e.id===fallback[id]);
  return {...(event?.value||empty()),author:event?.author||'',at:event?.at||'',conflict:hs.length>1,heads:hs};
 }
 function effective(r){const s=state(r.id);return s.valor_centavos===null?r.relatorio.valor_centavos:s.valor_centavos;}
 function confirmed(r){const s=state(r.id);return s.conferido&&!s.erro&&!s.conflict;}
 function changed(){window.dispatchEvent(new Event('revisao-alterada'));}
 async function persist(){
  const payload={schema:1,dataset_id:dataset.dataset_id,events};
  if(window.SECURE_SESSION){
   try {await window.SECURE_SESSION.saveLocal(payload);error=null;}catch(e){error='Não foi possível salvar neste navegador. Exporte as revisões antes de fechar.';}
  }
  changed();
 }
 function commit(id,value,parents=null){
  if(!author.trim())throw new Error('Preencha seu nome antes de registrar uma revisão.');
  if(!ids.has(id))throw new Error('Despesa desconhecida.');
  const current=state(id);if(current.conflict&&parents===null)throw new Error('Resolva as versões em conflito antes de editar esta despesa.');
  const event=validateEvent({id:crypto.randomUUID(),row_id:id,parents:parents??current.heads.map(e=>e.id),author,at:new Date().toISOString(),value:validateValue(value)});
  events.push(event);fallback[id]=event.id;saveQueue=saveQueue.then(persist);changed();return event;
 }
 async function importPayload(payload){
  if(payload?.schema!==1||payload.dataset_id!==dataset.dataset_id)throw new Error('Este arquivo pertence a outra base de documentos.');
  const imported=validateLedger(payload.events);const map=new Map(events.map(e=>[e.id,e]));
  for(const e of imported){const known=map.get(e.id);if(known&&JSON.stringify(known)!==JSON.stringify(e))throw new Error('Mesmo identificador com conteúdo diferente. Importação interrompida.');}
  for(const id of ids){const h=heads(id);if(h.length===1)fallback[id]=h[0].id;}
  const added=imported.filter(e=>!map.has(e.id));const next=validateLedger([...events,...added]);events=next;await persist();return {added:added.length,conflicts:[...ids].filter(id=>state(id).conflict).length};
 }
 async function init(){
  if(window.SECURE_SESSION){const saved=await window.SECURE_SESSION.loadLocal();if(saved)await importPayload(saved);}
 }
 async function exportFile(){
  await saveQueue;if(!window.SECURE_SESSION)throw new Error('Para exportar revisões criptografadas, abra a versão protegida com senha.');
  return window.SECURE_SESSION.exportReview({schema:1,dataset_id:dataset.dataset_id,events});
 }
 async function importFile(file){
  if(!window.SECURE_SESSION)throw new Error('Abra a versão protegida para importar revisões criptografadas.');
  if(file.size>20*1024*1024)throw new Error('Arquivo de revisão muito grande.');
  const payload=await window.SECURE_SESSION.importReview(file);return importPayload(payload);
 }
 return {empty,state,effective,confirmed,commit,init,exportFile,importFile,importPayload,history:id=>events.filter(e=>e.row_id===id),setAuthor:v=>{author=text(v.trim(),120);},author:()=>author,conflicts:()=>[...ids].filter(id=>state(id).conflict),saveError:()=>error,flush:()=>saveQueue};
})();
