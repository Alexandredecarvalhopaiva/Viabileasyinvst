# URBA — Protótipo de inteligência urbanística

Protótipo navegável criado a partir da **Especificação Técnica Consolidada de Viabilidade Urbanística v3.0**, de 16 de outubro de 2026. O nome URBA e a identidade visual são propostas para esta demonstração.

## Abrir

A versão atual usa **Node.js 24+**, com contas e estudos privados no servidor.

    npm install
    npm run prototype

Abra http://127.0.0.1:4173 e use **Criar conta**. Para ativar o Google e a entrega de e-mails de redefinição, siga [CONFIGURAR-ACESSO.md](CONFIGURAR-ACESSO.md).

O HTML independente e os arquivos ZIP preservam a demonstração anterior, sem contas. As seções de versões abaixo são o histórico do protótipo; o comportamento atual de acesso e salvamento é descrito na versão 0.13 ao final.

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
- Exportação JSON e estudos persistidos na conta autenticada.

## Limites do protótipo

Todos os lotes de exemplo, índices, zonas, custos e preços são demonstrativos. Nenhum artigo foi homologado. O mapa não possui conexão cadastral. As referências externas vieram do documento fornecido e aparecem como pendentes de validação.

Há autenticação e persistência por conta no servidor Node.js/SQLite. Ainda não há consulta GIS cadastral oficial, motor jurídico homologado, simulação topográfica, insolação, projeto arquitetônico, dimensionamento de garagem, fluxo mensal, VPL, TIR, outorga ou elegibilidade bancária. O exemplo de orla sinaliza o resultado jurídico como bloqueado e mantém a massa apenas como hipótese ilustrativa.

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

## Identidade visual ViabilEasy (v0.5)

Aplicada a paleta do manual enviado: Azul Profundo `#0F2D4A`, Azul Urbano `#1F8EA6`, Verde Viabilidade `#10B981`, Verde Claro `#7EE2B8`, Azul Céu `#8EC5F4`, Roxo Insight `#7C3AED`, Laranja Destaque `#F97316`, Verde Natural `#5A8F3D`, Cinza Escuro `#334155` e Cinza Claro `#E5E7EB`. Tokens e estilos complementares estão em `dist/brand.css`. Cores de texto escuras e fundos suaves derivados mantêm legibilidade; vermelho continua reservado aos bloqueios.

A imagem original do manual está preservada em `dist/assets/viabileasy-manual.png`. A logo é apresentada por uma janela de CSS, sem redesenhar ou alterar seus pixels, no menu, no cabeçalho móvel e no relatório. O favicon é uma versão vetorial simplificada para leitura em tamanho pequeno. Não foi fornecida família tipográfica no manual; mantidas Manrope e DM Sans do protótipo.

Conferência visual em 320 e 1280 pixels, carregamento da imagem, teclado no menu e cartões, passagem da análise para o 3D e relatório. Verificação automatizada de contraste dos textos HTML visíveis sem falhas nas telas de busca, análise, volumetria, relatório e viabilidade; não equivale a auditoria formal de acessibilidade.

## Navegação móvel liquid glass (v0.6)

Até 1024 px, uma barra flutuante oferece Início, Terreno, 3D, Estudos e Menu. O painel Menu apresenta nove funções com ícones e rótulos: buscar terreno, potencial construtivo, volumetria 3D, comparar produtos, viabilidade, relatório, estudos, fontes/legislação e visão geral. A seleção preserva o terreno e as premissas; atalhos de análise mantêm a exigência de perímetro confirmado. A troca de layout do protótipo está no rodapé desse painel. No desktop, permanecem a navegação lateral e a barra de layouts.

`dist/mobile-glass.css` define vidro translúcido com blur, borda iluminada, sombras, cores da marca, área segura do dispositivo e alternativas opacas quando blur não é suportado ou há preferência por menos transparência. O painel é um diálogo com foco inicial, contenção de Tab, Escape, fechamento pelo fundo e retorno ao acionador. Conteúdo e dock ficam inertes enquanto o painel está aberto. Movimentos são reduzidos conforme preferência do sistema; impressão e alto contraste têm regras próprias.

