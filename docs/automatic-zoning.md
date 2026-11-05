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
98 testes, a suíte Python com 52 testes e as verificações geométricas com 144
casos. Quatro integrações Python exigem PostgreSQL ou ferramentas de migração
e foram puladas. Ruff e `git diff --check` passaram.

Na verificação de navegador desta rodada, o login foi exercitado no backend
Python local com conta sintética descartável. Território usou fixture sintética
ZH2 e `/api/calculate` foi interceptado pelo módulo canônico de cálculo. Foram
conferidos desktop 1440×1000, celular 390×844, carregamento, conflito com exceção
manual preservada, ausência de transbordamento horizontal, acionamento da
reconsulta por teclado e fonte/conflito no HTML do relatório. O console ficou
sem erros. Essa verificação se limita ao ambiente local e à fixture descrita.

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
