# Consulta automática de zoneamento

Ao confirmar um terreno novo, a aplicação consulta `/api/territory`. Pages Functions e o backend Python atendem ao mesmo contrato, sem exigir configuração adicional de chaves. O adaptador consulta somente a camada pública `digeoc:zoneamento2024` do GeoServer Filipeia, em recorte pequeno, com timeout, limite de 50 feições e 4 MB. Não encaminha cookies ou credenciais ao provedor. Respostas truncadas, inválidas ou indisponíveis não geram zona presumida.

O navegador intersecta o perímetro geográfico inteiro com as feições recebidas usando Clipper. Cobertura parcial, mais de uma zona ou contato numérico com a borda resultam em pendência. Um ponto sem perímetro apenas sugere zona; não confirma o lote. Medidas locais sem localização não disparam consulta.

Para ZH1–ZH5, a zona identificada vem selecionada no enquadramento. O quadro mostra ocupação, permeabilidade e recuos documentais; a ocupação da simulação recebe o valor geral na primeira consulta. Uma atualização explícita não apaga a ocupação que a pessoa ajustou. Orla, regime especial e demais permissões não são inferidos. O formulário de exceções fica recolhido, disponível para condições que ainda precisem de confirmação.

Fonte dos percentuais gerais: [LC 169/2024, Anexo IV, p. 4](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4), conferida visualmente em 03/11/2026. TO/TAP: ZH1 50/10%, ZH2 55/5%, ZH3 50/5%, ZH4 e ZH5 50/15%. As alternativas das notas não são ativadas automaticamente. A camada espacial não comprova a consolidação normativa. CA, altura, usos e restrições adicionais continuam sem homologação automática; os parâmetros demonstrativos preexistentes do simulador continuam identificados como tal.

A consulta fica registrada no terreno/JSON e no relatório: camada, origem, data e referência do quadro. Estudos salvos conservam o snapshot até atualização explícita. Mudar coordenadas, geometria ou testadas invalida o enquadramento anterior, mesmo com dimensões iguais. Respostas atrasadas não alteram outro terreno. Exceções técnicas e condições já confirmadas pelo usuário não são sobrescritas. Se a zona consultada divergir do enquadramento confirmado, a tela e o relatório mostram o conflito; a condição informada é preservada até revisão. Nenhuma camada completa é incorporada ao repositório.

