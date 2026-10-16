# URBA — Protótipo de inteligência urbanística

Protótipo navegável criado a partir da **Especificação Técnica Consolidada de Viabilidade Urbanística v3.0**, de 16 de outubro de 2026. O nome URBA e a identidade visual são propostas para esta demonstração.

## Abrir

Abra `URBA-Prototipo.html` diretamente no navegador. Esse arquivo reúne a interface, os estilos e o código. Fontes externas são opcionais; há fontes de sistema como alternativa.

Para servir a versão organizada em arquivos, execute na pasta do projeto:

```sh
npm run prototype
```

Abra o endereço local exibido no terminal. O projeto não exige instalação de dependências. O servidor usa somente módulos nativos do Node.js.

## Explorar

- **Mapa e diagnóstico** — `?variant=A`. Escolha Coordenadas, Matrícula ou Endereço. Localize um exemplo, confirme o perímetro, consulte as premissas e avance para o 3D.
- **Estúdio de volumetria** — `?variant=B`. Controles à esquerda, modelo central e indicadores do cenário. Arraste para girar, use a roda para ampliar e as setas com o canvas em foco para orientar o modelo.
- **Resumo executivo** — `?variant=C`. Visão integrada das camadas legal, geométrica e econômica.

A barra inferior e as setas esquerda/direita fora dos campos alternam os layouts. O estado é compartilhado durante a sessão; o parâmetro do layout permanece no endereço.

No terceiro passo há abas de volumetria, comparação, viabilidade e relatório. O relatório pode ser impresso ou salvo como PDF pela janela de impressão do navegador. O cenário também pode ser exportado em JSON.

O importador recebe um único GeoJSON Polygon, sem furos, em WGS84, com anel fechado no recorte de João Pessoa e até 2 MB. `exemplo-lote.geojson` é um exemplo sintético. A projeção local para área é aproximada e o polígono é centralizado em um mapa esquemático. O desenho manual usa escala fictícia.

## O que funciona nesta demonstração

- Navegação entre início, análise, biblioteca de terrenos e fontes.
- Busca de lotes de exemplo, seleção por marcadores, desenho e importação de perímetro.
- Diagnóstico com status explícito e premissas consultáveis.
- Massa 3D geométrica com rotação, zoom, vista superior, recuos, envelope e norte de referência.
- Atualização de pavimentos, ocupação, área da unidade e uso residencial/misto.
- Comparação de três cenários e sandbox econômico com sensibilidade.
- Relatório com mapa, massa, premissas, pendências e origem da informação.
- Exportação JSON e salvamento temporário na biblioteca da sessão.

## Limites do protótipo

Todos os lotes de exemplo, índices, zonas, custos e preços são demonstrativos. Nenhum artigo foi homologado. O mapa não possui conexão cadastral. As referências externas vieram do documento fornecido e aparecem como pendentes de validação.

Não há autenticação, back-end, banco de dados, persistência entre sessões, consulta GIS oficial, motor jurídico, simulação topográfica, insolação, projeto arquitetônico, dimensionamento de garagem, fluxo mensal, VPL, TIR, outorga ou elegibilidade bancária. O exemplo de orla sinaliza o resultado jurídico como bloqueado e mantém a massa apenas como hipótese ilustrativa.

O cálculo usa o menor limite entre TO, recuos simplificados e CA máximo dividido pelos pavimentos. A área vendável considera unidades inteiras e uma loja ilustrativa quando o uso é misto. Custos diretos usam a área construída total simplificada, explicitada na tela. A simulação econômica não é uma recomendação de compra.

## Conferência realizada

Verificação de sintaxe JavaScript e conferência manual no navegador: navegação, diagnóstico, passagem ao 3D, atualização de controles, comparação de cenários, alteração de preço e recálculo financeiro, composição do relatório, importação de GeoJSON, tratamento do exemplo de orla e apresentação responsiva. Isso não representa homologação técnica, jurídica ou financeira.

