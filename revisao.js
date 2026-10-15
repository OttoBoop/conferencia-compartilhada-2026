/* Revisões imutáveis de despesas, fundamentos, achados e parágrafos. */
'use strict';
window.REVISAO=(()=>{
 const dataset=window.CONFERENCIA,rows=dataset.processos.flatMap(p=>p.despesas);
 const expenseIDs=new Set(rows.map(r=>r.id)),ids=new Set(expenseIDs);
 for(const p of dataset.processos){
  ids.add('process:'+p.code);ids.add('conclusion:'+p.code);
  for(const m of p.meses){ids.add(`month:${p.code}:${m.mes}`);ids.add(`block:${p.code}:month:${m.mes}`);}
  for(const key of ['opening','findings','consolidation','conclusion'])ids.add(`block:${p.code}:${key}`);
  p.limites.forEach((_,i)=>ids.add(`general:${p.code}:${i}`));
  for(const r of p.despesas){ids.add('finding:'+r.id);ids.add('admission:'+r.id);}
 }
 let events=[],author='',fallback={},saveQueue=Promise.resolve(),error=null;
 const empty=()=>({conferido:false,valor_centavos:null,erro:false,tipo_erro:'',nota:''});
 const text=(v,max)=>{if(typeof v!=='string'||v.length>max)throw new Error('Texto de revisão inválido.');return v;};
 const cents=(v,nullable=true)=>{if(v===null&&nullable)return v;if(!Number.isSafeInteger(v)||v<0||v>1e12)throw new Error('Valor de revisão inválido.');return v;};
 function validateValue(id,v){
  if(!v||typeof v!=='object')throw new Error('Formato de revisão inválido.');
  if(expenseIDs.has(id)){
   if(typeof v.conferido!=='boolean'||typeof v.erro!=='boolean')throw new Error('Formato de revisão inválido.');
   return {conferido:v.conferido,valor_centavos:cents(v.valor_centavos),erro:v.erro,tipo_erro:text(v.tipo_erro,60),nota:text(v.nota,5000)};
  }
  if(id.startsWith('process:'))return {beneficiaria:text(v.beneficiaria,240),cnpj:text(v.cnpj,30),periodo:text(v.periodo,120),ato:text(v.ato,240),fonte:text(v.fonte,1000)};
  if(id.startsWith('month:'))return {limite_centavos:cents(v.limite_centavos),fonte:text(v.fonte,1000)};
  if(id.startsWith('admission:')){
   if(!['','admitida','excluida'].includes(v.status))throw new Error('Situação de admissão inválida.');
   return {status:v.status,valor_centavos:cents(v.valor_centavos),valor_base_centavos:v.valor_base_centavos===undefined?null:cents(v.valor_base_centavos),fundamento:text(v.fundamento,3000)};
  }
  if(id.startsWith('finding:')||id.startsWith('general:')){
   if(!['pendente','resolvida','ressalva'].includes(v.situacao)||!Array.isArray(v.categorias)||v.categorias.length>8||v.categorias.some(x=>typeof x!=='string'||x.length>60))throw new Error('Tratamento do apontamento inválido.');
   return {titulo:text(v.titulo,180),resumo:text(v.resumo,5000),providencia:text(v.providencia,3000),categorias:v.categorias,situacao:v.situacao,fundamento:text(v.fundamento,3000)};
  }
  if(id.startsWith('block:')){
   if(v.base_hash&&!/^[a-f0-9]{64}$/.test(v.base_hash))throw new Error('Referência do parágrafo inválida.');
   return {text:text(v.text,20000),base_hash:text(v.base_hash,64)};
  }
  if(id.startsWith('conclusion:')){
   if(!['diligencia','com_ressalvas','sem_ressalvas'].includes(v.tipo))throw new Error('Conclusão inválida.');
   return {tipo:v.tipo};
  }
  throw new Error('Tipo de revisão desconhecido.');
 }
 function validateEvent(e){
  if(!e||typeof e!=='object'||!ids.has(e.row_id)||typeof e.id!=='string'||!/^[a-f0-9-]{36}$/.test(e.id)||!Array.isArray(e.parents)||e.parents.length>30||e.parents.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x)))throw new Error('Evento de revisão inválido.');
  if(!Number.isFinite(Date.parse(e.at)))throw new Error('Data de revisão inválida.');
  return {id:e.id,row_id:e.row_id,parents:[...e.parents],author:text(e.author,120),at:e.at,value:validateValue(e.row_id,e.value)};
 }
 function validateLedger(incoming){
  if(!Array.isArray(incoming)||incoming.length>30000)throw new Error('Histórico de revisão inválido ou muito grande.');
  const values=incoming.map(validateEvent),map=new Map(values.map(e=>[e.id,e]));
  if(map.size!==values.length)throw new Error('IDs de revisão duplicados.');
  const visited=new Set(),active=new Set();
  const visit=e=>{if(active.has(e.id))throw new Error('Histórico cíclico inválido.');if(visited.has(e.id))return;active.add(e.id);for(const p of e.parents){const parent=map.get(p);if(!parent||parent.row_id!==e.row_id)throw new Error('Histórico incompleto ou referência incorreta.');visit(parent);}active.delete(e.id);visited.add(e.id);};
  values.forEach(visit);return values;
 }
 function heads(id,ledger=events){const items=ledger.filter(e=>e.row_id===id),parents=new Set(items.flatMap(e=>e.parents));return items.filter(e=>!parents.has(e.id));}
 function state(id){const hs=heads(id),event=hs.length===1?hs[0]:hs.find(e=>e.id===fallback[id]);return {...(event?.value||(expenseIDs.has(id)?empty():{})),author:event?.author||'',at:event?.at||'',conflict:hs.length>1,heads:hs};}
 function effective(row){const s=state(row.id);return s.valor_centavos===null?row.relatorio.valor_centavos:s.valor_centavos;}
 function confirmed(row){const s=state(row.id);return s.conferido&&!s.erro&&!s.conflict;}
 function changed(){window.dispatchEvent(new Event('revisao-alterada'));}
 async function persist(){
  const payload={schema:2,dataset_id:dataset.dataset_id,events};
  if(window.SECURE_SESSION){try{await window.SECURE_SESSION.saveLocal(payload);error=null;}catch(e){error='Não foi possível salvar neste navegador. Exporte as revisões antes de fechar.';}}
  changed();
 }
 function commit(id,value,parents=null){
  if(!author.trim())throw new Error('Preencha seu nome antes de registrar uma revisão.');
  if(!ids.has(id))throw new Error('Campo de revisão desconhecido.');
  const current=state(id);if(current.conflict&&parents===null)throw new Error('Resolva as versões em conflito antes de editar este campo.');
  const event=validateEvent({id:crypto.randomUUID(),row_id:id,parents:parents??current.heads.map(e=>e.id),author,at:new Date().toISOString(),value});
  events.push(event);fallback[id]=event.id;saveQueue=saveQueue.then(persist);changed();return event;
 }
 async function importPayload(payload){
  if(![1,2].includes(payload?.schema)||payload.dataset_id!==dataset.dataset_id)throw new Error('Este arquivo pertence a outra base de documentos.');
  const imported=validateLedger(payload.events),map=new Map(events.map(e=>[e.id,e]));
  for(const e of imported){const known=map.get(e.id);if(known&&JSON.stringify(known)!==JSON.stringify(e))throw new Error('Mesmo identificador com conteúdo diferente. Importação interrompida.');}
  for(const id of ids){const h=heads(id);if(h.length===1)fallback[id]=h[0].id;}
  const added=imported.filter(e=>!map.has(e.id));events=validateLedger([...events,...added]);await persist();return {added:added.length,conflicts:[...ids].filter(id=>state(id).conflict).length};
 }
 async function init(){if(window.SECURE_SESSION){const saved=await window.SECURE_SESSION.loadLocal();if(saved)await importPayload(saved);}}
 async function exportFile(){await saveQueue;if(!window.SECURE_SESSION)throw new Error('Abra a versão protegida para exportar revisões.');return window.SECURE_SESSION.exportReview({schema:2,dataset_id:dataset.dataset_id,events});}
 async function importFile(file){if(!window.SECURE_SESSION)throw new Error('Abra a versão protegida para importar revisões.');if(file.size>20*1024*1024)throw new Error('Arquivo de revisão muito grande.');return importPayload(await window.SECURE_SESSION.importReview(file));}
 return {empty,state,effective,confirmed,commit,init,exportFile,importFile,importPayload,history:id=>events.filter(e=>e.row_id===id),setAuthor:v=>{author=text(v.trim(),120);},author:()=>author,conflicts:()=>[...ids].filter(id=>state(id).conflict),saveError:()=>error,flush:()=>saveQueue};
})();