O aviso de uso do [Filipeia](https://filipeia.joaopessoa.pb.gov.br/) contém condições de utilização e atribuição; compatibilidade com exploração comercial continua dependendo de esclarecimento/autorização do operador. Esta mudança entrega integração técnica, sem certificar conformidade urbanística ou licença de redistribuição comercial.

Validação: `npm test`; testes específicos em `test/urban-lookup*.test.cjs`, `test/territory.test.mjs` e `tests/python/test_territory.py`. A jornada de navegador também foi exercitada com conta sintética no backend local, importação de GeoJSON, consulta real ao Filipeia, pré-seleção ZH2, salvamento e relatório em desktop/celular.

## Continuidade da CPTECH-3 em 05/11/2026

A implementação do PR #1 foi reutilizada em branch isolada. Quatro regressões
foram reproduzidas antes da correção em `test/urban-lookup-ui.test.cjs`.

- A primeira consulta apagava exceções manuais de estudos antigos que conservavam
  `origin=territory`. A aplicação passa pelo mesmo método de preservação usado
  na resposta, mantendo o documento e indicando divergências de zona.
- Um erro recebido durante edição aplicava um estado de falha ao contexto
  confirmado. A proteção de edição agora cobre sucesso e erro.
- Respostas descartadas deixavam o snapshot em carregamento. Ao descartar uma
  resposta, o snapshot anterior da mesma identidade é restaurado. Sem snapshot
  anterior, uma consulta posterior pode tentar novamente.
- O preenchimento inicial substituía a ocupação ajustada durante a requisição.
  A ocupação solicitada é conservada quando mudou ou quando há contexto técnico
  preservado. O limite documental continua registrado separadamente.

Os testes usam respostas territoriais sintéticas. A suíte frontend passou com
102 testes, a suíte Python com 52 testes e as verificações geométricas com 144
casos. Quatro integrações Python exigem PostgreSQL ou ferramentas de migração
e foram puladas. Ruff e `git diff --check` passaram.

Na verificação de navegador desta rodada, o login foi exercitado no backend
Python local com conta sintética descartável. Território usou fixture sintética
ZH2 e `/api/calculate` foi interceptado pelo módulo canônico de cálculo. Foram
conferidos desktop 1440×1000, celulares 390×844 e 320×844, carregamento, conflito com exceção
manual preservada, ausência de transbordamento horizontal, acionamento da
reconsulta por teclado e fonte/conflito no HTML do relatório. O console ficou
sem erros. Essa verificação se limita ao ambiente local e à fixture descrita.

As consultas de Produto e UX na issue orientaram ajustes adicionais. O ponto
mostra apenas a zona sugerida na tela e no relatório. Coordenadas conhecidas
fora do recorte recebem estado próprio de falta de cobertura. O conflito mostra
as duas zonas e abre o campo de revisão. Durante a confirmação, a etapa atual
mostra o andamento e desabilita o envio duplicado. As referências de ocupação
recebem indicação de aplicação e vigência pendentes.

A fonte de ocupação é copiada para o snapshot, e seus links e títulos são lidos
desse registro pela tela e pelo relatório. Um teste modifica o catálogo corrente
e comprova a preservação da origem registrada. O teste de link aceita somente
HTTP e HTTPS. A reprodução integral com todas as fontes versionadas, uso e data
continua condicionada ao contrato normativo descrito abaixo.

### Aceite ainda pendente

AUT-01, AUT-02, AUT-04 e AUT-07 dependem da base normativa revisada, de vigência,
licença e cobertura territorial comprovadas. A Base_Regras_JP de 302 regras
continua ausente dos arquivos versionados inspecionados. O motor existente
permanece demonstrativo e registra `validatedRuleCount=0`.

AUT-05 tem cobertura sintética para multizona, borda, ausência de cobertura e
polígono coberto. A validação profissional com fontes homologadas continua
pendente. AUT-06 cobre posição, geometria, testadas e respostas atrasadas.
Seleção de data normativa e versões de fontes por estudo requer contrato com
Backend e Mika. A chave espacial atual não representa esse contrato completo.
AUT-08 preserva exceções, mas ainda precisa do registro completo de autoria e
versão do ajuste. AUT-03 e AUT-09 continuam sujeitos à revisão de produto e UX.

A próxima dependência é disponibilizar o pacote revisado com matriz de fontes,
vigência, licença e casos profissionais, e combinar seu contrato de resolução
com Backend e Mika. Esta rodada entrega correções revisáveis de preservação do
contexto e concorrência. A conclusão da automação normativa permanece pendente.

## Proteção normativa e auditoria em 06/11/2026

O caso de revisão da Mika foi reproduzido em
`test/normative-analysis.test.mjs`. Um lote real ZH1 de 20 × 30 m recebia
1.120 m² e 32 unidades sem regras essenciais. Agora o resultado canônico usa
`calculationStatus=pending_rules`, mantém 600 m² de área e 100 m de perímetro
e retorna `null` para unidades, áreas construtivas, envelopes, altura, índices
aplicáveis e valores derivados. Cenários, volumetria, fallback local, API,
JSON e relatório apresentam a pendência. A camada de apresentação conserva as
hipóteses informadas para uma futura revisão.

O motor mantém estimativas demonstrativas para os três exemplos cadastrados,
conferindo identificador, medidas, posição e geometria. `custom`, sinalizadores
de homologação e snapshots enviados pelo cliente não habilitam cálculo normativo.
Os testes geométricos e do antigo cálculo demonstrativo usam uma opção interna
de fixture, que a API pública não lê do payload. `validatedRuleCount` continua
zero e `legalValidation` permanece falso.

`NormativeContext` centraliza município de escopo, geometria posicionada,
testadas, finalidade, pavimentos, regime, data normativa, versões/hashes e
fontes territoriais observadas. `scenario.analysisDate` e
`scenario.sourceVersions` são persistidos nos dois backends. O snapshot
`VIABILEASY_NORMATIVE_V1` contém identidade canônica, entradas, estados e fontes
por campo. Mudanças dependentes geram outra identidade e descartam respostas
anteriores. Fontes e valores sintéticos ficam identificados no snapshot e
continuam sujeitos ao bloqueio dos resultados de terreno real.

A consulta espacial usa identidade própria, independente do catálogo normativo.
Estudos antigos com `catalog` na chave espacial continuam legíveis. Abrir um
estudo v1 após disponibilizar v2 conserva a origem e os valores registrados até
atualização explícita. As referências documentais de ocupação e recuos são
copiadas para a consulta salva. Data, finalidade e atualização de versões têm
controles próprios; versões ou hashes ausentes aparecem como pendências.

Exceções de recuos recebem valor original, referência, justificativa, conta
responsável, data e versões encadeadas. O estado permanece `pending_review`.
Uma exceção antiga sem auditoria recebe um registro `legacy_unverified`, sem
autoria inventada. Python e Worker validam o responsável contra a sessão.
A migração `202611050002_normative_context.sql` acrescenta a mesma proteção
ao acesso direto por RPC, valida data e versões e rejeita alterações concorrentes
que substituiriam histórico ou valor original. Repetir a mesma gravação conserva
a versão. Mudança de geometria invalida o enquadramento correspondente.

A migração foi executada somente no PostgreSQL local descartável. Backend e Mika
precisam revisar e aplicar a migração no ambiente hospedado para ativar a proteção
da RPC. Aprovar uma exceção técnica exige um fluxo servidor com autorização
específica, ainda fora da proposta pendente implementada aqui.

A revisão de persistência também cobre a omissão completa da auditoria. Novos
recuos manuais e alterações de referências ou de terreno exigem o registro da
proposta no Python e na RPC. Estudos legados com recuos manuais sem autoria
continuam salváveis enquanto conservarem o enquadramento e o terreno anteriores.
Os dois testes de regressão falharam antes da correção e passaram depois. A
revalidação aprovou 55 testes Python e 14 testes da RPC em PostgreSQL descartável,
com quatro integrações Python opcionais puladas, Ruff e whitespace aprovados.

O painel também distingue área desconhecida de área calculada igual a zero.
O aviso de recuos que eliminam a implantação exige um valor numérico conhecido.

Foram aprovados 111 testes frontend, 54 testes Python, 13 testes da RPC/migrações
em PostgreSQL descartável e 144 verificações geométricas. Quatro integrações
opcionais Python continuam puladas por exigir configuração específica de migração
ou modo de produção. Ruff, `git diff --check` e compilação do Worker Pages passaram. O navegador local foi
verificado em 1440×1000, 390×844 e 320×844 com conta sintética, salvamento real
no backend Python, proposta auditada, reabertura de v1, JSON e PDF. O cálculo
foi interceptado pelo módulo canônico e por uma resposta antiga simulada, que
foi rejeitada em favor do fallback protegido. O console ficou sem erros.

O pacote normativo revisado, suas camadas, licença, vigência e casos profissionais
continuam necessários para liberar preenchimento real e concluir AC-15. Os testes
sintéticos comprovam o contrato e as proteções de software descritos nesta seção.