O código é experimental e deve ser reimplementado com os controles da especificação antes de uso operacional.


## Responsividade e acessibilidade da versão 0.2

A interface foi revisada para celular, tablet e desktop. A barra de layouts tem uma área reservada, fora da região de rolagem do conteúdo, para não cobrir controles ou foco. Em telas menores, o menu passa a um painel com os nomes das opções e o modelo 3D aparece antes dos controles. Um resumo do lote com acesso direto à análise fica abaixo do mapa. Tabelas extensas mantêm seus dados e recebem uma região de rolagem identificada.

Os textos de interface ganharam tamanho e contraste; os botões HTML principais têm área mínima de 44 × 44 pixels CSS. Os rótulos de seleção ampliam a área clicável das caixas de verificação. Os marcadores do mapa também têm alternativas por busca e pela lista de terrenos.

Há link para pular ao conteúdo, foco visível, contenção de foco no menu e nos diálogos, fechamento por Escape, retorno ao elemento de origem, indicação da página/etapa atual e navegação das abas por setas, Home e End. A alteração dos controles do cenário atualiza seus valores acessíveis e anuncia um resumo textual. A massa 3D possui resultados em texto e botões de giro, zoom e vista superior, além da alternativa por teclado.

No celular, o toque sobre o modelo permite rolar a página por padrão. A rotação por gesto precisa ser ativada e pode ser desativada no próprio painel. A interface também respeita a preferência de reduzir movimento e inclui ajustes para modo de cores forçadas.

### Conferência da revisão

Foram conferidas larguras CSS de 320, 360, 768, 1280 e 1440 pixels, com reflow sem transbordamento horizontal da página nas telas verificadas. A conferência incluiu as três propostas de layout, busca e análise de lote, abas, recálculo financeiro, tabelas, relatório, menu, diálogos e atualização por teclado. Não houve erros JavaScript registrados nas jornadas verificadas.

Uma inspeção de estilos no navegador verificou contraste dos textos HTML e dimensões dos controles; os últimos desvios identificados foram corrigidos. A inspeção não cobre o texto desenhado dentro dos mapas ou do canvas. O comportamento de foco e a exclusão do conteúdo de fundo foram conferidos também pela árvore de acessibilidade do navegador.

