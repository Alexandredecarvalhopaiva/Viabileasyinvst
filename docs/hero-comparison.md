# Hero interativa e comparação ilustrativa

A página pública apresenta “Seu terreno. Muito além do óbvio.” em uma composição editorial, com tipografia ampla, destaque em serifa e cena Three.js integrada ao fundo. Acima de 1.024 px, o texto fica à esquerda e o modelo à direita. Os controles ficam sob o modelo e o seletor compacto mostra tipologia, pavimentos, área e unidades; os resultados financeiros permanecem na comparação. Tablet reorganiza os blocos; celular mantém a cena, controles e cards em carrossel horizontal. As cinco alternativas usam o mesmo lote e as cotas do envelope demonstrativo.

O CTA **Analisar meu terreno** usa o acesso existente. **Veja acontecer** inicia uma sequência finita de 18 segundos: terreno (0–3 s), envelope (3–6 s), casa e residencial (6–12 s), comparação e resultado (12–18 s). Qualquer interação manual pausa a sequência. O usuário pode reproduzir ou reiniciar. A cena é carregada sob demanda, pausa fora da tela, limita a resolução e respeita redução de movimento. O modo sem WebGL mantém os cards e a comparação.

## Módulos

- `ui.js` e `hero-layout.css`: composição, controles, cards e adaptação da apresentação.
- `controller.js` e `tour.js`: seleção, sequência, acessibilidade e ciclo de vida.
- `buildings.js`: fachadas, pavimentos e coberturas por tipologia, dentro da implantação e altura declaradas.
- `comparison.js`: cálculo puro e validação de premissas, sem dependência do renderer.
- `comparison-ui.js` e `comparison.css`: gráfico, tabela, destaque e premissas consultáveis.

## Método financeiro

Os preços são inventados para demonstrar a interface. Não são cotações de mercado. Todos os cenários assumem venda integral das unidades, inclusive flats; não há projeção de renda de locação.

- Área vendável = área construída × eficiência.
- VGV = área vendável × preço de venda por m² vendável.
- Obra = área construída × custo por m² construído.
- Custo sem terreno = obra + indiretos sobre obra + comercialização sobre VGV.
- Custo total = custo sem terreno + preço assumido do terreno.
- Residual = VGV − custo sem terreno − margem alvo × VGV.
- Retorno sobre custo = (VGV − custo total) / custo total × 100. Não é uma taxa anual.

O destaque exige método `residual-target-margin-v1`, pelo menos dois cenários completos do mesmo terreno, maior residual sem empate e cobertura do preço assumido do terreno. Faltando essas condições, nenhum vencedor é indicado. O residencial vence o exemplo mesmo com área inferior à do uso misto.

As premissas comuns são terreno de R$ 1,8 milhão, indiretos de 20% sobre obra, comercialização de 5% sobre vendas e margem alvo de 18% sobre vendas. A página mostra os preços por m² e as eficiências de cada alternativa em **Como calculamos**. Cronograma, financiamento, tributos detalhados, outorga e especificidades do terreno ficam fora deste exemplo.

## Integração e verificação

`mountExperience(root, { parcel, scenarios, financialAssumptions })` recebe geometria e um objeto financeiro separado. O formato de `financialAssumptions` está exemplificado em `demoFinancialAssumptions`. `buildComparison` também aceita dados incompletos e retorna problemas por cenário. Nenhum resultado financeiro modifica `legalValidation: false` ou constitui aprovação urbanística.

Execute `npm run test:experience`. Os testes cobrem dados, cotas, cálculos, mudança do vencedor por premissas, ausência de recomendação, sequência de 18 segundos e limites dos modelos. As verificações de interação e responsividade são feitas separadamente no navegador. Não há certificação de Core Web Vitals ou 60 FPS por este conjunto de testes.
