# Demonstração pública de possibilidades em 3D

A experiência da página inicial apresenta cinco alternativas no mesmo lote retangular fictício de **30 × 40 m (1.200 m²)**. A seleção substitui a construção anterior; não representa cinco empreendimentos simultâneos. A demonstração pública não lê, altera ou salva os estudos pessoais da conta. A análise de um terreno real continua sujeita ao login existente.

## Dados e unidades

`dist/experience3d/data.js` fornece `demoParcel`, `scenarios` e a fronteira de integração `prepareExperienceData(input)`. Todas as dimensões estão em metros e todas as áreas em metros quadrados. `occupancy` e `permeability` são percentuais de 0 a 100; `coefficient` é uma razão numérica e `efficiency` varia de 0 a 1.

Os dados demonstrativos assumem recuos de 5 m na frente, 3 m de cada lado e 5 m nos fundos, envelope de 27 m e permeabilidade de 20%. São hipóteses visuais, sem aplicação automática do catálogo urbanístico ou autorização de uso, altura ou construção.

| Alternativa | Pavimentos | Implantação | Área construída estimada | Unidades ilustrativas |
| --- | ---: | --- | ---: | ---: |
| Casa | 2 | 18 × 16 m | 576 m² | 1 residência |
| Residencial | 8 | 18 × 22 m | 3.168 m² | 32 apartamentos |
| Comercial | 5 | 22 × 24 m | 2.640 m² | 30 salas |
| Flats | 6 | 20 × 24 m | 2.880 m² | 60 flats |
| Uso misto | 7 | 22 × 23 m | 3.542 m² | 40 unidades |

Área construída estimada = implantação retangular × quantidade de pavimentos. A área computável demonstrativa equivale à área construída. O coeficiente é calculado a partir dessa hipótese e não representa um limite legal. A quantidade de unidades é uma premissa ilustrativa de cada cenário, não um resultado aprovado. A permeabilidade é uma hipótese explícita, não a diferença entre a área do terreno e a ocupação. A viabilidade legal de todos os cenários permanece **“Não avaliada”**. A hero possui uma comparação financeira ilustrativa separada, com premissas e método descritos em [hero-comparison.md](hero-comparison.md).

## Leitura dos recuos no modelo

As cotas de frente, fundos e laterais medem do limite do lote ao envelope ilustrativo, no plano do terreno. Elas não medem a distância até a fachada: uma implantação menor pode ter afastamentos maiores. As etiquetas acompanham a câmera nas vistas isométrica e aérea e podem ser ocultadas pelo botão **Cotas**. O resumo textual permanece disponível, inclusive quando o dispositivo não consegue renderizar o 3D. A orientação das faces é fixa no lote: +Z corresponde à frente, −Z aos fundos e ±X às laterais.

O módulo `setback-dimensions.js` recebe as medidas do terreno, sem valores fixos embutidos; aceita recuos assimétricos, decimais e zero. Os estudos privados mantêm suas próprias cotas por aresta e suas referências urbanísticas.

## Contrato para futura API

`prepareExperienceData({ parcel, scenarios, source? })` recebe dados sem dependência do DOM ou do Three.js. A integração pode usar seu resultado para abastecer os componentes visuais, sem acoplar a API ao renderer.

```js
const data = prepareExperienceData({
  parcel: {
    width: 30, depth: 40, area: 1200, frontage: 30,
    setbacks: { front: 5, side: 3, rear: 5 },
    envelopeHeight: 27, northDegrees: 0, permeability: 20,
    source: { kind: 'api', reference: 'Identificador da análise', verified: true },
  },
  scenarios: [{
    id: 'residential', name: 'Edifício residencial', shortName: 'Residencial',
    description: 'Hipótese recebida da análise.',
    floors: 8, floorHeight: 3.05, footprint: { width: 18, depth: 22 },
    units: 32, unitLabel: 'apartamentos', efficiency: .76, color: '#388d83',
    computableArea: 2800,
  }],
});
```