Referências usadas: [contraste mínimo na WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) e [tamanho mínimo de alvos na WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Esta revisão não constitui certificação WCAG. A validação completa com VoiceOver, TalkBack e leitores de tela de desktop, em aparelhos reais, permanece necessária antes do uso operacional.


## Localização por coordenadas e matrícula na versão 0.3

A tela inicial oferece três formas de busca: coordenadas geográficas, matrícula e endereço. As melhorias responsivas e de teclado da versão 0.2 foram preservadas.

- **Coordenadas:** latitude e longitude WGS84 em graus decimais, com ponto ou vírgula decimal. É possível colar o par `-7.0816, -34.8368` no campo Latitude; para um par com vírgulas decimais, use `-7,0816; -34,8368`. Há validação de alcance e recorte demonstrativo e sugestão explícita para inverter campos quando os valores parecem trocados. A ordem não é corrigida silenciosamente.
- **Matrícula:** número e cartório formam a chave de busca no conjunto sintético. Exemplos: `12.345` no Cartório A retorna Jardim Oceania; o mesmo número no Cartório B retorna Cabo Branco; `54.321` no Cartório A retorna Bessa. Os nomes dos cartórios e os registros são fictícios.
- **Endereço:** os nomes Jardim Oceania, Bessa e Cabo Branco continuam disponíveis na opção Endereço.

Um resultado de exemplo precisa ser confirmado antes da análise. Um ponto válido sem correspondência é exibido como referência sem área ou perímetro cadastral; ele pode ser aberto no OpenStreetMap por uma ação explícita do usuário. O mapa interno desse estado é apenas esquemático. Nenhuma área, norma ou volumetria é inferida a partir de um ponto isolado. Buscas sem correspondência registral declaram que nenhum cartório foi consultado, sem afirmar que o registro inexiste.

Alterar os dados da busca desabilita o avanço até uma nova confirmação. A origem da identificação é incluída no relatório e no JSON. Importar ou desenhar um novo perímetro inicia uma referência geométrica independente e não cria vínculo automático com uma matrícula pesquisada anteriormente.

### Integrações pendentes

Não há geocodificador, consulta cadastral oficial ou serviço registral conectado. A busca registral real exigirá acesso autorizado a um provedor e uma forma verificável de associar a matrícula à geometria do terreno. A existência de uma matrícula, por si só, não implica que seu perímetro esteja disponível em formato georreferenciado para esta aplicação.

Referências de identificação: [ONR — consulta com cidade, cartório e matrícula](https://www.onr.org.br/conheca-o-passo-a-passo-para-acessar-o-monitor-registral/) e [ONR — estrutura do Código Nacional de Matrícula](https://cnm.onr.org.br/institucional.php). Essas páginas não foram utilizadas como fonte de registros para o protótipo. O CNM é uma possível evolução; não é validado nesta versão.

### Conferência da busca

Conferidos no navegador: coordenadas com vírgula decimal; colagem de um par de coordenadas; detecção e inversão assistida de latitude/longitude; latitude inválida; ponto sem polígono; cartório ausente; matrícula sem correspondência nos exemplos; mesmo número em cartórios diferentes; confirmação do lote; origem da busca no relatório; manutenção da busca por endereço; reflow em 320 pixels e apresentação em desktop. O JavaScript passou pela verificação de sintaxe e não registrou erros nas jornadas verificadas.

## ViabilEasy · potencial construtivo (v0.4)

A entrega principal passa a ser a comparação do potencial de um mesmo terreno para casa, apartamentos, salas comerciais e flats. A imagem conceitual do usuário define a direção do produto e a marca ViabilEasy; seus números não foram usados como índices legais.

Na etapa **Analisar potencial**, quatro cartões mostram pavimentos, área computável e unidades estimadas. Cada botão abre a hipótese no modelo 3D. O seletor de produto reaplica as premissas iniciais; os controles de pavimentos, ocupação e área útil atualizam a simulação. A comparação mantém os quatro produtos e as variações de volume do produto atual. O relatório e o JSON incluem as alternativas iniciais e o cenário selecionado.

Premissas iniciais: casa com 2 pavimentos, TO solicitada de 25%, eficiência de 85% e 250 m² úteis; apartamentos com 6/50%/76%/70 m²; salas com 6/45%/80%/45 m²; flats com 8/40%/72%/30 m². A casa tem uma unidade e sua massa é limitada pela área útil solicitada dividida pela eficiência. As demais tipologias estimam unidades inteiras pela área computável × eficiência ÷ área útil por unidade. A projeção de todas respeita o menor limite do conjunto fictício de TO, recuos e CA. O orçamento simplificado acrescenta 35% da área do lote como área auxiliar apenas nas tipologias coletivas; não há projeto de garagem.

**Nenhuma tipologia representa uso permitido confirmado.** Todos os enquadramentos e índices são fictícios; flats exigem também a definição de enquadramento residencial ou de hospedagem. O lote de orla mantém o bloqueio explícito. A capacidade geométrica não confirma plantas, vagas, acessibilidade arquitetônica ou aprovação urbanística.

Conferência v0.4: consistência numérica das 12 combinações de 3 lotes e 4 produtos, seleção de cada tipologia no navegador, recálculo de área por unidade, comparação e relatório. Layout inspecionado em 320, 768 e 1280 pixels, sem transbordamento horizontal da página; botões de seleção medidos com 46 pixels de altura. Não houve auditoria formal de acessibilidade assistiva.
