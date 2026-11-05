As correções do feedback de 03/11/2026 são executadas por `ReportEngine.calculate`,
em `dist/report-engine.js`. A versão é `feedback-demo-1.1`. Este módulo **não é**
a Base_Regras_JP v1.1: o motor e as 302 regras citadas no feedback não foram
fornecidos no repositório ou nos anexos disponíveis.

O relatório, a comparação e a exportação JSON consomem o mesmo contrato
`VIABILEASY_ANALYSIS_V1`. O cálculo no Pages/Supabase é obtido por
`POST /api/calculate`, com `{lot, scenario}`. Exige sessão verificada, conta
aprovada, origem autorizada e `X-Viabileasy-Request: 1`; limite de corpo 150 kB.
O servidor reconstrói a geometria a partir dos vértices e recalcula a área.
Respostas são privadas e não podem ser armazenadas em cache HTTP.

O navegador mantém somente o resultado dos dados correspondentes. Uma resposta
atrasada não substitui o cenário atual. Sem o endpoint, usa a mesma implementação
demonstrativa com identificação explícita de prévia local e opção de reconsulta.
O backend Python existente mantém contas e estudos; não executa JavaScript nem
passa a depender de Node em produção. Nesse backend, o cálculo segue como prévia
local até conectar o motor definitivo. O endpoint de cálculo está implementado
no adaptador Pages/Supabase, que é a implantação descrita para o site atual.

As nove correções cobrem:

1. IA básico 1,0 e máximo por macrozona informada (MAD1 6, MAD2 4, MAD3 2,
   MBD/MPA 1). Sem macrozona, máximo pendente. Excedente ao básico explicita
   OODC e sua regulamentação; não é aplicada a fórmula de projeto de lei.
2. Mínimo H3 arredondado para cima: UH/4 até 30 m² e UH/2 acima de 30 m²;
   exceção ZCS1–ZCS4. Meta comercial 1/UH separada da capacidade de garagem.
   A testada fornece somente uma ilustração de acessos diretos, nunca a garagem.
3. Nota B condicional para H3 em via local/coletora; comparação de 4 pavimentos,
   TO 55%, TAP 5%, laterais 1,50 m, fundos 3 m. Até 3 pavimentos, TO 50% e
   fundos 2 m. Nota C exige frente rodoviária. Conflitos de classificação geram
   pendência. Não há escolha automática de vencedor ou reprodução dos 10 UH/
   10 estacionamentos do projeto VMC Bessa sem suas plantas e motor.
4. Elevador e gerador entram no orçamento acima de 4 pavimentos, sujeitos à
   conferência da base normativa específica. Lâmina abaixo de 5 m não recebe UH;
   esse mínimo é uma premissa de produto, não norma técnica universal.
5. Orla informada como incidente gera revisão especial de altura. Não há
   autorização de altura ou reintrodução automática do art. 62 como regra vigente.
6. TAP ZH1 10%, com nota B 5%; demais ZH seguem o quadro documental do módulo.
7. Núcleo fixo 20/37,4 m² por pavimento substitui eficiência percentual. Varanda
   padrão zero; balanço informado limitado a 0,50 m a partir do 2º pavimento,
   condicionado à aplicação do COE art. 222. UH são estimadas por pavimento.
8. Permissão de uso pendente até conferir Anexo III por zona e classe viária.
   Fora de ZH1–ZH5, o recorte é de identificação, sem estimativa de construção.
9. Fluxo mensal e residual a valor presente: despesas de obra/equipamentos/
   administração distribuídas na obra; receitas, RET, indiretos e lucro alvo
   distribuídos nas vendas; projetos, registro e OODC no mês zero. ITBI 3%
   sobre aquisição, RET 4%, indiretos 10% do VGV e administração 12% da obra
   são hipóteses documentadas do feedback e dependem de enquadramento fiscal.
   Projetos usam o maior entre 3% da obra e o piso informado, ainda uma hipótese
   explícita de orçamento. Cronograma inicial 24 meses de obra e vendas em
   12 meses a partir do mês 12, editável. TMA é informada com data e referência
   Selic; não é capturada automaticamente nem anunciada como taxa atual.
   Preços pedidos e faixa de custo de bairro não são vendidos como dados
   verificados. Orçamentos, piso de projetos, registro, OODC ou TMA ausentes
   impedem apresentar um residual completo; não são substituídos por zero.

Fontes documentais consultadas: [LC 169/2024, quadros e notas dos anexos IV e V](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4),
[LC 164/2024](https://www.joaopessoa.pb.gov.br/wp-content/uploads/2024/10/Lei-Complementar-no-164-2024.pdf),
[LC 171/2025](https://sapl.joaopessoa.pb.leg.br/norma/22012) e
[Banco Central, meta Selic, SGS 432](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom).
As fontes permanecem condicionadas à aplicabilidade, vigência e revisão técnica;
nenhum resultado recebe homologação jurídica por esta mudança.

Validação: testes de regras, orçamento/fluxo, API/autorização, descarte de
respostas atrasadas e persistência de premissas; navegador autenticado local
em 1440×1000 e 390×844; impressão A4 e exportação JSON. A validação do navegador
usa o módulo canônico no interceptador de `/api/calculate`; o endpoint real é
testado separadamente com o provedor de autenticação simulado. Nenhuma conta,
crédito ou estudo de produção é alterado pela verificação.

As correções de concorrência, preservação de condições e orçamento por terreno
e a migração de validação de premissas estão descritas na
[revisão de 05/11/2026](review-2026-11-05.md).
