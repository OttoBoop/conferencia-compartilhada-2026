'use strict';
const DATA=window.CONFERENCIA;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v===null||v===undefined?'Não demonstrado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const month=m=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${m}-01T12:00:00Z`));
const num=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const sum=(rs,path)=>rs.reduce((s,r)=>s+(num(r,path)??0),0);
const coverage=(rs,path)=>rs.filter(r=>Number.isSafeInteger(num(r,path))).length;
const all=DATA.processos.flatMap(p=>p.despesas);
const RV=window.REVISAO;
const workingSum=rs=>rs.reduce((n,r)=>n+RV.effective(r),0);
const checkedSum=rs=>workingSum(rs.filter(r=>RV.confirmed(r)));
const byID=new Map(all.map(r=>[r.id,r]));
const pages=new Map(DATA.paginas.map(p=>[p.id,p]));
const proc=new Map(DATA.processos.map(p=>[p.code,p]));
const opened=new Set();const activeTabs=new Map();
let source={code:null,list:[],index:0};let selection=[];let sourceSequence=0;
const statusClass=s=>s==='Correspondência demonstrada'?'match':s==='Divergência demonstrada'?'diff':'unknown';
const badge=s=>`<span class="badge ${statusClass(s)}">${esc(s)}</span>`;
const countStatuses=rs=>['Correspondência demonstrada','Divergência demonstrada','Conferência inconclusiva'].map(s=>({s,n:rs.filter(r=>r.resultado===s).length}));
const sourceButtons=(code,list,label)=>list?.length?`<button class="source-button" data-source-code="${esc(code)}" data-source-pages="${list.join(',')}">${esc(label)} · p. ${list.join(', ')}</button>`:'';
function selectRows(){
 const bar=$('#barFilter').value,m=$('#monthFilter').value,status=$('#statusFilter').value,human=$('#humanFilter').value,q=$('#search').value.trim().toLocaleLowerCase('pt-BR');
 return all.filter(r=>{const s=RV.state(r.id);return (!bar||r.bar===bar)&&(!m||r.relatorio.mes===m)&&(!status||r.resultado===status)&&(!human||(human==='checked'&&RV.confirmed(r))||(human==='pending'&&!RV.confirmed(r))||(human==='error'&&s.erro)||(human==='conflict'&&s.conflict)||(human==='adjusted'&&s.valor_centavos!==null))&&(!q||[r.id,r.relatorio.descricao,r.relatorio.numero,r.documento.emitente,r.documento.numero,r.pagamento.recebedor,r.comparacao,r.achado?.resumo,s.nota].join(' ').toLocaleLowerCase('pt-BR').includes(q));});
}
function partialTotal(rs,path){const n=coverage(rs,path);return {value:n?money(sum(rs,path)):'Não demonstrado',hint:`${n}/${rs.length} valores preenchidos${n<rs.length?' · soma parcial':''}`};}
function render(){
 selection=selectRows();const filterActive=['#barFilter','#monthFilter','#statusFilter','#humanFilter','#search'].some(s=>$(s).value);
 const statuses=countStatuses(selection);
 $('#overview').innerHTML=`<div class="metric primary"><span class="label">Valor de trabalho${filterActive?' · seleção':''}</span><strong class="value">${money(workingSum(selection))}</strong><span class="hint">Original: ${money(sum(selection,'relatorio.valor_centavos'))} · ${selection.filter(r=>RV.state(r.id).valor_centavos!==null).length} ajustes</span></div><div class="metric"><span class="label">Valores conferidos por vocês</span><strong class="value">${money(checkedSum(selection))}</strong><span class="hint">${selection.filter(r=>RV.confirmed(r)).length}/${selection.length} marcados · erros e conflitos excluídos desta soma</span></div><div class="metric"><span class="label">Achados da leitura documental</span><div class="status-list">${statuses.map(({s,n})=>`<span class="badge ${statusClass(s)}">${n} ${s==='Correspondência demonstrada'?'correspondências':s==='Divergência demonstrada'?'divergências':'inconclusivas'}</span>`).join('')}</div><span class="hint">Cada motivo está descrito na linha; a revisão humana fica separada.</span></div>`;
 const conflicts=RV.conflicts();$('#reviewNotice').hidden=!conflicts.length;if(conflicts.length)$('#reviewNotice').textContent=`${conflicts.length} despesas com versões em conflito. Abra Resolver conflito na linha; nenhum valor em conflito entra no total conferido.`;
 $('#saveStatus').textContent=RV.saveError()||(window.SECURE_SESSION?'Salvo criptografado neste navegador. Exporte/importе para trocar revisões; não há sincronização automática.':'Alterações nesta aba. Abra a versão protegida para salvar e trocar revisões criptografadas.');
 $('#selectionCount').textContent=`${selection.length} de ${all.length} despesas · ${DATA.processos.length} processos · ${DATA.paginas.length} páginas de origem disponíveis`;
 $('#empty').hidden=selection.length>0;
 const names=[...new Set(DATA.processos.map(p=>p.bar))];
 $('#bars').innerHTML=names.map(bar=>{
  const rs=selection.filter(r=>r.bar===bar);if(!rs.length)return '';
  const ps=DATA.processos.filter(p=>p.bar===bar),safe=bar.replace(/[^A-Za-z0-9]/g,'');const isOpen=opened.has(bar),tab=activeTabs.get(bar)||'expenses';
 return `<article class="bar-card" data-bar="${esc(bar)}"><div class="bar-summary"><div><h2 class="bar-name">${esc(bar)}</h2><div class="bar-meta">SEI ${ps.map(p=>p.code).join(' / ')} · ${ps.length} PDF${ps.length>1?'s':''} · ${ps.reduce((n,p)=>n+p.paginas_pdf,0)} páginas<br>${ps.reduce((n,p)=>n+p.documentos.length,0)} peças inventariadas · ${rs.length} despesas${filterActive?' na seleção':''}</div></div><div><div class="small-label">Valor de trabalho${filterActive?' · seleção':''}</div><div class="big-money">${money(workingSum(rs))}</div><div class="muted">Conferido: ${money(checkedSum(rs))} · ${rs.filter(r=>RV.confirmed(r)).length}/${rs.length}</div></div><div class="status-list">${countStatuses(rs).map(({s,n})=>`<span class="badge ${statusClass(s)}">${n} ${s==='Correspondência demonstrada'?'correspondências':s==='Divergência demonstrada'?'divergências':'inconclusivas'}</span>`).join('')}</div><button class="button secondary" data-expand="${esc(bar)}" aria-expanded="${isOpen}" aria-controls="bar-${safe}">${isOpen?'Recolher ↑':'Ver mais ↓'}</button></div><div id="bar-${safe}" class="bar-content" ${isOpen?'':'hidden'}><div class="bar-tabs"><button class="tab ${tab==='expenses'?'active':''}" data-tab="expenses" data-bar-name="${esc(bar)}">Despesas e somas</button><button class="tab ${tab==='docs'?'active':''}" data-tab="docs" data-bar-name="${esc(bar)}">Documentos de origem</button></div>${tab==='expenses'?renderMonths(rs,ps,filterActive):renderDocs(ps)}${ps.map(p=>`<details class="limitations"><summary>Limitações e identificação · SEI ${p.code}</summary><p>${esc(p.beneficiaria)} · CNPJ ${esc(p.cnpj)} · ${esc(p.periodo)}</p><ul>${(p.limites||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>${p.paginas_revisadas.length}/${p.paginas_pdf} páginas inspecionadas visualmente. <a href="fontes/${esc(p.arquivo)}" target="_blank" rel="noopener">Abrir PDF recebido ↗</a></p></details>`).join('')}</div></article>`;
 }).join('');
}
function valueCell(r){
 const state=RV.state(r.id);const declared=r.relatorio.valor_centavos,nominal=r.documento.valor_centavos;
 let extra=state.valor_centavos!==null?`<span class="value-note adjusted">Original: ${money(declared)} · ajustado</span>`:'';
 if(nominal!==null&&nominal!==declared)extra+=`<span class="value-note">Documento: ${money(nominal)} · diferença ${money(declared-nominal)}</span>`;
 if(r.resultado==='Conferência inconclusiva')extra+=`<span class="value-note">Valor registrado; pendência explicada ao lado</span>`;
 return `<strong>${money(RV.effective(r))}</strong>${extra}`;
}
function rowReview(r){
 const s=RV.state(r.id);
 if(s.conflict)return `<button class="button conflict-button" data-conflict="${esc(r.id)}">Resolver conflito</button>`;
 return `<label class="row-check"><input type="checkbox" data-check="${esc(r.id)}" ${s.conferido?'checked':''}> Conferi o valor</label>${s.erro?`<span class="badge unknown">Erro sinalizado: ${esc(s.tipo_erro||'ver observação')}</span>`:''}${s.nota?`<p class="human-note">${esc(s.nota)}</p>`:''}${s.author?`<span class="row-id">${esc(s.author)} · ${new Date(s.at).toLocaleString('pt-BR')}</span>`:''}`;
}
function renderMonths(rs,ps,filtered){
 return ps.flatMap(p=>p.meses.map(m=>({p,m}))).sort((a,b)=>a.m.mes.localeCompare(b.m.mes)).map(({p,m})=>{
  const lines=rs.filter(r=>r.code===p.code&&r.relatorio.mes===m.mes);if(!lines.length)return '';
  const difference=m.diferenca_centavos;
  return `<section class="month-block"><div class="month-head"><div><h3>${month(m.mes)}</h3><p class="muted">SEI ${p.code} · ${lines.length} linhas${filtered?' na seleção':''}</p></div><div class="month-totals"><div>Valor de trabalho<strong>${money(workingSum(lines))}</strong></div><div>Valores conferidos<strong>${money(checkedSum(lines))}</strong><span>${lines.filter(r=>RV.confirmed(r)).length}/${lines.length} marcados sem erro/conflito</span></div><div>Original do relatório<strong>${money(m.total_impresso_centavos)}</strong><span>${difference===0?'Soma original confere':difference===null?'Total não demonstrado':`Soma das linhas difere ${money(difference)}`}</span></div></div></div><div class="table-wrap"><table class="expense-table"><thead><tr><th>Despesa / referência</th><th class="money">Valor de trabalho</th><th>Achado / o que falta conferir</th><th>Sua revisão</th><th>Fontes e ações</th></tr></thead><tbody>${lines.map(r=>`<tr data-row-id="${esc(r.id)}" class="${RV.state(r.id).erro?'row-flagged':''}"><td class="description">${esc(r.relatorio.descricao)}<span class="row-id">${esc(r.id)} · nº ${esc(r.relatorio.numero??'não informado')}<br>Data declarada: ${esc(r.relatorio.data??'não demonstrada')}</span></td><td class="money work-value">${valueCell(r)}</td><td class="finding-cell"><div class="finding-head">${badge(r.resultado)}<span>${esc(r.achado?.tipo_achado||'Comparação documental')}</span></div><p>${esc(r.achado?.resumo||r.comparacao)}</p>${r.achado?.proximo_passo?`<p class="next-step"><strong>Próximo passo:</strong> ${esc(r.achado.proximo_passo)}</p>`:''}</td><td class="review-cell">${rowReview(r)}</td><td class="actions"><button class="text-button" data-review="${esc(r.id)}">Ajustar / anotar</button><button class="text-button" data-flag="${esc(r.id)}">Sinalizar erro</button><button class="text-button" data-detail="${esc(r.id)}">Todos os dados</button><div class="source-buttons">${sourceButtons(r.code,r.relatorio.paginas,'Relatório')}${sourceButtons(r.code,[...new Set([...(r.documento.paginas||[]),...(r.pagamento.paginas||[])])],'Anexos')}</div></td></tr>`).join('')}<tr class="subtotal"><td>Soma das ${lines.length} linhas exibidas</td><td class="money">${money(workingSum(lines))}</td><td colspan="3">Valores conferidos: ${money(checkedSum(lines))} · ${lines.filter(r=>RV.confirmed(r)).length}/${lines.length} marcados. Base original das linhas: ${money(sum(lines,'relatorio.valor_centavos'))}.</td></tr></tbody></table></div><p class="muted">Limite informado: ${money(m.limite_informado_centavos)}. ${esc(m.observacao||'')} A revisão humana do valor e a admissão no benefício são decisões distintas.</p></section>`;
 }).join('');
}
function renderDocs(ps){return `<p class="muted">Peças reconhecíveis, incluindo documentos históricos. Uma peça pode ter várias páginas ou ocorrências. A contagem de páginas é distinta da contagem de documentos.</p><div class="table-wrap"><table><thead><tr><th>Peça / processo</th><th>Tipo</th><th>Referência</th><th>Descrição</th><th>Fonte</th></tr></thead><tbody>${ps.flatMap(p=>p.documentos.map(d=>`<tr><td>${esc(d.id)}<span class="row-id">SEI ${p.code}${d.sei?` · doc. ${esc(d.sei)}`:''}</span></td><td>${esc(d.tipo)}</td><td>${esc(d.numero??'Não identificado')}${d.limite_inconclusivo?'<br><span class="badge unknown">Limite da peça inconclusivo</span>':''}</td><td>${esc(d.descricao)}</td><td>${sourceButtons(p.code,d.paginas,'Ver imagem')}</td></tr>`)).join('')}</tbody></table></div>`;}
const labels={tipo:'Tipo',numero:'Número / referência',emissao:'Emissão',competencia:'Competência / período',competencia_fiscal:'Competência fiscal',emitente:'Emitente',cnpj_emitente:'CPF/CNPJ emitente',destinatario:'Tomador / destinatário',cnpj_destinatario:'CPF/CNPJ destinatário',descricao:'Descrição / objeto',valor_centavos:'Valor observado',paginas:'Páginas',data:'Data',mes:'Mês do relatório',alocado_centavos:'Valor alocado nesta despesa',pagador:'Pagador',cnpj_pagador:'CPF/CNPJ pagador',recebedor:'Recebedor',cnpj_recebedor:'CPF/CNPJ recebedor',situacao:'Situação da operação',identificador:'Identificador bancário',grupo:'Grupo de pagamento',observacao:'Observação',vinculo_documento:'Vínculo entre cobrança e pagamento',encargos_centavos:'Encargos identificados',principal_centavos:'Principal',vencimento:'Vencimento',cpf_destinatario:'CPF destinatário',endereco:'Endereço'};
function fields(obj,section="",doubts=[]){return `<dl class="fields">${Object.entries(obj).map(([k,v])=>`<div class="field ${doubts.includes(section+'.'+k)?'field-uncertain':''}"><dt>${esc(labels[k]||k.replaceAll('_',' '))}${doubts.includes(section+'.'+k)?' · não confirmado':''}</dt><dd>${v===null||v===undefined||v===''?'<span class="unread">Não demonstrado neste campo</span>':esc(k.endsWith('_centavos')?money(v):Array.isArray(v)?v.join(', '):typeof v==='object'?Object.entries(v).map(([x,y])=>`${x}: ${y}`).join('; '):v)}</dd></div>`).join('')}</dl>`;}
function detail(id){
 const r=byID.get(id);if(!r)return;
 $('#expenseTitle').textContent=`${r.bar} · ${r.id} · ${r.relatorio.descricao}`;
 const o=r.anterior||{};
 const comparison=[['Valor declarado',money(o.valor),money(r.relatorio.valor_centavos)],['Número declarado',o.nota_declarada,r.relatorio.numero],['Data declarada',o.data_declarada,r.relatorio.data],['Valor nominal',money(o.valor_documento),money(r.documento.valor_centavos)],['Débito observado',money(o.valor_pago_observado),money(r.pagamento.valor_centavos)],['Valor conciliado / alocado',money(o.valor_conciliado),money(r.pagamento.alocado_centavos)],['Número documental',o.numero_documento,r.documento.numero],['Emissão',o.emissao,r.documento.emissao],['Competência documental',o.competencia_documento,r.documento.competencia],['Data do pagamento',o.data_pagamento,r.pagamento.data],['Pagador',o.pagador,`${r.pagamento.pagador??'Não demonstrado'} · ${r.pagamento.cnpj_pagador??'CPF/CNPJ não exibido'}`],['Destinatário',o.destinatario,`${r.documento.destinatario??'Não demonstrado'} · ${r.documento.cnpj_destinatario??'CPF/CNPJ não exibido'}`],['Classificação',o.situacao,r.resultado]];
 $('#expenseBody').innerHTML=`<div class="expense-status">${badge(r.resultado)}<span class="muted">Leitura visual · ${month(r.relatorio.mes)} · processo ${r.code}</span></div><div class="detail-grid"><section class="detail-panel"><h3>1. Relatório declarado</h3>${fields(r.relatorio,"relatorio",r.achado?.campos_duvida||[])}<div class="source-buttons">${sourceButtons(r.code,r.relatorio.paginas,'Abrir relatório')}</div></section><section class="detail-panel"><h3>2. Documento da despesa</h3>${fields(r.documento,"documento",r.achado?.campos_duvida||[])}<div class="source-buttons">${sourceButtons(r.code,r.documento.paginas,'Abrir documento')}</div></section><section class="detail-panel"><h3>3. Pagamento</h3>${fields(r.pagamento,"pagamento",r.achado?.campos_duvida||[])}<div class="source-buttons">${sourceButtons(r.code,r.pagamento.paginas,'Abrir pagamento')}</div></section></div><section class="explanation"><h3>${esc(r.achado?.tipo_achado||"O que a comparação demonstra")}</h3><p><strong>${esc(r.achado?.resumo||"")}</strong></p>${r.achado?.campos_duvida?.length?`<p class="uncertainty-note">A dúvida está em: ${r.achado.campos_duvida.map(k=>esc(labels[k.split(".").pop()]||({objeto:"objeto da despesa",identidade:"identidade/vínculo das partes",vinculo_pagamento:"vínculo do pagamento",criterio_temporal:"critério temporal do benefício",admissao_encargos:"admissão dos encargos",admissao:"admissão no benefício"}[k])||k.replaceAll("_"," "))).join("; ")}. Valores legíveis permanecem registrados; isso não comprova sozinho o vínculo ou a admissão.</p>`:""}<h3>Comparação completa</h3><p>${esc(r.comparacao)}</p>${r.pendencias?.length?`<h3>O que precisa de esclarecimento</h3><ul>${r.pendencias.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</section><section class="admission-note"><strong>Admissão no benefício: ${esc(r.admissao.resultado)}</strong><p>Valor admitido: ${money(r.admissao.valor_centavos)}.</p><p>${esc(r.admissao.motivo||'')}</p>${r.admissao.fundamento?`<p>Fundamento: ${esc(r.admissao.fundamento)}</p>`:''}</section><details class="comparison"><summary>Comparar com a extração e a conferência anteriores</summary><p class="muted">O registro anterior reúne texto/OCR e ajustes manuais. Ele não é usado para confirmar automaticamente os campos visuais.</p><div class="table-wrap"><table><thead><tr><th>Campo</th><th>Registro anterior</th><th>Leitura visual principal</th></tr></thead><tbody>${comparison.map(([k,a,b])=>`<tr><td>${esc(k)}</td><td>${esc(a||'Não registrado')}</td><td>${esc(b||'Não demonstrado')}</td></tr>`).join('')}</tbody></table></div>${r.diferencas_anterior?.length?`<ul>${r.diferencas_anterior.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}<p>${esc(o.observacao||'')}</p></details>`;
 $('#expenseDialog').showModal();
}
function showSource(code,list){
 source={code,list:[...new Set(list)].filter(n=>pages.has(`${code}-P${String(n).padStart(3,'0')}`)),index:0};if(!source.list.length)return;
 $('#zoom').value=100;$('#oldTextPanel').open=false;updateSource();$('#sourceDialog').showModal();
}
async function updateSource(){
 const sequence=++sourceSequence;
 const n=source.list[source.index],p=pages.get(`${source.code}-P${String(n).padStart(3,'0')}`);const previous=DATA.textos_anteriores[p.id];
 $('#sourceTitle').textContent=`${proc.get(source.code)?.bar||''} · SEI ${source.code} · página ${n}`;
 $('#pagePosition').textContent=`${source.index+1} de ${source.list.length}`;$('#prevPage').disabled=source.index===0;$('#nextPage').disabled=source.index===source.list.length-1;
 $('#pageTabs').innerHTML=source.list.map((n,i)=>`<button class="page-tab ${i===source.index?'active':''}" data-page-index="${i}">Página ${n}</button>`).join('');
 $('#sourceImage').removeAttribute('src');$('#sourceImage').alt=`Página ${n} do PDF ${p.arquivo}`;$('#sourceImage').hidden=true;$('#imageError').hidden=true;
 try{const url=window.SECURE_SESSION?await window.SECURE_SESSION.assetURL(p.imagem):p.imagem;if(sequence!==sourceSequence)return;$('#sourceImage').src=url;$('#sourceImage').hidden=false;}catch(e){if(sequence===sourceSequence){$('#imageError').hidden=false;$('#imageError').textContent='Não foi possível abrir a fonte: '+e.message;}}
 $('#imageLink').href=p.imagem;$('#pdfLink').href=`fontes/${p.arquivo}#page=${n}`;
 $('#oldText').textContent=previous?.texto||'Nenhum texto anterior disponível para esta página.';$('#oldTextMethod').textContent=previous?.metodo||'';
 $('.image-scroll').scrollTop=0;$('.image-scroll').scrollLeft=0;zoomImage();
}
function zoomImage(){$('#sourceImage').style.width=`${$('#zoom').value}%`;$('#zoomValue').textContent=`${$('#zoom').value}%`;}
document.addEventListener('click',e=>{
 const expand=e.target.closest('[data-expand]');if(expand){const bar=expand.dataset.expand;opened.has(bar)?opened.delete(bar):opened.add(bar);render();return;}
 const tab=e.target.closest('[data-tab]');if(tab){activeTabs.set(tab.dataset.barName,tab.dataset.tab);render();return;}
 const d=e.target.closest('[data-detail]');if(d){detail(d.dataset.detail);return;}
 const s=e.target.closest('[data-source-code]');if(s){showSource(s.dataset.sourceCode,s.dataset.sourcePages.split(',').map(Number));return;}
 const page=e.target.closest('[data-page-index]');if(page){source.index=Number(page.dataset.pageIndex);updateSource();return;}
 const close=e.target.closest('[data-close]');if(close)document.getElementById(close.dataset.close).close();
});
for(const s of ['#barFilter','#monthFilter','#statusFilter','#humanFilter'])$(s).addEventListener('change',render);
$('#search').addEventListener('input',render);
$('#clear').addEventListener('click',()=>{for(const s of ['#barFilter','#monthFilter','#statusFilter','#humanFilter','#search'])$(s).value='';render();});
$('#prevPage').addEventListener('click',()=>{if(source.index>0){source.index--;updateSource();}});$('#nextPage').addEventListener('click',()=>{if(source.index<source.list.length-1){source.index++;updateSource();}});$('#zoom').addEventListener('input',zoomImage);
$('#sourceImage').addEventListener('error',()=>{$('#sourceImage').hidden=true;$('#imageError').hidden=false;});
$('#downloadCSV').addEventListener('click',()=>{
 const csvFields=[['ID','id'],['Bar','bar'],['Processo','code'],['Mês','relatorio.mes'],['Despesa','relatorio.descricao'],['Data declarada','relatorio.data'],['Número declarado','relatorio.numero'],['Declarado R$','relatorio.valor_centavos'],['Valor de trabalho R$','revisao.valor_centavos'],['Valor conferido','revisao.conferido'],['Erro sinalizado','revisao.erro'],['Observação humana','revisao.nota'],['Autor da revisão','revisao.author'],['Conflito','revisao.conflict'],['Motivo do achado','achado.resumo'],['Nominal R$','documento.valor_centavos'],['Débito observado R$','pagamento.valor_centavos'],['Alocado R$','pagamento.alocado_centavos'],['Emitente','documento.emitente'],['CNPJ emitente','documento.cnpj_emitente'],['Destinatário','documento.destinatario'],['CNPJ destinatário','documento.cnpj_destinatario'],['Data pagamento','pagamento.data'],['Pagador','pagamento.pagador'],['Recebedor','pagamento.recebedor'],['Grupo','pagamento.grupo'],['Resultado','resultado'],['Comparação','comparacao'],['Pendências','pendencias'],['Admissão','admissao.resultado'],['Admitido R$','admissao.valor_centavos'],['Páginas relatório','relatorio.paginas'],['Páginas despesa','documento.paginas'],['Páginas pagamento','pagamento.paginas']];
 const cell=v=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
 const lines=[csvFields.map(([h])=>cell(h)).join(';'),...selection.map(r=>csvFields.map(([_,k])=>{const view={...r,revisao:{...RV.state(r.id),valor_centavos:RV.effective(r)}};const v=num(view,k);return cell(k.endsWith('_centavos')?(v===null||v===undefined?'':(v/100).toFixed(2).replace('.',',')):Array.isArray(v)?v.join(' | '):v);}).join(';'))];
 const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='selecao_conferencia_visual.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#barFilter').insertAdjacentHTML('beforeend',[...new Set(DATA.processos.map(p=>p.bar))].map(b=>`<option>${esc(b)}</option>`).join(''));
$('#monthFilter').insertAdjacentHTML('beforeend',[...new Set(all.map(r=>r.relatorio.mes))].sort().map(m=>`<option value="${m}">${month(m)}</option>`).join(''));
if(!DATA.completo){$('#preparation').hidden=false;$('#preparation').textContent=`Entrega em preparação: ${DATA.processos.length} de 7 processos incorporados. Os demais ainda não aparecem nos totais.`;}
render();
window.addEventListener("revisao-alterada",render);
RV.init().then(render).catch(e=>{$("#reviewNotice").hidden=false;$("#reviewNotice").textContent="Falha ao carregar revisões: "+e.message;});
// Interface de leitura para verificação automática de somas e cobertura, sem modificar dados.
window.PAINEL_TEST={all,selectRows,sum,coverage,render,detail,showSource};

function notice(text){$('#reviewNotice').hidden=false;$('#reviewNotice').textContent=text;}
function parseMoney(value){
 const s=value.trim().replace(/^R\$\s*/, '');if(!s)return null;
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s))throw new Error('Use reais com até duas casas, por exemplo 1.500,00.');
 const [integer,decimal='']=s.replaceAll('.','').split(',');const n=Number(integer)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(n)||n>1e12)throw new Error('Valor fora do intervalo permitido.');return n;
}
function editReview(id,flag=false){
 const r=byID.get(id),s=RV.state(id);if(s.conflict){openConflict(id);return;}
 $('#reviewRowID').value=id;$('#reviewTitle').textContent=`${r.bar} · ${id}`;$('#reviewOriginal').textContent=`Original declarado: ${money(r.relatorio.valor_centavos)}. O ajuste altera somente o valor de trabalho, preservando a fonte.`;
 $('#reviewAmount').value=s.valor_centavos===null?'':(s.valor_centavos/100).toFixed(2).replace('.',',');$('#reviewChecked').checked=s.conferido;$('#reviewError').checked=flag||s.erro;$('#reviewErrorType').value=s.tipo_erro;$('#reviewNote').value=s.nota;$('#reviewFormError').textContent='';
 const history=RV.history(id);$('#reviewHistory').innerHTML=history.length?`<details class="comparison"><summary>Histórico · ${history.length} revisões</summary>${history.map(e=>`<p><strong>${esc(e.author)}</strong> · ${new Date(e.at).toLocaleString('pt-BR')}<br>Valor: ${e.value.valor_centavos===null?'original':money(e.value.valor_centavos)} · conferido: ${e.value.conferido?'sim':'não'} · erro: ${e.value.erro?'sim':'não'}<br>${esc(e.value.nota)}</p>`).join('')}</details>`:'';
 $('#reviewDialog').showModal();
}
function openConflict(id){
 const r=byID.get(id),s=RV.state(id);$('#conflictBody').innerHTML=`<p><strong>${esc(r.bar)} · ${esc(id)}</strong>. As duas versões ficam preservadas no histórico. Escolha qual deve valer; a decisão cria uma revisão que resolve o conflito.</p>${s.heads.map(e=>`<section class="conflict-version"><h3>${esc(e.author)}</h3><p>${new Date(e.at).toLocaleString('pt-BR')}</p><p>Valor de trabalho: <strong>${money(e.value.valor_centavos===null?r.relatorio.valor_centavos:e.value.valor_centavos)}</strong><br>Conferido: ${e.value.conferido?'sim':'não'} · erro: ${e.value.erro?'sim':'não'}</p><p>${esc(e.value.nota)}</p><button class="button" data-resolve="${esc(id)}" data-event-id="${esc(e.id)}">Usar esta versão</button></section>`).join('')}`;$('#conflictDialog').showModal();
}
$('#reviewerName').addEventListener('input',()=>RV.setAuthor($('#reviewerName').value));
document.addEventListener('change',e=>{
 const check=e.target.closest('[data-check]');if(!check)return;
 try{const s=RV.state(check.dataset.check);RV.commit(check.dataset.check,{conferido:check.checked,valor_centavos:s.valor_centavos,erro:s.erro,tipo_erro:s.tipo_erro,nota:s.nota});}catch(err){check.checked=!check.checked;notice(err.message);$('#reviewerName').focus();}
});
document.addEventListener('click',async e=>{
 const edit=e.target.closest('[data-review]');if(edit){editReview(edit.dataset.review);return;}
 const flag=e.target.closest('[data-flag]');if(flag){editReview(flag.dataset.flag,true);return;}
 const conflict=e.target.closest('[data-conflict]');if(conflict){openConflict(conflict.dataset.conflict);return;}
 const resolve=e.target.closest('[data-resolve]');if(resolve){try{const id=resolve.dataset.resolve,heads=RV.state(id).heads,target=heads.find(x=>x.id===resolve.dataset.eventId);RV.commit(id,{...target.value,nota:target.value.nota+'\nConflito resolvido por '+RV.author()+': versão de '+target.author+'.'},heads.map(x=>x.id));$('#conflictDialog').close();}catch(err){notice(err.message);}return;}
 const link=e.target.closest('a[href]');if(window.SECURE_SESSION&&link&&window.SECURE_SESSION.hasAsset(link.getAttribute('href')?.split('#')[0])){
  e.preventDefault();const path=link.getAttribute('href').split('#')[0],fragment=link.getAttribute('href').includes('#')?'#'+link.getAttribute('href').split('#')[1]:'';let tab=null;
  if(link.target==='_blank'&&!link.hasAttribute('download')){tab=window.open('about:blank','_blank');if(tab)tab.opener=null;}
  try{const url=await window.SECURE_SESSION.assetURL(path);if(link.hasAttribute('download')){const a=document.createElement('a');a.href=url;a.download=path.split('/').pop();a.click();}else if(tab)tab.location.href=url+fragment;else{const a=document.createElement('a');a.href=url+fragment;a.target='_blank';a.rel='noopener';a.click();}}catch(err){if(tab)tab.close();notice('Falha ao abrir documento: '+err.message);}
 }
});
$('#removeAdjustment').addEventListener('click',()=>{$('#reviewAmount').value='';$('#reviewChecked').checked=false;});
$('#reviewAmount').addEventListener('input',()=>{$('#reviewChecked').checked=false;});
$('#reviewForm').addEventListener('submit',e=>{
 e.preventDefault();try{const id=$('#reviewRowID').value,value={conferido:$('#reviewChecked').checked,valor_centavos:parseMoney($('#reviewAmount').value),erro:$('#reviewError').checked,tipo_erro:$('#reviewErrorType').value,nota:$('#reviewNote').value.trim()};if((value.erro||value.valor_centavos!==null)&&value.nota.length<5)throw new Error('Explique o ajuste ou erro na justificativa.');if(value.erro&&!value.tipo_erro)throw new Error('Selecione o tipo de erro.');RV.commit(id,value);$('#reviewDialog').close();}catch(err){$('#reviewFormError').textContent=err.message;}
});
$('#exportReviews').addEventListener('click',async()=>{try{await RV.exportFile();notice('Revisões exportadas em arquivo criptografado. Envie o arquivo ao colega para importação.');}catch(err){notice(err.message);}});
$('#importReviews').addEventListener('click',()=>$('#reviewFile').click());
$('#reviewFile').addEventListener('change',async()=>{const file=$('#reviewFile').files[0];if(!file)return;try{const result=await RV.importFile(file);notice(`${result.added} revisões importadas; ${result.conflicts} despesas em conflito. As versões anteriores foram preservadas.`);}catch(err){notice('Importação interrompida: '+err.message);}finally{$('#reviewFile').value='';}});
if(window.SECURE_SESSION){$('#lockSession').hidden=false;$('#lockSession').addEventListener('click',async()=>{await RV.flush();window.SECURE_SESSION.lock();});}
window.PAINEL_TEST.parseMoney=parseMoney;window.PAINEL_TEST.workingSum=workingSum;
