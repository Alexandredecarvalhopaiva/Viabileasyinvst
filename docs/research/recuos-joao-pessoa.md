# Recuos de João Pessoa: base documental para o protótipo

Pesquisa de implementação em 21/10/2026. Escopo: recuos de uma massa conceitual no município de João Pessoa/PB. As regras abaixo são extraídas de publicações oficiais; sua aplicação a um terreno depende de enquadramento, cadastro, alinhamento e restrições confirmados. Este levantamento não homologa o projeto nem certifica a consolidação de toda legislação e jurisprudência posterior.

## Resultado implementável

A referência numérica principal é o **Anexo IV da LC 169/2024**, que substitui o Anexo V da LC 166/2024. O quadro e as notas estão nas páginas 4 e 5 do PDF oficial / DO 681 de 23/12/2024. Os conceitos e as regras geométricas estão nos arts. 68–81 da LC 166/2024. Não reutilizar automaticamente o antigo recuo demonstrativo de 5/5/3 m como regra municipal. [LC 169, quadro e notas](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4), [LUOS republicada, Câmara](https://sapl.joaopessoa.pb.leg.br/media/sapl/public/normajuridica/2024/19967/166_-_29.04.24_-_luos_-_lei_de_uso_e_ocupacao_do_solo-republicada_em_23-08-2024.pdf#page=21).

Implementação recomendada: catálogo documental versionado, enquadramento informado explicitamente, resultado condicional, cálculo por pavimento e por lado do polígono, cotas e área não edificável visíveis no 2D/3D. Sem zona, classificação viária, situação de orla ou lados suficientes, mostrar pendências e manter o resultado sem enquadramento normativo confirmado.

## Situação normativa e orla

- O portal municipal apresenta LC 164/2024 (Plano Diretor), LC 171/2025 (alteração), LC 166/2024 (LUOS), LC 169/2024 (alteração) e Lei 15.197/2024 / Lei 15.609/2025 (Sistema Viário). Também adverte que temas disciplinados na nova legislação revogam disposições conflitantes do Decreto 9.718/2021 e do Código de Obras antigo. [Catálogo municipal](https://planodiretor.joaopessoa.pb.gov.br/legislacaovigente/).
- A notícia da PMJP de 11/12/2025 relata a controvérsia sobre a inconstitucionalidade da LUOS. **Ela não é o último marco localizado**: o TJPB informa, em 21/01/2026, que o julgamento dos embargos manteve a validade da LUOS e declarou inconstitucional apenas o art. 62. A fonte do próprio tribunal é a referência para esse resultado, e não a notícia municipal anterior. [TJPB, 21/01/2026, atualizado 23/01/2026](https://portal-legado.tjpb.jus.br/noticia/decisao-do-tjpb-mantem-proibicao-da-construcao-de-espigoes-na-orla).
- A MP 82/2025, de 18/12/2025, contém revogação expressa do art. 62. O SAPL mostra a matéria, a publicação e o texto oficial; não foi confirmada nesta pesquisa sua conversão final ou os efeitos atuais próprios da MP. **Não usar os antigos nove patamares do art. 62 como autorização automática de altura**. [Matéria da Câmara](https://sapl.joaopessoa.pb.leg.br/materia/194947), [texto oficial da MP, art. 1º, PDF p. 3](https://sapl.joaopessoa.pb.leg.br/media/sapl/public/materialegislativa/2025/194947/mensagem_189_-_mp_82_-_revoga_art._62_da_lc_66_-_luos.pdf#page=3).
- Em 27/03/2026, a prefeitura apresentou **proposta** de nova redação do art. 62, em audiência. Proposta e minuta não equivalem a lei sancionada. Não foi localizada nesta pesquisa comprovação primária de promulgação da proposta. [Notícia da PMJP](https://www.joaopessoa.pb.gov.br/noticias/em-consonancia-com-mppb-prefeitura-realiza-debate-e-propoe-medidas-mais-restritivas-sobre-altura-de-predios-na-orla-de-joao-pessoa/), [agenda e minutas](https://planodiretor.joaopessoa.pb.gov.br/agenda/).

Consequência para o produto: se o lote estiver na faixa de restrição da orla, se a situação for desconhecida, ou se houver regime adicional ambiental/patrimonial não resolvido, a modelagem não pode exibir “legal/aprovado”. Pode mostrar recuos documentais isoladamente, mas a conclusão normativa e o gabarito devem ficar pendentes/bloqueados. A tabela de recuos não comprova, sozinha, que um uso é permitido ou que certa altura é admitida.

## Regras geométricas gerais da LUOS

Fonte dos itens seguintes: [LC 166/2024 republicada, arts. 68–81, pp. 21–25 de 40](https://sapl.joaopessoa.pb.leg.br/media/sapl/public/normajuridica/2024/19967/166_-_29.04.24_-_luos_-_lei_de_uso_e_ocupacao_do_solo-republicada_em_23-08-2024.pdf#page=21).

| Dispositivo | Regra relevante | Consequência de implementação |
|---|---|---|
| Art. 68, caput | Recuo frontal é a menor distância perpendicular do alinhamento do lote à fachada | Aplicar offset perpendicular à aresta, em metros |
| Art. 68, §1º | Todas as frentes para vias públicas atendem ao recuo frontal | Esquina não possui apenas uma frente para fins de recuo; permitir marcar todas as arestas de frente |
| Art. 68, §2º | Recuo depende da zona e hierarquia viária | Não inferir pelo nome do bairro |
| Art. 68, §3º | Predominância mínima de 75% pode manter recuo predominante apenas em reformas/regularizações, conforme requisitos | Não reduzir o recuo de nova construção por alinhamento dos vizinhos |
| Art. 68, §4º | Diretriz viária pode mudar o alinhamento a partir do qual se mede o recuo | Lote atingido por alargamento exige alinhamento projetado; bloquear aplicação automática até conhecer a geometria correta |
| Art. 68, §5º | Frente para orla sem via pública também atende ao recuo frontal | Ausência de rua não torna aquela divisa lateral/fundo |
| Art. 69, parágrafo único | Em ZCS e vias arteriais/coletoras, rampa veicular atende recuo frontal mínimo de 2 m | Regra de rampa não substitui o recuo frontal da massa principal |
| Art. 73 | Subsolo/semissubsolo: recuo frontal mínimo de 2 m | Não aplicar o envelope do pavimento tipo ao subsolo |
| Art. 74, §2º–3º | Aberturas não perpendiculares à divisa exigem ao menos 1,50 m; varanda é abertura | Valores de recuo zero do quadro não autorizam automaticamente janelas/varandas |
| Art. 74, §4º | Dispensa lateral/fundos de subsolos/semissubsolos, preservadas fundações/divisas | Fora do escopo da massa aérea, salvo modelo específico |
| Art. 75 | Entre blocos: 1,5 × recuo lateral do pavimento, com exceção casa/edícula | Uma torre apenas não homologa múltiplos blocos |
| Art. 76 | Madeira: mínimo 2 m às divisas laterais/fundos e 5 m de outra edificação de madeira | Exige material informado; não aplicar perfil convencional a madeira silenciosamente |
| Art. 77 | Recuo progressivo por pavimento: RP = K + (N − 4) × 0,30; K=4 na ZH-4 e K=3 nas demais zonas | Crescimento deve acompanhar o pavimento N, e não ser multiplicado pela altura em metros |
| Arts. 78–81 | RM para determinadas geometrias irregulares, com ângulos/percentuais e condições | Não usar uma simples redução uniforme em polígonos irregulares como se fosse a exceção legal |

O glossário da própria LC 166 define térreo como primeiro pavimento. Para o protótipo, contar N=1 no térreo e indicar isso na interface. Subsolos e semissubsolos não estão incluídos nesse perfil simplificado de massa aérea. Ver glossário no final da lei republicada.

## Tabela de recuos do Anexo IV da LC 169/2024

Valores em metros. N = número do pavimento; P3(N) = 3 + 0,30 × (N − 4); P4(N) = 4 + 0,30 × (N − 4). A linha “DE” do quadro corresponde aos demais pavimentos, depois dos patamares descritos.

Fonte de toda a tabela: [DO 681 de 23/12/2024, Anexo IV, PDF p. 4](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4). Quadro conferido visualmente, pois a camada de texto do PDF não permite ler as células com segurança.

| Zona | Frente | Lateral | Fundos |
|---|---:|---|---|
| ZH-1 | 5 | N≤3: 1,50; N=4: 3; N≥5: P3(N) | N≤4: 3; N≥5: P3(N) |
| ZH-2 | 5 | N≤3: 1,50; N=4: 3; N≥5: P3(N) | N≤2: 2; N=3–4: 3; N≥5: P3(N) |
| ZH-3 | 5 | N≤3: 1,50; N=4: 3; N≥5: P3(N) | N≤4: 3; N≥5: P3(N) |
| ZH-4 | 5 | N≤3: 2; N=4: 4; N≥5: P4(N) | N≤4: 3; N≥5: P4(N) |
| ZH-5 | 5 | N≤2: 1,50; N=3–4: 3; N≥5: P3(N) | N≤4: 3; N≥5: P3(N) |
| ZCS-1 | 0 | 0 | 2 |
| ZCS-2 | 0 a 5, conforme preservação patrimonial | N≤4: 0; N≥5: P3(N) | N≤4: 2; N≥5: P3(N) |
| ZCS-3 | 5 | N≤2: 0; N=3–4: 2; N≥5: P3(N) | N≤4: 3; N≥5: P3(N) |
| ZCS-4 | 5 | N≤2: 0; N=3–4: 2; N≥5: P3(N) | N≤2: 2; N=3–4: 3; N≥5: P3(N) |
| ZCS-5 | 10 | 5 | 5 |
| ZCS-6 | 10 | 8 | 8 |
| ZCS-7 | 8 | 4 | 4 |
| ZEPA-1 | Plano de manejo específico | Plano de manejo específico | Plano de manejo específico |
| ZEPA-2 | 10 | N≤3: 1,50; N=4: 3; N≥5: P3(N) | N≤2: 2; N=3–4: 3; N≥5: P3(N) |
| ZEPA-3 | 10 | N≤2: 1,50; N=3–4: 3 | N≤4: 3 |
| ZI-1 | 6 | 3 | 3 |
| ZI-2 | 6 | 3 | 3 |
| ZBD | 10 | 10 | 10 |
| ZDTRL/ZDTRS | Parâmetros vinculados aos respectivos sistemas de tratamento/deposição | Análise específica | Análise específica |
| SEAV | 5 | N≤3: 1,50; N=4: 3; N≥5: P3(N) | N≤2: 2; N=3–4: 3; N≥5: P3(N) |

Observações: ZH-4 fundos progressivos usa K=4, mesmo com base até quarto pavimento de 3 m; não “corrigir” essa diferença do quadro por intuição. ZEPA-3 tem limite de quatro pavimentos no quadro. ZBD tem limite de dois pavimentos. Altura nas áreas patrimoniais e orla depende de outras restrições. Esses limites não são um certificado de permissão de construir.

### Notas que alteram ou condicionam a tabela

Fonte: [mesmo PDF, p. 5, notas A–J](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=5).

- **B — opção H3 em vias locais/coletoras:** até três pavimentos: TO máxima 50%, TAP mínima 5%, frontal 5, lateral 1,50, fundos 2. Até quatro pavimentos ou quatro pavimentos + cobertura-terraço: TO máxima 55%, TAP mínima 5%, frontal 5, lateral 1,50, fundos 3. É uma faculdade condicionada; não habilitar apenas porque o usuário escolheu “apartamentos”. Confirmar H3, via e o perfil de cobertura. Também não tratar a nota como autorização de uso H3 em zonas onde ele é vedado.
- **C — rodovias:** recuo frontal mínimo de 15 m. Para múltiplas frentes, a classificação deve ser por frente; não declarar que uma via local lateral é rodovia por existir outra frente rodoviária.
- **D — colagem lateral:** até 50% no pavimento térreo para os usos, com altura máxima do COE; exceção ZCS-1 a ZCS-4, que seguem o quadro. Colagem parcial não significa recuo zero de toda a lâmina ou de toda a torre.
- **E — colagem nos fundos:** até 60% no térreo para H1, com altura do COE. Não reduzir automaticamente todo o fundo do edifício.
- **F — orla:** observar restrição de altura na faixa de 500 m.
- **H — patrimônio:** parâmetros dependem das definições de IPHAN/IPHAEP na poligonal tombada do Centro Histórico e Sítio Paisagístico de Cabo Branco.
- **I — ZEPA-2/3:** licenciamento ambiental necessário, salvo dispensa por legislação específica.
- **J — ZBD:** lotes regularizados antes da vigência da lei e com área inferior a 2.000 m² têm recuos frontal/lateral/fundos mínimos de 5 m; não ativar a exceção sem comprovar a data/situação do lote.

## Outros direitos e normas

O [Código Civil federal, arts. 1.299–1.301](https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm) preserva regulamentos administrativos e direitos de vizinhança; disciplina janelas, terraços e varandas. Não permite substituir o recuo municipal por um único afastamento de 1,50 m. Distâncias de aberturas, proteção contra incêndio, acessibilidade, iluminação e ventilação não foram integralmente modeladas.

O [Código de Obras disponibilizado pela PMJP](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/03/Lei-Complementar-n.%C2%B0-1.347-1971-Codigo-de-Obras.pdf) é uma compilação histórica com aviso de OCR e regras alteradas. Seu antigo frontal de 4 m não deve sobrepor silenciosamente a LUOS. A [LC 155/2023](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2024/04/Lei-Complementar-no-155.23-Alteracao-COE-exigencia-elevador.pdf) trata, entre outros pontos, da exigência de elevador; não é uma tabela universal de recuos. Não foram inventados afastamentos ABNT ou do Corpo de Bombeiros sem norma específica aplicável ao projeto.

## Aplicação no protótipo

1. Coletar município, zona, uso legal, vias de cada testada, situação da faixa de orla, eventual patrimônio/ZEPA/diretriz viária, número de pavimentos e classificação de cada lado do polígono. Não inferir zona a partir do bairro ou de um ponto isolado.
2. Gerar recuo por lado e por N. “Sem lado de fundo definido” não autoriza chamar o recuo máximo uniforme de regra legal; nesse caso o resultado deve declarar sua aproximação e a pendência.
3. Nas geometrias convexas, intersectar os semiplanos dos offsets por lado. Para concavidade, offset por lado exige algoritmo robusto; se usar recuo uniforme conservador, rotular como aproximação e não como aplicação exata dos arts. 78–81.
4. O 3D deve mostrar perímetro original, faixas não edificáveis, cotas perpendiculares, envelope e massa sem invasão das faixas. Para RP, preferir envelope por pavimento. Uma massa prismática com o maior recuo exigido entre os pavimentos é conservadora e pode ser usada se isso estiver explícito; não apresentá-la como potencial máximo.
5. Não confundir recuo mínimo com distância efetiva da massa: TO/CA podem deixar a massa mais afastada do limite. O rótulo da cota precisa dizer qual distância representa.
6. Guardar fonte, versão, inputs, regras ativadas, ressalvas e valores por pavimento no estudo e no relatório. Mudanças de tipologia/pavimentos devem recalcular; reabrir o estudo deve recuperar o mesmo enquadramento.
7. Não combinar números de recuo documentais com TO/CA fictícios sob o rótulo “resultado legal”. A interface deve explicar que apenas os recuos vêm do pacote documental e que os demais índices permanecem estimados se não forem também implementados.

### Casos numéricos úteis para testes

- ZH-1, perfil padrão, N=1: frente 5, lateral 1,50, fundos 3.
- ZH-2, perfil padrão, N=2: 5 / 1,50 / 2.
- ZH-1 N=4: 5 / 3 / 3; N=5: 5 / 3,30 / 3,30; N=8: 5 / 4,20 / 4,20.
- ZH-4 N=3: 5 / 2 / 3; N=4: 5 / 4 / 3; N=5: 5 / 4,30 / 4,30.
- ZH-5 N=2: 5 / 1,50 / 3; N=3: 5 / 3 / 3.
- Nota B escolhida, H3, via local, até três pavimentos: 5 / 1,50 / 2, com as condições da nota.
- Frente rodoviária em ZH-1: frontal pelo menos 15; segunda frente local continua com seu próprio enquadramento frontal.
- Terreno retangular 20 × 30, frente e fundos opostos: ZH-1 N=1 deixa envelope (20−3) × (30−8) = 374 m²; N=8 deixa (20−8,4) × (30−9,2) = 241,28 m². Essa é área do envelope, antes de TO/CA/produto.