O adaptador valida valores finitos, dimensões positivas, recuos que deixem área interna, implantação dentro dos recuos, altura dentro do envelope e contagens inteiras de pavimentos/unidades. As dimensões horizontais têm mínimo de 0,1 m para manter a precisão do modelo. Aceita de 1 a 20 cenários, com até 80 pavimentos. As áreas e razões derivadas são recalculadas; um objeto `metrics` recebido não substitui esses cálculos. `computableArea`, quando informado no cenário, deve ficar entre zero e a área construída e permanece no resultado para permitir nova validação sem perda da hipótese. URLs de procedência aceitam apenas HTTP/HTTPS.

O contrato atual suporta lotes retangulares e uma implantação retangular por cenário. Polígonos irregulares e pavimentos com áreas diferentes exigirão ampliar o contrato antes de integrar uma análise real. `source.verified` registra apenas a verificação da procedência. `legalValidation` permanece `false`, e a viabilidade permanece não avaliada: nenhum desses valores autoriza uma construção. A análise legal real exige um contrato próprio e explícito. A comparação financeira ilustrativa já usa um contrato separado em `comparison.js`, sem alterar este resultado legal.

## Verificação dos dados

Execute `node --test test/experience3d.test.mjs`. Os testes verificam a coerência das cinco alternativas, o recálculo de métricas, a preservação da procedência sem inferência de aprovação e a rejeição de dados incoerentes. A validação visual e as interações do renderer são verificações independentes realizadas no navegador.

## Residência contemporânea · apresentação final

A residência passa a ser a alternativa inicial. `house.js` compõe uma casa com espaços internos, dois pavimentos, alvenaria, aberturas reais, garagem, porta de entrada, sala mobiliada, quartos, varanda e cobertura em L. A ala dos quartos avança sobre a entrada, enquanto o terraço fica aberto. As dimensões continuam vinculadas ao cenário: lajes de 18 × 16 m e altura total de 6,40 m. Os terraços participam da estimativa ilustrativa dos pavimentos; essa estimativa não é uma medição regulamentar de área habitável.

A residência é apresentada completa desde o primeiro acesso e ao retornar de outro cenário ou camada. A sequência construtiva, a barra de etapas e o botão “Rever construção” foram removidos da experiência pública. A apresentação automática da casa está desativada. Permanecem os controles de giro, zoom, vista aérea, terreno, envelope e representação técnica. As outras tipologias preservam o recurso de separar pavimentos.

Os materiais físicos usam texturas procedurais locais de madeira e pedra, ambiente de reflexos PMREM gerado localmente, vidro transparente e sombras PCF. Não há download de modelos ou HDR externos. A câmera enquadra a residência pronta e permanece disponível para exploração pelo visitante. O desenho continua sob demanda e é suspenso fora da tela. A resolução das sombras, a densidade de pixels e o ambiente refletivo são reduzidos em dispositivos menores. A preferência de reduzir movimento mantém as etapas acessíveis sem reprodução automática.

Validação: `npm run test:experience` cobre as cinco alternativas, limites dimensionais, reconstrução da residência, visibilidade por etapa e restauração dos materiais após a visão técnica. A conferência visual no navegador é independente dos testes de geometria.

## Flats · Pátio tropical

A alternativa de hospedagem passa a usar `flats.js`, com linguagem de flat boutique: pórticos arredondados, varandas recuadas, guarda-corpos em bronze, detalhes em terracota, paredes em tom areia e marquise de entrada em pedra e madeira. As portas envidraçadas ficam atrás das varandas, com cortinas e elementos de escala. As laterais recebem aberturas em alvenaria e uma faixa vertical de terracota.

Na cobertura, um pátio rebaixado no último pavimento abriga o lounge e um pergolado com altura de uso. A cobertura é recortada nesse trecho; o pergolado não cria outro pavimento nem ultrapassa os 18 m do cenário. O jardim e a lâmina d’água são elementos ilustrativos. Varandas e pátio continuam incluídos nas lajes ilustrativas de 20 × 24 m; a estimativa de 2.880 m² e a hipótese de 60 flats não substituem um projeto de distribuição das unidades.

Portas, barras dos guarda-corpos, frisos e pórticos usam `InstancedMesh` por pavimento e material. A montagem, separação dos pavimentos, vistas aérea/isométrica, transparência e visão técnica mantêm a interface existente. Os testes verificam limites dimensionais, restauração da montagem, materiais e quantidade limitada de objetos de desenho.
