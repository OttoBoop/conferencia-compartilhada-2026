"""Síntese determinística de uma prestação de contas para revisão humana.

Sem consulta externa e sem decisão automática de elegibilidade. Compatível com
CPython e com Pyodide; os valores monetários permanecem em centavos inteiros.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from xml.sax.saxutils import escape

MONTHS = ('janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro')
ACT = 'Portaria SMDE/CCPAR “P” nº 002, de 11 de abril de 2025'


def reais(cents):
    if cents is None:
        return 'indeterminado'
    sign = '-' if cents < 0 else ''
    whole, frac = divmod(abs(cents), 100)
    return f'R$ {sign}{whole:,}'.replace(',', '.') + f',{frac:02d}'


def mes(iso):
    year, number = iso.split('-')
    return f'{MONTHS[int(number) - 1]} de {year}'


def sei_number(process):
    found = re.search(r'SEI_(\d{6})\.(\d{6})_(\d{4})_(\d{2})', process.get('arquivo', ''))
    return (f'{found[1]}.{found[2]}/{found[3]}-{found[4]}' if found
            else str(process.get('processo', process['code'])))


def page_reference(code, pages):
    numbers = sorted(set(p for p in (pages or []) if isinstance(p, int) and p > 0))
    return f'PDF SEI {code}, ' + ('p. ' + ', '.join(map(str, numbers)) if numbers else 'página não indicada')


def category(text):
    lower = (text or '').casefold()
    tests = (
        ('valor', ('valor', 'acréscimo', 'encargo', 'juros', 'multa', 'tarifa', 'quantia')),
        ('identidade', ('cnpj', 'cpf', 'destinat', 'pagador', 'titular', 'benefici', 'imóvel')),
        ('objeto', ('objeto', 'produto', 'serviço', 'aluguel', 'locação', 'fornecimento')),
        ('data/competência', ('data', 'mês', 'competência', 'vencimento', 'temporal', 'ano')),
        ('pagamento', ('pagamento', 'pix', 'comprovante', 'débito', 'boleto', 'recebedor')),
        ('duplicidade', ('repetid', 'duplic', 'reutiliza')),
    )
    found = [label for label, words in tests if any(word in lower for word in words)]
    return found or ['outros']


def listed_descriptions(rows):
    names = list(dict.fromkeys(r['relatorio']['descricao'].strip() for r in rows if r['relatorio']['descricao'].strip()))
    if not names:
        return 'itens identificados nas linhas do relatório'
    return ', '.join(names[:4]) + (' e demais lançamentos descritos no relatório' if len(names) > 4 else '')


def is_general_issue(text):
    lower = text.casefold()
    return not any(fragment in lower for fragment in (
        'autenticidade externa', 'não houve consulta externa', 'não foram consultad',
        'não foi consultad', 'páginas 47 e 82', 'páginas 38,74',
        'página 28 em branco', 'revisão abrange apenas arquivos',
        'imagens e documentos do pdf foram lidos', 'todas as 106 páginas',
        'todas as 114 páginas', 'conferência visual das peças',
    ))


def issue_rows(process, states):
    code = process['code']
    reference = sei_number(process)
    result = []
    for row in process['despesas']:
        finding = row.get('achado') or {}
        doubts = finding.get('campos_duvida') or []
        revised = states.get('finding:' + row['id']) or {}
        expense = states.get(row['id']) or {}
        adjusted = expense.get('valor_centavos') is not None and expense.get('valor_centavos') != row['relatorio']['valor_centavos']
        if row['resultado'] == 'Correspondência demonstrada' and not doubts and not expense.get('erro') and not adjusted and not revised:
            continue
        title = revised.get('titulo') or finding.get('tipo_achado') or row['resultado']
        summary = revised.get('resumo') or finding.get('resumo') or row.get('comparacao') or ''
        if expense.get('erro'):
            summary += f' Revisão humana sinalizou erro ({expense.get("tipo_erro") or "tipo não informado"}): {expense.get("nota") or "sem observação"}.'
        if adjusted:
            summary += (f' Valor de trabalho ajustado de {reais(row["relatorio"]["valor_centavos"])} '
                        f'para {reais(expense["valor_centavos"])}. Justificativa: {expense.get("nota") or "não informada"}.')
        next_step = revised.get('providencia') or finding.get('proximo_passo') or 'Conferir o vínculo documental.'
        admission = states.get('admission:' + row['id']) or {}
        result.append({
            'id': row['id'], 'month': row['relatorio']['mes'],
            'description': row['relatorio']['descricao'],
            'title': title, 'summary': summary, 'next_step': next_step,
            'categories': revised.get('categorias') or category(title + ' ' + ' '.join(doubts)
                                                              + (' ' + expense.get('tipo_erro', '') if expense.get('erro') else '')),
            'status': revised.get('situacao') or 'pendente',
            'resolution': revised.get('fundamento') or '',
            'amount_effect': (None if admission.get('status') not in ('admitida', 'excluida')
                              else (expense.get('valor_centavos') if expense.get('valor_centavos') is not None
                                    else row['relatorio']['valor_centavos']) - admission.get('valor_centavos', 0)),
            'report_pages': row['relatorio'].get('paginas') or [],
            'document_pages': row['documento'].get('paginas') or [],
            'payment_pages': row['pagamento'].get('paginas') or [],
            'source': '; '.join(('Relatório: ' + page_reference(reference, row['relatorio'].get('paginas')),
                                'Documento: ' + page_reference(reference, row['documento'].get('paginas')),
                                'Pagamento: ' + page_reference(reference, row['pagamento'].get('paginas')))),
            'kind': 'expense',
        })
    report_pages = sorted({page for m in process['meses'] for page in m.get('paginas_relatorio', [])})
    for index, text in enumerate(process.get('limites') or []):
        if not is_general_issue(text):
            continue
        ident = f'general:{code}:{index}'
        revised = states.get(ident) or {}
        result.append({
            'id': ident, 'month': None, 'description': 'Questão geral do processo',
            'title': revised.get('titulo') or 'Condição do processo',
            'summary': revised.get('resumo') or text,
            'next_step': revised.get('providencia') or 'Confirmar nos autos e registrar o fundamento.',
            'categories': revised.get('categorias') or category(text),
            'status': revised.get('situacao') or 'pendente',
            'resolution': revised.get('fundamento') or '',
            'amount_effect': None,
            'report_pages': report_pages,
            'document_pages': [], 'payment_pages': [],
            'source': page_reference(reference, report_pages) + '; PDF integral para peças ausentes',
            'kind': 'general',
        })
    return result


def build(process, states):
    code = process['code']
    identity = states.get('process:' + code) or {}
    beneficiary = identity.get('beneficiaria') or process.get('beneficiaria_despacho') or process['beneficiaria']
    cnpj = identity.get('cnpj') or process['cnpj']
    period = identity.get('periodo') or process['periodo']
    act = identity.get('ato') or ACT
    issues = issue_rows(process, states)
    by_month = []
    warnings = []
    for report in process['meses']:
        iso = report['mes']
        rows = [r for r in process['despesas'] if r['relatorio']['mes'] == iso]
        policy = states.get(f'month:{code}:{iso}') or {}
        printed = report.get('total_impresso_centavos')
        line_sum = sum(r['relatorio']['valor_centavos'] for r in rows)
        working = sum((states.get(r['id']) or {}).get('valor_centavos')
                      if (states.get(r['id']) or {}).get('valor_centavos') is not None
                      else r['relatorio']['valor_centavos'] for r in rows)
        reported_limit = report.get('limite_informado_centavos')
        confirmed_limit = policy.get('limite_centavos')
        if confirmed_limit is None or not policy.get('fonte', '').strip():
            warnings.append(f'{mes(iso)}: limite individual e fonte ainda não confirmados.')
        admitted = 0
        admitted_ready = True
        unchecked = 0
        flagged = 0
        for row in rows:
            value = states.get('admission:' + row['id']) or {}
            expense_review = states.get(row['id']) or {}
            if not expense_review.get('conferido'):
                unchecked += 1
            if expense_review.get('erro'):
                flagged += 1
            if expense_review.get('at') and value.get('at') and expense_review['at'] > value['at']:
                warnings.append(f'{row["id"]}: valor de trabalho mudou após a decisão de admissão; revise-a.')
            work_value = expense_review.get('valor_centavos')
            if work_value is None:
                work_value = row['relatorio']['valor_centavos']
            if value.get('status') not in ('admitida', 'excluida') or not value.get('fundamento', '').strip():
                admitted_ready = False
                continue
            part = value.get('valor_centavos')
            if not isinstance(part, int) or part < 0 or part > work_value or (value['status'] == 'excluida' and part != 0):
                admitted_ready = False
                warnings.append(f'{row["id"]}: valor admitido inválido ou maior que o valor de trabalho.')
                continue
            admitted += part
        if not admitted_ready:
            warnings.append(f'{mes(iso)}: há despesas sem decisão fundamentada de admissão.')
        if unchecked:
            warnings.append(f'{mes(iso)}: {unchecked} valor(es) ainda não marcado(s) como conferido(s) por revisor.')
        if flagged:
            warnings.append(f'{mes(iso)}: {flagged} despesa(s) com erro sinalizado.')
        month_issues = [item for item in issues if item['month'] == iso]
        counts = Counter((item['categories'] or ['outros'])[0] for item in month_issues)
        type_text = ', '.join(f'{count} de {label}' for label, count in counts.most_common(4))
        if len(counts) > 4:
            type_text += f' e {sum(list(counts.values())[4:])} em outras categorias'
        notes = []
        if printed != line_sum:
            notes.append(f'a soma das linhas é {reais(line_sum)}, diferença de {reais(line_sum - printed)} em relação ao total impresso')
        if working != line_sum:
            notes.append(f'o valor de trabalho após revisões é {reais(working)}')
        if reported_limit is not None:
            notes.append(f'o limite informado no relatório é {reais(reported_limit)} e o excesso aritmético sobre ele é {reais(max(0, line_sum - reported_limit))}')
        notes.append(f'os lançamentos estão descritos no relatório como {listed_descriptions(rows)}')
        plural = 'apontamento individualizado' if len(month_issues) == 1 else 'apontamentos individualizados'
        notes.append(f'a conferência registrou {len(month_issues)} {plural} no quadro deste despacho' + (f', sobre {type_text}' if type_text else ''))
        if confirmed_limit is None:
            notes.append('o limite individual e o valor proposto dependem de fundamento documental')
        elif admitted_ready:
            notes.append(f'com base nas admissões registradas, o valor mensal proposto é {reais(min(admitted, confirmed_limit))}')
        else:
            notes.append('o valor mensal proposto permanece indeterminado')
        by_month.append({
            'month': iso, 'label': mes(iso), 'printed': printed, 'line_sum': line_sum,
            'working': working, 'reported_limit': reported_limit,
            'confirmed_limit': confirmed_limit, 'limit_source': policy.get('fonte') or '',
            'reported_excess': None if reported_limit is None else max(0, line_sum - reported_limit),
            'admitted': admitted if admitted_ready else None,
            'proposed': min(admitted, confirmed_limit) if admitted_ready and confirmed_limit is not None and policy.get('fonte') else None,
            'issue_count': len(month_issues), 'issue_types': dict(counts),
            'report_pages': report.get('paginas_relatorio') or [],
            'text': f'No mês de {mes(iso)}, foram declaradas despesas de {reais(printed)}. '
                    + '. '.join(s[0].upper() + s[1:] for s in notes) + '.',
        })
    for item in issues:
        if item['status'] == 'pendente':
            warnings.append(f'{item["id"]}: apontamento sem resolução registrada.')
        elif not item['resolution'].strip():
            warnings.append(f'{item["id"]}: falta fundamento para o tratamento do apontamento.')
    for key, value in states.items():
        if isinstance(value, dict) and value.get('_conflict') and (key == 'process:' + code or key.startswith(('month:' + code + ':', 'block:' + code + ':', 'conclusion:' + code)) or any(r['id'] in key for r in process['despesas'])):
            warnings.append(f'{key}: revisões em conflito.')
    total_printed = sum(m['printed'] or 0 for m in by_month)
    total_lines = sum(m['line_sum'] for m in by_month)
    total_working = sum(m['working'] for m in by_month)
    reported_excess = sum(m['reported_excess'] or 0 for m in by_month)
    total_proposed = sum(m['proposed'] for m in by_month) if all(m['proposed'] is not None for m in by_month) else None
    conclusion = (states.get('conclusion:' + code) or {}).get('tipo') or 'diligencia'
    if conclusion not in ('diligencia', 'com_ressalvas', 'sem_ressalvas'):
        conclusion = 'diligencia'
    payout_ready = not warnings and total_proposed is not None
    if conclusion != 'diligencia' and not payout_ready:
        warnings.insert(0, 'Conclusão de pagamento indisponível enquanto houver pendências, conflitos ou valores sem fundamento.')
    if conclusion == 'sem_ressalvas' and any(i['status'] == 'ressalva' for i in issues):
        warnings.insert(0, 'Há ressalvas registradas; escolha a conclusão com ressalvas ou revise o tratamento.')
    intro = (f'A Comissão de Fiscalização do Programa Reviver Rua da Cerveja, instituída pela {act}, '
             f'com base na documentação apresentada por {beneficiary}, CNPJ nº {cnpj}, '
             f'no processo SEI nº {sei_number(process)}, referente ao período de {period}, apresenta a seguinte análise:')
    issue_label = 'apontamento individualizado' if len(issues) == 1 else 'apontamentos individualizados'
    findings_intro = (f'A conferência identificou {len(issues)} {issue_label} no quadro deste despacho. '
                      'Cada registro informa a divergência ou dúvida, a providência necessária e as páginas dos documentos.')
    consolidation = (f'No período analisado, os totais impressos nos relatórios somam {reais(total_printed)} e a soma dos lançamentos é {reais(total_lines)}. '
                     f'O valor de trabalho, consideradas as revisões registradas, é {reais(total_working)}. '
                     f'O excesso aritmético sobre os limites informados, calculado mês a mês, soma {reais(reported_excess)}; '
                     'esse excesso não é uma glosa adicional às despesas excluídas. ')
    consolidation += (f'A soma dos valores propostos por mês é {reais(total_proposed)}.' if total_proposed is not None
                      else 'A soma proposta para pagamento permanece indeterminada até a confirmação dos limites e das admissões.')
    if conclusion == 'diligencia' or not payout_ready:
        pending = [item for item in issues if item['status'] == 'pendente']
        examples = '; '.join(f'{item["id"]}: {item["title"]}' for item in pending[:3])
        if len(pending) > 3:
            examples += f'; e outros {len(pending) - 3} apontamentos no quadro'
        requests = 'confirmar os limites individuais e fundamentar a admissão das despesas'
        if examples:
            requests += f'; esclarecer {examples}'
        conclusion_text = (f'Diante do exposto, a Comissão propõe diligência para {requests}. '
                           'Após o saneamento, retornem os autos para análise conclusiva e apuração do valor mensal admitido. '
                           'Encaminhe-se para esclarecimento e complementação documental.')
    elif conclusion == 'com_ressalvas':
        conclusion_text = (f'Diante do exposto, a Comissão é favorável ao prosseguimento das rotinas para liquidação e pagamento, '
                           f'com as ressalvas fundamentadas no quadro, no valor de {reais(total_proposed)}, correspondente à soma '
                           'dos valores admitidos em cada mês. Publique-se.')
    else:
        conclusion_text = (f'Diante do exposto, a Comissão aprova sem ressalvas as despesas de {beneficiary}, CNPJ nº {cnpj}, '
                           f'referentes ao período de {period}, e é favorável ao prosseguimento das rotinas para liquidação e '
                           f'pagamento de {reais(total_proposed)}, observado o limite individual de cada mês. Publique-se.')
    proposed_blocks = ([{'key': 'opening', 'title': 'Abertura', 'text': intro}]
                       + [{'key': 'month:' + m['month'], 'title': m['label'].capitalize(), 'text': m['text']} for m in by_month]
                       + [{'key': 'findings', 'title': 'Apontamentos', 'text': findings_intro},
                          {'key': 'consolidation', 'title': 'Consolidação', 'text': consolidation},
                          {'key': 'conclusion', 'title': 'Conclusão', 'text': conclusion_text}])
    blocks = []
    for item in proposed_blocks:
        revised = states.get(f'block:{code}:{item["key"]}') or {}
        checksum = hashlib.sha256(item['text'].encode('utf-8')).hexdigest()
        blocks.append({**item, 'suggested': item['text'], 'text': revised.get('text') or item['text'],
                       'generated_hash': checksum,
                       'edited': bool(revised.get('text')),
                       'stale': bool(revised.get('text') and revised.get('base_hash') != checksum)})
    if any(block['stale'] for block in blocks):
        warnings.append('Há parágrafos editados cuja base mudou; compare e atualize antes de finalizar.')
    return {'code': code, 'processo': sei_number(process), 'beneficiaria': beneficiary,
            'cnpj': cnpj, 'periodo': period, 'conclusion': conclusion,
            'months': by_month, 'issues': issues, 'blocks': blocks,
            'totals': {'printed': total_printed, 'lines': total_lines,
                       'working': total_working, 'reported_excess': reported_excess,
                       'proposed': total_proposed},
            'warnings': list(dict.fromkeys(warnings)),
            'payout_ready': payout_ready and not any(block['stale'] for block in blocks)}


def _paragraph(text, style=None):
    lines = str(text).split('\n') or ['']
    return ''.join('<w:p>' + (f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else '')
                   + '<w:r><w:t xml:space="preserve">' + escape(line) + '</w:t></w:r></w:p>' for line in lines)


def _cell(text):
    return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>' + _paragraph(text) + '</w:tc>'


def make_docx(snapshot):
    body = _paragraph('MINUTA PARA REVISÃO', 'Title')
    body += _paragraph('Processo SEI nº ' + snapshot['processo'], 'Subtitle')
    if snapshot['warnings']:
        body += _paragraph('Valor proposto ainda sujeito às pendências e aos fundamentos indicados no quadro de apontamentos.')
    table = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>'
    table += '<w:tr>' + ''.join(_cell(s) for s in ('Lançamento', 'Divergência ou dúvida', 'Efeito', 'Providência', 'Fonte')) + '</w:tr>'
    for issue in snapshot['issues']:
        effect = 'A determinar' if issue['amount_effect'] is None else reais(issue['amount_effect'])
        treatment = issue['next_step'] + (('\nTratamento registrado: ' + issue['resolution']) if issue['resolution'] else '')
        table += '<w:tr>' + ''.join(_cell(s) for s in (
            issue['id'] + ' · ' + issue['status'], issue['summary'], effect, treatment, issue['source'])) + '</w:tr>'
    table += '</w:tbl>'
    for block in snapshot['blocks']:
        body += _paragraph(block['title'], 'Heading1') + _paragraph(block['text'])
        if block['key'] == 'findings':
            body += _paragraph('Quadro de apontamentos', 'Heading1') + table
    body += '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>'
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                '<w:body>' + body + '</w:body></w:document>')
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
              '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style>'
              '</w:styles>')
    content_types = ('<?xml version="1.0" encoding="UTF-8"?>'
                     '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                     '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                     '<Default Extension="xml" ContentType="application/xml"/>'
                     '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                     '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                     '</Types>')
    relationships = ('<?xml version="1.0" encoding="UTF-8"?>'
                     '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                     '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                     '</Relationships>')
    doc_rels = ('<?xml version="1.0" encoding="UTF-8"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                '</Relationships>')
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in (('[Content_Types].xml', content_types), ('_rels/.rels', relationships),
                              ('word/document.xml', document), ('word/styles.xml', styles),
                              ('word/_rels/document.xml.rels', doc_rels)):
            archive.writestr(name, content)
    return base64.b64encode(output.getvalue()).decode('ascii')


def from_json(payload):
    request = json.loads(payload)
    snapshot = build(request['process'], request['states'])
    return json.dumps(snapshot, ensure_ascii=False)


def docx_from_json(payload):
    return make_docx(json.loads(payload))