Conferido no navegador: atalhos de 3D, estudos, potencial, comparação, viabilidade, relatório, fontes e início; modal de layouts; ciclo de foco e Escape; bloqueio de 3D com busca alterada; ausência de erros de JavaScript. Em 320 px, os cinco alvos do dock mediram aproximadamente 56 × 59 px, o painel coube em altura com todos os ícones e não houve transbordamento horizontal. Em 1280 px o dock fica oculto e a navegação de desktop permanece visível. Textos do painel passaram pela verificação automatizada de contraste; não representa auditoria formal assistiva.

## Marcação de localização no mapa (v0.7)

Mapa de ruas OpenStreetMap com Leaflet 1.9.4 local em `dist/vendor/leaflet/` (licença BSD incluída). O mapa carrega apenas ao abrir o seletor e depende de internet para as imagens de ruas. Não há consulta a GPS, geocodificação de endereços, cadastro municipal ou registro de imóveis. O pino fica no centro: arraste o mapa, toque no ponto, use zoom ou ajuste pelo teclado e confirme as coordenadas WGS84. Cancelar preserva o estudo anterior. O seletor limita a navegação ao recorte demonstrativo de João Pessoa; não representa a fronteira oficial do município.

A confirmação só é habilitada depois de carregar a imagem do mapa sob o pino e ao terminar o movimento. Falha de carregamento permite tentar novamente ou voltar à entrada manual de coordenadas. O mapa possui atribuição visível, usa a URL padrão HTTPS do OpenStreetMap, não faz pré-carregamento em massa e usa o cache normal do navegador. Referências: [Leaflet](https://leafletjs.com/examples/quick-start/) e [política de imagens do OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

## Entrada simplificada da análise (v0.8)

A entrada padrão deixa de selecionar um lote fictício automaticamente. O caminho principal é: marcar o ponto no mapa → informar área e frente do terreno → ver as quatro alternativas de construção. Coordenadas, matrícula, endereço, importação GeoJSON e desenho permanecem recolhidos em opções avançadas. O botão “Ver análise de exemplo” leva aos quatro produtos com um clique. 3D, comparação e relatório ficam disponíveis para detalhar o estudo após essa primeira leitura.

A simulação rápida solicita **área em m²** e **frente em metros**. Assume formato retangular, terreno plano e profundidade = área ÷ frente. Para essa geometria assumida, o cálculo limita a projeção pela área após os recuos fictícios, pela ocupação e pelo CA máximo de demonstração. Não infere perímetro oficial, zoneamento, restrições ou permissão de uso a partir do ponto. A premissa de retângulo é visível antes de simular, na tela de resultados e no relatório, e consta no JSON. Medidas, preço e custos continuam sendo hipóteses exploratórias. Os exemplos e índices não sustentam decisão técnica real.

Conferência v0.8: fluxo completo no navegador do mapa aos dois campos e aos quatro produtos; validação de campos vazios; reconhecimento de separador de milhar e vírgula decimal; matrícula de exemplo preservada; demonstração em um clique; passagem para 3D; relatório com área, frente, profundidade e premissas. Conferência numérica de 24 combinações de produto e geometria, incluindo medidas manuais e terreno estreito, sem exceder CA ou área após recuos. Seletor móvel medido com 320 × 844 px, confirmação inteiramente visível e sem transbordamento horizontal; o formulário e os resultados também cabem em 320 px. Nenhum erro de JavaScript observado nesses caminhos.

## Vista aérea do entorno (v0.9)

O seletor abre em **Vista aérea**, com a ortofoto municipal de 2021 do Filipeia/SEPLAN/PMJP. É possível ver telhados, edificações e áreas livres, aproximar até zoom 19, mover o mapa e alternar para **Ruas** (OpenStreetMap). As visualizações compartilham o mesmo centro, nível de zoom e pino. O ano da fotografia, a fonte e a escala em metros ficam visíveis. Não são imagens em tempo real, nem identificação automática de terreno, matrícula, perímetro ou permissões urbanísticas.

Integração: Leaflet `TileLayer.WMS`, WMS 1.1.1 em `https://filipeia.joaopessoa.pb.gov.br/geoserver/wms`, camada pública `digeoc:2021_20cm`, JPEG em EPSG:3857. A cobertura declarada em GetCapabilities limita as requisições da camada; quando o ponto está fora dessa cobertura, a interface informa a ausência e oferece **Ver ruas**. A confirmação aguarda carregar a imagem sob o pino. Eventos atrasados de uma camada removida não habilitam a seleção da outra. São solicitadas apenas imagens visíveis, sem exportação ou armazenamento de um acervo aéreo no pacote.

Fontes verificadas em 17/10/2026: [portal Filipeia](https://filipeia.joaopessoa.pb.gov.br/), [SIGWEB municipal e sua lista de camadas](https://filipeia.joaopessoa.pb.gov.br/sigweb/) e GetCapabilities WMS. O aviso do portal permite análises, estudos, documentos e aplicativos com citação **Filipeia/SEPLAN/PMJP** e veda uso comercial/alienação onerosa de seus produtos. Esta integração serve à demonstração privada do protótipo; uma operação comercial precisa de fonte de imagens com licenciamento apropriado. Não foi adicionada dependência de chave/API paga nem usado acesso direto a imagens do Google/Esri. Disponibilidade e cobertura dependem do serviço municipal.

Conferência v0.9 no navegador: fotografias carregadas e telhados visíveis; alternância para ruas e retorno com as mesmas coordenadas; atribuição correspondente à camada ativa; zoom e ajuste por teclado; aviso fora da cobertura e recuperação por ruas; confirmação, reabertura no mesmo ponto e cancelamento sem apagar as medidas; fluxo até as quatro alternativas. Em 320 e 392 px, controles com área mínima de 44 px, sem transbordamento horizontal, e confirmação dentro da tela de 844 px. Nenhum erro JavaScript observado nesses caminhos. A verificação não equivale a auditoria formal de acessibilidade.

## Modos de exploração do mapa (v0.10)

Quatro visualizações no mesmo seletor: **Aérea** (ortofoto Filipeia de 2021), **Ruas** (OpenStreetMap), **Relevo** (ruas com sombreamento da elevação) e **3D** (ruas sobre o relevo regional, com câmera inclinada). As opções têm ícones e estado de seleção acessível. O modo 3D oferece giro em passos de 45°, norte, alternância entre 0° e 55° de inclinação e uma visão do bairro em zoom 14. No desktop é possível ampliar o mapa dentro da janela. No celular o seletor já ocupa a tela.

Leaflet continua responsável pelas vistas aérea e de ruas; MapLibre GL JS 5.10.0, distribuído localmente com licença BSD-3-Clause em `dist/vendor/maplibre/`, renderiza o relevo. Fonte de elevação: [Mapterhorn](https://mapterhorn.com/), tiles Terrarium de 512 px, com zoom nativo limitado a 12 no recorte brasileiro. A documentação do provedor informa cobertura global aproximada de 30 m, adequada a contexto regional, sem precisão de levantamento do lote. Não foram adicionados edifícios 3D, alturas inferidas, levantamento topográfico, Street View, globo terrestre ou fotogrametria urbana. O 3D utiliza ruas porque a ortofoto municipal não oferece CORS necessário para textura WebGL; a fotografia aérea permanece disponível no modo próprio.

Os modos compartilham a localização e o zoom. O ponto geográfico é preservado em trocas de visualização e ajustes de câmera, evitando arredondamentos de pixels ao voltar de 3D para 2D. Arrastar, tocar ou mover pelo teclado altera a seleção. A confirmação aguarda carregar os dados da vista ativa e parar o movimento. Câmera e modo selecionado são incluídos na informação do ponto marcado; a simulação continua com suas premissas demonstrativas. O relevo requer WebGL e internet. Se não puder abrir, é possível continuar com a vista aérea ou de ruas. Dados e renderizador são liberados ao fechar ou trocar a vista 3D.

Fontes técnicas: [MapLibre — 3D Terrain](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/), [Mapterhorn — acesso](https://mapterhorn.com/data-access/) e [atribuições](https://mapterhorn.com/attribution/). O mapa apresenta atribuição a OpenStreetMap e Mapterhorn nas vistas com relevo; os termos da ortofoto municipal descritos em v0.9 continuam aplicáveis à vista aérea.

Conferência v0.10: carregamento dos quatro modos, coordenadas idênticas ao alternar 2D/3D, bairro, giro, norte, inclinação, expansão do desktop e redimensionamento do canvas. Em 320 × 844 px, botões dos modos e da câmera com dimensões mínimas de 44 px, ausência de transbordamento horizontal e botão de confirmação inteiramente visível. Ajuste do ponto pelo teclado no modo 3D; confirmação e fluxo para as quatro alternativas construtivas com área de 600 m² e frente de 20 m. Nenhum erro JavaScript observado na conferência final. Não representa auditoria formal assistiva.

## Cadastro e delimitação de terrenos (v0.11)

O fluxo começa por **frente e profundidade**, com **área e perímetro automáticos**, desenho proporcional e revisão antes de analisar. O exemplo de 12 × 30 m produz 360 m² e perímetro de 84 m. A localização é opcional para explorar a geometria. A ação “Meu terreno possui outro formato” oferece cinco métodos:

- Retangular: frente × profundidade.
- Trapezoidal: frente, fundos e altura perpendicular; fundos centralizados por padrão e deslocamento lateral opcional. Área = (frente + fundos) × altura ÷ 2.
- Irregular: vértices X/Y num mesmo referencial local em metros ou lados com comprimento e azimute desde o norte. É possível adicionar/remover linhas e calcular explicitamente o lado de fechamento. Sem direções suficientes ou sem fechamento, nenhuma área é apresentada. Tolerância de fechamento dos lados: 1 cm.
- Pelo mapa: desenhar sobre imagem aérea ou ruas; adicionar pontos por toque ou pelo centro, arrastar vértices, inserir um ponto após o selecionado, excluir, ajustar coordenadas e fechar. A frente e os fundos são escolhidos na revisão do cadastro. É necessário distinguir o perímetro digitalizado de um cadastro oficial.
- Coordenadas/arquivo: entrada dos vértices em WGS84 (EPSG:4326), SIRGAS 2000 / UTM 25S (EPSG:31985) ou WGS84 / UTM 25S (EPSG:32725). Importação de GeoJSON e KML, um único Polygon fechado sem furos, até 120 vértices e arquivo de até 2 MB. GeoJSON considera WGS84 salvo declaração explícita de CRS suportado; KML considera longitude/latitude WGS84. Altitude é desconsiderada: a área é planimétrica e o cenário continua com terreno plano.

**Geometria:** Proj4js 2.12.1 faz a transformação dos vértices geográficos para SIRGAS 2000 / UTM 25S. Área, distâncias, perímetro e recuos usam metros nessa projeção; não são calculados em graus ou Web Mercator. Polígonos abertos, cruzados, com auto-toque, lados nulos/sobrepostos ou área degenerada são rejeitados. O recorte permanece João Pessoa, de −35 a −34,75 em longitude e de −7,3 a −7 em latitude. O cadastro aceita áreas até 1.000.000 m² e alcance de 20 km. Dimensões aceitam vírgula ou ponto decimal, sem separador de milhar. Valores negativos são permitidos em coordenadas e deslocamento assinado, nunca em comprimentos.

**Representação e referências:** a frente é destacada e cada lado recebe comprimento; o quadro de revisão identifica frente, fundos e demais lados. O cadastro oferece esquema 2D e visualização geográfica. Um formato local centralizado num ponto é explicitamente uma posição/orientação aproximada; não se torna um perímetro medido por estar sobre uma fotografia. Um perímetro importado ou digitalizado mantém suas coordenadas. Vértices internos são normalizados para estabilidade numérica: `geometry.vertices` contém deslocamentos métricos em relação a `geometry.origin`; `metricCoordinates` guarda as coordenadas completas no `crs` declarado. `geographic` preserva os vértices WGS84 quando disponíveis. `coordinateEncoding`, `sourceCrs`, método, frente/fundos e proveniência acompanham os dados.

**Recuos e capacidade:** foi removida a estimativa fixa de 58% do lote para polígonos. Para formatos convexos com frente e fundos definidos, o envelope resulta da interseção geométrica dos afastamentos de cada lado. Os valores continuam **fictícios**: 5 m frente/fundos e 3 m demais lados. Para formatos côncavos ou sem lado único de fundos definido, aplica-se um recuo uniforme conservador de 5 m, indicado antes/no resultado e no relatório. O offset de polígonos côncavos usa Clipper 6.4.2. Se o envelope se dividir, sua maior porção contínua limita a implantação. A ocupação é limitada pela taxa de ocupação e pelo envelope; a projeção do cenário também respeita CA máximo ÷ pavimentos e a hipótese de produto. A interface separa área total, área após recuos, projeção potencialmente ocupável e área construída computável. A massa conceitual usa o polígono e uma projeção recortada dentro do envelope, sem substituir o terreno irregular por uma caixa. Ausência de área após recuos gera zero implantação e aviso, em vez de um volume artificial.

**Localização:** o editor aceita latitude/longitude ou busca de endereço por envio explícito. O serviço público de demonstração [Photon/komoot](https://github.com/komoot/photon) usa dados OpenStreetMap, sem chave; não há autocomplete nem busca em lote, e novas buscas são espaçadas. A busca é restrita ao recorte e resultados repetidos são consolidados. Endereços localizam uma referência, não a matrícula ou os limites do lote. A disponibilidade é de terceiros; coordenadas e navegação manual continuam disponíveis. O campo antigo de endereço abre essa busca quando não encontra um exemplo fictício. As condições e restrições da ortofoto de 2021 descritas em v0.9 continuam aplicáveis.

**Salvamento:** “Salvar estudo” grava geometria, método, referências e cenário em `localStorage` deste navegador. Recarregar e abrir em “Meus terrenos” recupera os dados; as medidas são recomputadas dos vértices na recuperação. Não há conta, servidor de estudos ou sincronização entre dispositivos. O JSON exportado inclui toda a geometria. O relatório traz o desenho, projeção, área, perímetro, testada, método de recuos e pendências. O armazenamento local não é substituto de backup: exporte o JSON para guardar uma cópia.

**Conferência:** 144 verificações numéricas cobrindo retângulo e decimais, trapézio, sentido horário/anti-horário, triângulo, polígono côncavo, autointerseção/toque, fechamento por lados e direções, projeções UTM e limites de TO/CA/implantação em quatro produtos. No navegador: cadastro 12 × 30 m, trapézio 12/20 × 30 m, área pendente em polígono aberto, fechamento por vértices e por direções; desenho no mapa com ajuste/inserção/exclusão; busca real de endereço; KML e GeoJSON UTM; recuperação de estudo após recarregar; relatório e volumetria. Em 320 × 844 px, sem transbordamento horizontal e com confirmação do editor fixa na área visível; controles de edição e entrada por teclado disponíveis. A conferência visual não constitui auditoria formal de acessibilidade. As geometrias são estimativas e não substituem levantamento topográfico. Nenhum pacote normativo foi homologado nem realizada validação cadastral, registral ou técnica de aprovação.

Bibliotecas locais e licenças: `dist/vendor/geometry/proj4.js` (licença em `PROJ4-LICENSE.md`) e `clipper.js` (Boost Software License em `CLIPPER-LICENSE.txt`). Referências: [Proj4js](https://proj4js.org/) e [documentação Clipper](https://sourceforge.net/p/jsclipper/wiki/documentation/).

Para reproduzir a conferência numérica: `node verify-geometry.cjs` ou `npm run verify:geometry`, a partir da pasta do projeto.

## Menu flutuante mobile e tablet (v0.12)

A navegação inferior fica centralizada e afastada das bordas, com cantos arredondados, vidro translúcido, desfoque do conteúdo ao fundo, saturação, reflexos e sombra. Mantém os cinco atalhos com ícones e rótulos: Início, Terreno, 3D, Estudos e Menu. A seleção usa uma cápsula verde da marca. O painel Menu também flutua, com as nove funções principais em duas colunas no celular e três no tablet.

O modo se aplica até 1279 px e também a tablets de toque até 1440 px (ponteiro grosso e sem hover), incluindo orientação horizontal. A consulta de mídia é idêntica no CSS e no controle de foco em JavaScript. A distância inferior inclui a área segura do dispositivo. Há espaço de rolagem no conteúdo, alvos de toque maiores que 44 px, foco visível, fechamento por Escape, retorno do foco ao acionador e bloqueio do conteúdo de fundo quando o painel está aberto. Em telas baixas, o painel rola internamente. São preservadas alternativas para movimento/transparência reduzidos, alto contraste e ausência de suporte ao desfoque.

Conferência no navegador: 320 × 568, 392 × 844, 768 × 1024, 1024 × 768, 1180 × 820 e 1279 × 800 px, sem transbordamento horizontal; dock afastado 16 px da base no celular e 24 px no tablet, antes da área segura. Menor alvo de toque medido: aproximadamente 55 × 60 px. Verificados abertura do painel, navegação para estudos, indicação ativa, ciclo Tab/Shift+Tab, Escape, retorno do foco e rolagem até Ajuda na tela pequena. Ao passar para 1280 × 960 px com ponteiro fino, o painel perde o estado modal e a navegação de desktop reaparece sem bloquear o conteúdo. Sem erros de JavaScript nos caminhos conferidos. A conferência visual não equivale a auditoria formal de acessibilidade ou teste físico em dispositivos.

## Fundo do rodapé mobile (v0.12.1)

Removida a área fixa reservada atrás do menu flutuante no celular e tablet. O conteúdo rolável agora se estende até a base da tela e aparece por trás do liquid glass. A folga necessária ao menu passou para o final do conteúdo e para o scroll-padding do próprio main, preservando a possibilidade de posicionar campos e botões acima da navegação.

Conferência visual em 392 × 844 px: main até a base da tela, faixa fixa ausente e desfoque do dock preservado. Conferidos também 320 × 568 e 1024 × 768 px, sem transbordamento horizontal. Botão de análise visível acima do dock ao receber foco; painel abre e fecha por Escape. Em 1280 × 960 px, a reserva do rodapé de desktop permanece. Sem erros de JavaScript observados.

## Contas, perfil e estudos privados (v0.13)

Cadastro e entrada por e-mail/senha, integração Google OAuth, perfil com edição de nome, envio/remoção de foto e redefinição de senha. As telas incluem confirmação de envio e tratamento de links inválidos, expirados ou já utilizados. O perfil está disponível pelo avatar no cabeçalho e pela conta na navegação.

Os estudos passam a ser persistidos em SQLite e associados à conta autenticada. A biblioteca começa vazia, recupera geometria e cenário após recarregar e mantém os terrenos demonstrativos disponíveis na visão geral.

O Google depende de credenciais OAuth e o envio real de e-mails depende de SMTP. Sem SMTP no desenvolvimento, as mensagens ficam em uma caixa local fora da pasta pública. Não há login Google simulado. Consulte [configuração e operação](CONFIGURAR-ACESSO.md).

Verificação: testes de integração de contas e privacidade, verificação numérica da geometria e conferência no navegador de login, sessão após recarregar, edição do perfil, upload de foto, salvamento/recuperação de terreno e abertura dos links de redefinição. O Google real e a entrega SMTP aguardam as credenciais dos serviços.


### Estudos recentes na tela inicial

A seção “Continue seus estudos” apresenta os seis estudos salvos ou acessados mais recentemente pela conta. Os cartões mostram nome, área, produto, data/hora da última atividade e acesso direto ao cenário salvo em 3D. “Ver todos” abre a biblioteca completa. A ordem persiste após recarregar ou entrar novamente.

Abrir um estudo registra somente a data de acesso; as alterações do cenário continuam dependendo de “Salvar estudo”. Contas novas recebem um estado vazio com atalho para criar a primeira análise. O banco anterior é atualizado automaticamente, preservando os estudos existentes.


## Recuos documentais e representação por pavimento

Depois de confirmar o terreno, use **Recuos para construir**. Informe a zona, situação de orla e cenário de aplicação geral; em “Confrontações”, marque outras frentes e rodovias. A opção de documento permite informar valores e identificar a certidão de referência. “Aplicar recuos” recalcula o terreno e o 3D; “Salvar estudo” persiste o enquadramento e uma cópia das regras aplicadas.

O catálogo inicial cobre as regras gerais de **ZH1 a ZH5 de João Pessoa**, conforme o Anexo IV da LC 169/2024, os arts. 68 e 77 da LC 166/2024 e a nota de frentes rodoviárias. Não há detecção automática de zona por bairro ou coordenada. Orla, regimes especiais, zonas não contempladas e versões documentais diferentes ficam pendentes, sem declarar conformidade. Faculdades de colagem e a alternativa H3 da nota B não são aplicadas automaticamente.

O 3D mostra as faixas de frente, laterais e fundos com cores e cotas no térreo. A massa e o envelope se ajustam por pavimento; a área computável é a soma das lâminas. Cada lâmina fica dentro de seu envelope, limitada ainda pelas hipóteses de TO, CA e produto. Esses outros índices continuam demonstrativos: o resultado não constitui aprovação urbanística.

Em terrenos convexos, o recorte usa afastamentos perpendiculares por lado. Terrenos côncavos e fundos sem identificação recebem aproximação uniforme conservadora, explicitada na tela e no relatório. Não há aplicação automática das exceções dos arts. 78–81, análise de aberturas, geminação, subsolo, múltiplos blocos ou estruturas em madeira.

Fontes, tabelas, ressalvas e situação normativa pesquisada: [base documental](docs/research/recuos-joao-pessoa.md). O estudo salvo e a exportação incluem a versão, os inputs e os valores por pavimento. O relatório também apresenta as fontes e recuos por lado.

Verificação específica: npm run test:setbacks. As verificações anteriores continuam disponíveis em npm run verify:geometry e npm run test:accounts.


### Pavimentos no modelo 3D

A volumetria identifica o térreo e os andares, mostra a contagem total e a altura simulada (premissa de 3 m por pavimento). O controle é uma faixa de simulação, sem equivalência a autorização urbanística.

O quadro “Limite para este terreno” fica a confirmar até que seja informada uma referência documental com número máximo de pavimentos e identificação da fonte. O cenário pode ser ajustado à referência com um botão. Se excedê-la, os pavimentos acima do limite ficam em laranja e o aviso também aparece em texto. Limite documental informado não é homologado pelo protótipo. O sistema não converte automaticamente altura legal em quantidade de andares.

A referência é guardada no estudo por conta e incluída no relatório/JSON. Quando a geometria do terreno muda, precisa ser informada novamente. A análise das fontes de João Pessoa está em `docs/research/pavimentos-joao-pessoa.md`.

Validação: `npm run test:capacity`, `npm run test:setbacks`, `npm run verify:geometry` e `npm run test:accounts` (este último abre um servidor temporário local).


### Site público e ferramentas com login

Visitantes abrem uma página pública com a apresentação dos recursos e o passo a passo de uso. “Começar uma análise”, modelagem 3D, cenários e “Meus estudos” solicitam autenticação. Entrar e criar conta ficam disponíveis no site; a tela de acesso permite voltar à visita sem fazer login.

Após autenticar, o usuário segue para a análise ou biblioteca solicitada. Ao sair, volta ao site público; o estado do terreno, estudos e perfil é limpo da interface. O workspace e suas entradas de teclado, formulários e menus permanecem bloqueados sem sessão. As APIs de estudos e perfil continuam exigindo autenticação no servidor.

Conferência no navegador: visita sem login, convite de acesso nas ferramentas, retorno ao site, login abrindo a biblioteca, análise liberada, sessão após recarregar e saída removendo os dados da conta. A página pública foi verificada também em largura de 373 px, sem transbordamento horizontal. `npm run test:accounts` cobre as recusas de leitura e escrita anônimas.


### Hero pública interativa

A página inicial agora apresenta “Seu terreno. Muito além do óbvio.” com cinco alternativas 3D, cotas do envelope, sequência de 18 segundos, controles de câmera e comparação financeira ilustrativa. No celular, os cenários ficam em um carrossel horizontal. **Analisar meu terreno** mantém o acesso autenticado; **Veja acontecer** inicia a demonstração pública sem criar estudos pessoais.

A comparação informa VGV, custos, residual e retorno sobre custo, com as premissas e o critério de destaque disponíveis em **Como calculamos**. Todos os valores da hero são fictícios. Detalhes: [experiência 3D](docs/experience3d.md) e [comparação da hero](docs/hero-comparison.md). Validação: `npm run test:experience`.

## Interface compartilhada e revisão de UI/UX

Os tokens e componentes da revisão estão em `dist/design-tokens.css` e `dist/ui-system.css`; as convenções estão em [docs/design-system.md](docs/design-system.md). O [relatório da revisão](docs/qa/revisao-ui-ux-2026-10-26.md) registra alterações, testes e limites da validação.

A página pública é pré-renderizada com os mesmos templates usados no navegador para reduzir mudanças de layout. Execute `npm run build:public` após alterar os templates/dados da experiência. `npm run prototype` já executa essa geração antes de iniciar.

Para repetir a auditoria visual em um ambiente isolado: `node scripts/ui-audit-preview.mjs`, abrindo `http://127.0.0.1:4181/__audit`. A fixture usa banco temporário, conta de teste e envio de e-mail simulado; não acessa os estudos do servidor principal. O botão “Medir 8 larguras” coleta reflow, rótulos, alvos e contrastes de texto sólido. Use a medição separada de carregamento para observar o CLS sem incluir redimensionamentos deliberados.
