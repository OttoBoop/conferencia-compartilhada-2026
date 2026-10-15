/* Editor de minutas por SEI. A síntese e os DOCX são produzidos em Python no navegador. */
'use strict';
window.DESPACHO=(()=>{
 const data=window.CONFERENCIA,RV=window.REVISAO;
 const byCode=new Map(data.processos.map(p=>[p.code,p]));
 const byRow=new Map(data.processos.flatMap(p=>p.despesas.map(r=>[r.id,r])));
 const $=s=>document.querySelector(s);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>v===null||v===undefined?'Indeterminado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
 const sei=p=>{const m=p.arquivo.match(/SEI_(\d{6})\.(\d{6})_(\d{4})_(\d{2})/);return m?`${m[1]}.${m[2]}/${m[3]}-${m[4]}`:p.processo;};
 const nl=v=>esc(v).replaceAll('\n','<br>');
 const source=(code,list,label)=>list?.length?`<button class="source-button" data-source-code="${esc(code)}" data-source-pages="${list.join(',')}">${esc(label)} · p. ${list.join(', ')}</button>`:'';
 const historyHtml=id=>{const events=RV.history(id);return events.length?`<details class="draft-history"><summary>Histórico · ${events.length} alteração${events.length===1?'':'ões'}</summary>${events.map(e=>`<p><strong>${esc(e.author)}</strong> · ${new Date(e.at).toLocaleString('pt-BR')}<br>${nl(e.value.text??JSON.stringify(e.value))}</p>`).join('')}</details>`:'';};
 let worker=null,sequence=0,pending=new Map(),active=null,snapshot=null,buildTimer=null,editing=null,reviewFilter='all';
 const workerCall=(action,payload)=>{
  if(!worker){worker=new Worker('despacho_worker.mjs',{type:'module'});worker.onmessage=({data:response})=>{const task=pending.get(response.id);if(!task)return;pending.delete(response.id);response.error?task.reject(new Error(response.error)):task.resolve(response.result);};worker.onerror=e=>{for(const task of pending.values())task.reject(new Error(e.message||'Falha ao iniciar o Python.'));pending.clear();};}
  const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
 };
 function statesFor(p){
  const keys=['process:'+p.code,'conclusion:'+p.code];
  for(const m of p.meses)keys.push(`month:${p.code}:${m.mes}`,`block:${p.code}:month:${m.mes}`);
  for(const key of ['opening','findings','consolidation','conclusion'])keys.push(`block:${p.code}:${key}`);
  p.limites.forEach((_,i)=>keys.push(`general:${p.code}:${i}`));
  for(const r of p.despesas)keys.push(r.id,'finding:'+r.id,'admission:'+r.id);
  const result={};for(const key of keys){const s=RV.state(key);if(s.heads.length)result[key]={...s,_conflict:s.conflict};}
  return result;
 }
 function launchers(){
  $('#draftLauncher').innerHTML=data.processos.map(p=>`<article class="draft-launch-card"><div><strong>${esc(p.bar)}</strong><span>SEI ${esc(sei(p))} · ${esc(p.periodo)} · ${p.despesas.length} lançamentos</span></div><button class="button" data-open-draft="${esc(p.code)}">Montar despacho ↗</button></article>`).join('');
 }
 async function open(code){
  const p=byCode.get(code);if(!p)return;active=code;reviewFilter='all';$('#draftTitle').textContent=`${p.bar} · SEI ${sei(p)}`;$('#draftBody').innerHTML='<p class="draft-loading">Preparando a síntese em Python no navegador…</p>';$('#draftDialog').showModal();await rebuild();
 }
 async function rebuild(){
  if(!active)return;const code=active,p=byCode.get(code),request=++sequence;
  try{const result=await workerCall('build',{process:p,states:statesFor(p)});if(active!==code||request!==sequence-1)return;snapshot=result;render(result);}
  catch(e){if(active===code)$('#draftBody').innerHTML=`<p class="notice">Não foi possível montar a minuta: ${esc(e.message)}</p>`;}
 }
 function later(){if(!active)return;clearTimeout(buildTimer);buildTimer=setTimeout(rebuild,300);}
 function conflictButtons(p){
  const ids=['process:'+p.code,'conclusion:'+p.code,...p.meses.map(m=>`month:${p.code}:${m.mes}`),...p.despesas.flatMap(r=>[r.id,'finding:'+r.id,'admission:'+r.id]),...p.limites.map((_,i)=>`general:${p.code}:${i}`),...['opening',...p.meses.map(m=>'month:'+m.mes),'findings','consolidation','conclusion'].map(k=>`block:${p.code}:${k}`)];
  return ids.filter(id=>RV.state(id).conflict).map(id=>`<button class="button secondary" data-draft-conflict="${esc(id)}">Resolver versões de ${esc(id)}</button>`).join('');
 }
 function applyReviewFilter(){
  document.querySelectorAll('#draftReviewQueue [data-review-level]').forEach(row=>{
   row.hidden=reviewFilter==='remaining'?row.dataset.reviewed==='true':reviewFilter==='done'?row.dataset.reviewed!=='true':reviewFilter!=='all'&&row.dataset.reviewLevel!==reviewFilter;
  });
 }
 function render(s){
  const p=byCode.get(s.code),monthly=s.months.map(m=>`<article class="draft-month"><div><strong>${esc(m.label)}</strong><span>Impresso ${money(m.printed)} · soma linhas ${money(m.line_sum)} · trabalho ${money(m.working)}</span><span>Prévia documental ${money(m.preliminary_matched)} (${m.preliminary_count} lançamentos); sem dúvida específica ${money(m.preliminary_clear)} (${m.preliminary_clear_count})</span><span>Limite informado ${money(m.reported_limit)} · excesso indicativo ${money(m.reported_excess)}</span><span>Limite confirmado ${money(m.confirmed_limit)} · proposto ${money(m.proposed)}</span></div><button class="button secondary" data-draft-edit="month:${esc(p.code)}:${esc(m.month)}">Fundamentar limite</button>${source(p.code,m.report_pages,'Relatório')}</article>`).join('');
  const blocks=s.blocks.map(b=>`<article class="draft-block ${b.stale?'stale':''}"><div class="draft-block-head"><h3>${esc(b.title)}</h3><div>${b.edited?'<span class="badge match">Texto editado</span>':''}${b.stale?'<span class="badge diff">Base alterada: revisar texto</span>':''}<button class="button secondary" data-draft-edit="block:${esc(p.code)}:${esc(b.key)}">Editar parágrafo</button>${b.edited?`<button class="text-button" data-draft-reset="block:${esc(p.code)}:${esc(b.key)}">Usar proposta atual</button>`:''}</div></div><p>${nl(b.text)}</p>${b.stale?`<details><summary>Ver proposta atual</summary><p>${nl(b.suggested)}</p></details>`:''}${historyHtml(`block:${p.code}:${b.key}`)}</article>`).join('');
  const issues=s.issues.map(i=>`<tr><td><strong>${esc(i.id)}</strong><span class="row-id">${esc(i.month||'Processo inteiro')} · ${esc(i.description)}</span><span class="badge ${i.status==='pendente'?'unknown':'match'}">${esc(i.status)}</span></td><td>${esc(i.title)}<p>${nl(i.summary)}</p><span class="row-id">${esc(i.categories.join(', '))}</span></td><td>${i.amount_effect===null?'Indeterminado':money(i.amount_effect)}</td><td>${nl(i.next_step)}${i.resolution?`<p><strong>Tratamento:</strong> ${nl(i.resolution)}</p>`:''}</td><td>${esc(i.source)}<div class="source-buttons">${source(p.code,i.report_pages,'Relatório')}${source(p.code,i.document_pages,'Despesa')}${source(p.code,i.payment_pages,'Pagamento')}</div><button class="text-button" data-draft-edit="${i.kind==='general'?'':'finding:'}${esc(i.id)}">Revisar apontamento</button></td></tr>`).join('');
  const signalById=new Map(s.review_signals.map(x=>[x.id,x]));
  const reviewRanks={divergencia:0,inconclusiva:1,com_pendencias:2,checagem_direta:3};
  const admissionRows=[...p.despesas].sort((a,b)=>reviewRanks[signalById.get(a.id).level]-reviewRanks[signalById.get(b.id).level]||a.id.localeCompare(b.id)).map(r=>{const a=RV.state('admission:'+r.id),work=RV.effective(r),signal=signalById.get(r.id),suggested=signal.reference_amount!==null;return `<tr data-review-level="${esc(signal.level)}" data-reviewed="${signal.reviewed}"><td><strong>${esc(r.id)}</strong><span class="row-id">${esc(r.relatorio.mes)} · ${esc(r.relatorio.descricao)}</span></td><td><span class="review-signal ${esc(signal.level)}">${esc(signal.label)}</span><p>${nl(signal.reason)}</p><p><strong>Próximo passo:</strong> ${nl(signal.next_step)}</p></td><td>${money(work)}<details><summary>Comparar valores</summary><p>Relatório ${money(signal.declared_amount)}<br>Documento ${money(signal.document_amount)}<br>Pagamento alocado ${money(signal.payment_amount)}</p></details></td><td>${a.status?`${esc(a.status)} · ${money(a.valor_centavos)}`:suggested?'Pendente · valor de referência disponível':'Pendente · sem valor sugerido'}<span class="row-id">${signal.reviewed?'Revisão completa':`${signal.value_checked?'Valor marcado':'Valor não marcado'} · ${signal.admission_decided?'admissão decidida':'admissão pendente'}${signal.issue_resolved?'':' · achado pendente'}`}</span></td><td><button class="text-button" data-draft-edit="admission:${esc(r.id)}">Revisar decisão</button>${source(p.code,r.relatorio.paginas,'Relatório')}${source(p.code,r.documento.paginas,'Documento')}${source(p.code,r.pagamento.paginas,'Pagamento')}</td></tr>`;}).join('');
  const levels=[['divergencia','Divergência'],['inconclusiva','Inconclusiva'],['com_pendencias','Correspondência com dúvida'],['checagem_direta','Checagem direta']];
  const signalCards=levels.map(([level,title])=>{const subset=s.review_signals.filter(x=>x.level===level);return `<div class="draft-signal-card ${level}"><strong>${subset.length}</strong><span>${title}</span><small>${money(subset.reduce((sum,x)=>sum+x.declared_amount,0))} declarados</small></div>`;}).join('');
  const generalPending=s.issues.filter(i=>i.kind==='general'&&i.status==='pendente');
  const priorityHtml=generalPending.slice(0,4).map(i=>`<li><strong>${esc(i.title)}</strong><br>${nl(i.summary)}<br><button class="text-button" data-draft-edit="${esc(i.id)}">Revisar</button></li>`).join('');
  const warningHtml=s.warnings.length?`<details class="draft-warning-details"><summary>Ver todas as ${s.warnings.length} pendências e verificações</summary><ul class="draft-warnings">${s.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`:'<p>Sem pendências registradas neste estado.</p>';
  const conflict=conflictButtons(p);
  $('#draftBody').innerHTML=`<div class="draft-actions"><span class="badge ${s.warnings.length?'unknown':'match'}">${s.warnings.length?'Minuta com pendências':'Minuta pronta para revisão final'}</span><button class="button" id="draftDocx">Baixar DOCX</button><button class="button secondary" id="draftPdf">Imprimir / salvar PDF</button><button class="button secondary" data-draft-edit="process:${esc(p.code)}">Identidade e ato</button></div><div class="draft-review-overview"><div><strong>Revisão dirigida: ${s.review_summary.reviewed}/${p.despesas.length} lançamentos concluídos</strong><p>A cor indica o trabalho documental restante, nunca aprovação do benefício. Abaixo estão os valores declarados em cada grupo.</p></div><div class="draft-signal-grid">${signalCards}</div><button class="button secondary" data-scroll-review>Ir à fila de revisão ↓</button></div><p class="muted">A estrutura segue o modelo da Luiza: beneficiária, análise mensal, apontamentos, consolidação e uma conclusão. A prévia documental já traz valores com correspondência visual, separados das decisões de admissão e do valor proposto. Os valores vêm dos ${p.despesas.length} lançamentos deste processo e das revisões registradas; o quadro identifica cada fonte. A decisão administrativa permanece humana.</p><div class="draft-layout"><aside class="draft-evidence"><h3>Conferência que sustenta o texto</h3><p><strong>Beneficiária:</strong> ${esc(s.beneficiaria)}<br><strong>CNPJ:</strong> ${esc(s.cnpj)}<br><strong>Período:</strong> ${esc(s.periodo)}</p><h4>Valores mensais</h4>${monthly}${priorityHtml?`<h4>Questões gerais a resolver</h4><ul class="draft-priorities">${priorityHtml}</ul>`:''}<h4>Conclusão a revisar</h4><label>Formulação<select id="draftConclusion"><option value="diligencia" ${s.conclusion==='diligencia'?'selected':''}>Diligência</option><option value="com_ressalvas" ${s.conclusion==='com_ressalvas'?'selected':''}>Com ressalvas</option><option value="sem_ressalvas" ${s.conclusion==='sem_ressalvas'?'selected':''}>Sem ressalvas</option></select></label><p class="muted">Uma conclusão de pagamento exige limites, admissões e tratamento de todos os apontamentos fundamentados.</p><h4>Pendências que impedem fechar o valor</h4>${warningHtml}${conflict?`<h4>Versões em conflito</h4>${conflict}`:''}</aside><div class="draft-document"><h2>Minuta · SEI ${esc(s.processo)}</h2>${blocks}</div></div><section class="draft-ledger"><h3>Quadro completo de apontamentos · ${s.issues.length}</h3><p class="muted">Efeito é a diferença entre o valor de trabalho e o valor admitido. Não há desconto adicional por aparecer neste quadro.</p><div class="table-wrap"><table><thead><tr><th>Lançamento</th><th>Divergência ou dúvida</th><th>Efeito</th><th>Providência</th><th>Fontes e revisão</th></tr></thead><tbody>${issues}</tbody></table></div><div id="draftReviewQueue"><h3>Fila de revisão · ${p.despesas.length} despesas</h3><p class="muted">Comece pelas divergências e conferências inconclusivas. A prévia visual preenche o valor inicial apenas nas correspondências demonstradas; cada decisão exige conferência e fundamento.</p><label class="draft-filter">Mostrar<select id="draftReviewFilter"><option value="all">Todos os lançamentos</option><option value="remaining">Somente revisão pendente</option><option value="divergencia">Divergência</option><option value="inconclusiva">Inconclusiva</option><option value="com_pendencias">Correspondência com dúvida</option><option value="checagem_direta">Checagem direta</option><option value="done">Revisão completa</option></select></label><div class="table-wrap"><table><thead><tr><th>Despesa</th><th>Sinal e ação necessária</th><th>Valores</th><th>Decisão e andamento</th><th>Fontes</th></tr></thead><tbody>${admissionRows}</tbody></table></div></div></section>`;
  const filter=$('#draftReviewFilter');if(filter)filter.value=reviewFilter;applyReviewFilter();
 }
 function field(label,name,value='',type='text',extra=''){
  const content=type==='textarea'?`<textarea name="${name}" rows="5" ${extra}>${esc(value)}</textarea>`:type==='select'?`<select name="${name}" ${extra}>${value}</select>`:`<input name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
  return `<label>${label}${content}</label>`;
 }
 function edit(id){
  if(!active||!snapshot)return;const s=RV.state(id);if(s.conflict){resolve(id);return;}
  editing=id;let title='',html='',row;
  if(id.startsWith('process:')){
   const p=byCode.get(active);title='Beneficiária, período e ato';
   html=field('Beneficiária','beneficiaria',s.beneficiaria||p.beneficiaria_despacho||p.beneficiaria)+field('CNPJ','cnpj',s.cnpj||p.cnpj)+field('Período','periodo',s.periodo||p.periodo)+field('Ato da Comissão','ato',s.ato||'Portaria SMDE/CCPAR “P” nº 002, de 11 de abril de 2025')+field('Fonte da alteração','fonte',s.fonte||'','textarea');
  }else if(id.startsWith('month:')){
   const iso=id.split(':')[2],m=snapshot.months.find(x=>x.month===iso);title='Limite individual · '+m.label;
   html=`<p>O relatório informa ${money(m.reported_limit)}. Esse valor foi colocado no campo como prévia, mas só será confirmado quando você informar a fonte documental e salvar.</p>`+field('Limite confirmado (R$)','limite',s.limite_centavos===undefined?formatInput(m.reported_limit):formatInput(s.limite_centavos))+field('Fonte precisa: instrumento, página ou decisão','fonte',s.fonte||'','textarea');
  }else if(id.startsWith('admission:')){
   row=byRow.get(id.slice(10));title='Admissão · '+row.id;const work=RV.effective(row),review=RV.state(row.id),suggested=row.resultado==='Correspondência demonstrada'&&!review.erro&&!review.conflict&&(review.valor_centavos==null||review.valor_centavos===row.relatorio.valor_centavos);
   html=`<p>Declarado ${money(row.relatorio.valor_centavos)} · valor de trabalho ${money(work)}. ${suggested?`A leitura visual permite usar ${money(work)} como ponto de partida; ${row.achado?.campos_duvida?.length?'há dúvida específica a resolver.':'a admissão e a regra aplicável ainda precisam de fundamento.'}`:'A conferência visual não sustenta pré-seleção de valor para este lançamento.'} Nenhum campo pré-preenchido equivale a aprovação.</p>`+field('Decisão','status',`<option value="" ${!s.status?'selected':''}>Pendente</option><option value="admitida" ${s.status==='admitida'?'selected':''}>Admitir integral ou parcialmente</option><option value="excluida" ${s.status==='excluida'?'selected':''}>Excluir</option>`,'select')+field('Valor admitido (R$)','amount',s.valor_centavos===undefined?(suggested?formatInput(work):''):formatInput(s.valor_centavos))+field('Fundamento e fonte','fundamento',s.fundamento||'','textarea')+`<label class="check-label"><input type="checkbox" name="confirm_checked" ${review.conferido?'checked':''}> Conferi o valor no relatório, documento e pagamento citados</label><p class="muted">Ao salvar com esta marcação, o check do valor também entra no histórico criptografado.</p>`;
  }else if(id.startsWith('finding:')||id.startsWith('general:')){
   const issue=snapshot.issues.find(x=>x.id===id.replace(/^finding:/,''));if(!issue)return;title='Apontamento · '+issue.id;
   html=`<p><strong>Leitura original:</strong> ${esc(issue.kind==='expense'?(byRow.get(issue.id)?.achado?.resumo||''):(byCode.get(active).limites[Number(issue.id.split(':')[2])]||''))}</p>`+field('Título','titulo',s.titulo||issue.title)+field('Divergência ou dúvida concreta','resumo',s.resumo||issue.summary,'textarea')+field('Providência','providencia',s.providencia||issue.next_step,'textarea')+field('Categorias, separadas por vírgula','categorias',(s.categorias||issue.categories).join(', '))+field('Situação','situacao',`<option value="pendente" ${issue.status==='pendente'?'selected':''}>Pendente</option><option value="ressalva" ${issue.status==='ressalva'?'selected':''}>Ressalva com efeito definido</option><option value="resolvida" ${issue.status==='resolvida'?'selected':''}>Resolvida</option>`,'select')+field('Fundamento do tratamento e fonte','fundamento',s.fundamento||issue.resolution||'','textarea');
  }else if(id.startsWith('block:')){
   const key=id.slice(('block:'+active+':').length),block=snapshot.blocks.find(x=>x.key===key);if(!block)return;title='Parágrafo · '+block.title;
   html=`<p><strong>Proposta atual:</strong> ${esc(block.suggested)}</p>`+field('Texto da minuta','text',block.text,'textarea','maxlength="20000"');
  }else return;
  $('#draftEditTitle').textContent=title;$('#draftEditFields').innerHTML=html+historyHtml(id);$('#draftEditError').textContent='';$('#draftEditDialog').showModal();
 }
 function formatInput(cents){return cents===null||cents===undefined?'':(cents/100).toFixed(2).replace('.',',');}
 function parseMoney(value){const s=value.trim().replace(/^R\$\s*/,'');if(!s)return null;if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))throw new Error('Use reais com até duas casas, por exemplo 1.500,00.');const [whole,decimal='']=s.replaceAll('.','').split(',');const amount=Number(whole)*100+Number(decimal.padEnd(2,'0'));if(!Number.isSafeInteger(amount)||amount>1e12)throw new Error('Valor fora do intervalo permitido.');return amount;}
 function saveEdit(form){
  if(!editing)return;const values=Object.fromEntries(new FormData(form)),id=editing;let value;
  if(id.startsWith('process:')){
   if(!values.beneficiaria.trim()||!values.cnpj.trim()||!values.periodo.trim()||!values.ato.trim()||values.fonte.trim().length<5)throw new Error('Identifique os dados e a fonte da alteração.');
   value={beneficiaria:values.beneficiaria.trim(),cnpj:values.cnpj.trim(),periodo:values.periodo.trim(),ato:values.ato.trim(),fonte:values.fonte.trim()};
  }else if(id.startsWith('month:')){
   const limit=parseMoney(values.limite);if(limit===null||limit<=0||values.fonte.trim().length<5)throw new Error('Informe um limite positivo e a fonte documental precisa.');value={limite_centavos:limit,fonte:values.fonte.trim()};
  }else if(id.startsWith('admission:')){
   const row=byRow.get(id.slice(10)),amount=parseMoney(values.amount),work=RV.effective(row);
   if(!['admitida','excluida'].includes(values.status)||amount===null||amount>work||values.fundamento.trim().length<8)throw new Error('Decida a admissão com valor até o valor de trabalho e fundamento preciso.');
   if(values.status==='excluida'&&amount!==0)throw new Error('Uma despesa excluída deve ter valor admitido de R$ 0,00.');
   value={status:values.status,valor_centavos:amount,valor_base_centavos:work,fundamento:values.fundamento.trim()};
  }else if(id.startsWith('finding:')||id.startsWith('general:')){
   const cats=values.categorias.split(',').map(s=>s.trim()).filter(Boolean);
   if(!values.titulo.trim()||!values.resumo.trim()||!values.providencia.trim()||!cats.length)throw new Error('Descreva o problema, a providência e sua categoria.');
   if(values.situacao!=='pendente'&&values.fundamento.trim().length<8)throw new Error('Explique com fonte por que o apontamento foi resolvido ou virou ressalva.');
   value={titulo:values.titulo.trim(),resumo:values.resumo.trim(),providencia:values.providencia.trim(),categorias:cats,situacao:values.situacao,fundamento:values.fundamento.trim()};
  }else if(id.startsWith('block:')){
   const key=id.slice(('block:'+active+':').length),block=snapshot.blocks.find(x=>x.key===key);
   if(!values.text.trim())throw new Error('O parágrafo não pode ficar vazio.');value={text:values.text.trim(),base_hash:block.generated_hash};
  }
  if(id.startsWith('admission:')&&values.confirm_checked==='on'&&RV.state(id.slice(10)).conflict)throw new Error('Resolva o conflito do valor antes de marcá-lo como conferido.');
  if(id.startsWith('admission:')&&values.confirm_checked==='on'){
   const row=byRow.get(id.slice(10)),current=RV.state(row.id);
   if(!current.conferido)RV.commit(row.id,{conferido:true,valor_centavos:current.valor_centavos,erro:current.erro,tipo_erro:current.tipo_erro,nota:current.nota});
  }
  RV.commit(id,value);
  $('#draftEditDialog').close();editing=null;
 }
 function resolve(id){
  const s=RV.state(id);if(!s.conflict)return;
  $('#draftEditTitle').textContent='Versões em conflito · '+id;$('#draftEditFields').innerHTML=`<p>As versões ficam no histórico. Escolha qual deve valer.</p>${s.heads.map(e=>`<article class="conflict-version"><h3>${esc(e.author)}</h3><pre>${esc(JSON.stringify(e.value,null,2))}</pre><button class="button secondary" type="button" data-draft-resolve="${esc(id)}" data-version="${esc(e.id)}">Usar esta versão</button></article>`).join('')}`;$('#draftEditError').textContent='';editing=null;$('#draftEditDialog').showModal();
 }
 function printHtml(s){
  const table=`<h2>Anexo — quadro de apontamentos</h2><table><thead><tr><th>Item</th><th>Divergência ou dúvida</th><th>Efeito</th><th>Providência e tratamento</th><th>Fonte</th></tr></thead><tbody>${s.issues.map(i=>`<tr><td>${esc(i.id)} · ${esc(i.status)}</td><td>${nl(i.summary)}</td><td>${i.amount_effect===null?'A determinar':money(i.amount_effect)}</td><td>${nl(i.next_step)}${i.resolution?`<br>Tratamento registrado: ${nl(i.resolution)}`:''}</td><td>${esc(i.source)}</td></tr>`).join('')}</tbody></table>`;
  return `<h1>MINUTA PARA REVISÃO</h1><p>Processo SEI nº ${esc(s.processo)}</p>${s.warnings.length?'<p>Valor proposto ainda sujeito às pendências e aos fundamentos indicados no quadro de apontamentos.</p>':''}${s.blocks.map(b=>`<h2>${esc(b.title)}</h2><p>${nl(b.text)}</p>`).join('')}${table}`;
 }
 async function exportDocx(){
  if(!snapshot)return;const button=$('#draftDocx');button.disabled=true;button.textContent='Gerando DOCX…';
  try{const encoded=await workerCall('docx',snapshot),bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})),a=document.createElement('a');a.href=url;a.download=`minuta_SEI_${snapshot.processo.replaceAll(/[^0-9A-Za-z]/g,'_')}.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}catch(e){alert('Falha ao gerar DOCX: '+e.message);}finally{button.disabled=false;button.textContent='Baixar DOCX';}
 }
 launchers();
 document.addEventListener('click',e=>{
  const start=e.target.closest('[data-open-draft]');if(start){open(start.dataset.openDraft);return;}
  if(e.target.closest('[data-scroll-review]')){$('#draftReviewQueue')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  const editButton=e.target.closest('[data-draft-edit]');if(editButton){edit(editButton.dataset.draftEdit);return;}
  const reset=e.target.closest('[data-draft-reset]');if(reset){try{RV.commit(reset.dataset.draftReset,{text:'',base_hash:''});}catch(err){alert(err.message);}return;}
  const conflict=e.target.closest('[data-draft-conflict]');if(conflict){resolve(conflict.dataset.draftConflict);return;}
  const chosen=e.target.closest('[data-draft-resolve]');if(chosen){try{const id=chosen.dataset.draftResolve,heads=RV.state(id).heads,selected=heads.find(x=>x.id===chosen.dataset.version);RV.commit(id,selected.value,heads.map(x=>x.id));$('#draftEditDialog').close();}catch(err){$('#draftEditError').textContent=err.message;}return;}
  if(e.target.id==='draftDocx'){exportDocx();return;}
  if(e.target.id==='draftPdf'&&snapshot){$('#printDraft').innerHTML=printHtml(snapshot);$('#printDraft').hidden=false;window.print();$('#printDraft').hidden=true;return;}
 });
 $('#draftEditForm').addEventListener('submit',e=>{e.preventDefault();try{saveEdit(e.target);}catch(err){$('#draftEditError').textContent=err.message;}});
 document.addEventListener('change',e=>{if(e.target.id==='draftReviewFilter'){reviewFilter=e.target.value;applyReviewFilter();return;}if(e.target.id==='draftConclusion')try{RV.commit('conclusion:'+active,{tipo:e.target.value});}catch(err){alert(err.message);later();}});
 window.addEventListener('revisao-alterada',later);
 return {open,rebuild,statesFor,snapshot:()=>snapshot,workerCall};
})();
