# Revisão de UI/UX · ViabilEasy

**Data:** 26/10/2026. **Escopo:** site público, autenticação, visão geral, cadastro de terreno, possibilidades e recuos, estúdio 3D, comparação, viabilidade, relatório, biblioteca, fontes, perfil, navegação e diálogos.

A revisão preserva o motor geométrico, os cálculos, as integrações e os fluxos de conta/estudos. A casa continua apresentada completa, sem sequência construtiva.

## 1. Problemas identificados

- Componentes compartilhados com várias redefinições de tamanho, espaçamento e tipografia em arquivos de CSS sucessivos.
- Textos de apoio muito pequenos e cores com contraste insuficiente na página pública. Na amostra inicial de 320 px, a verificação encontrou 36 ocorrências de texto sólido abaixo do contraste de referência.
- Abas do estúdio fora da área visível no celular, dependentes de rolagem horizontal para descobrir outras ferramentas.
- Ausência de acesso compacto aos links da navegação pública no celular.
- Imagem de marca de 1.512.081 bytes, embora apenas um recorte fosse mostrado no cabeçalho.
- Biblioteca MapLibre carregada na visita inicial, mesmo quando o visitante não abre o relevo.
- Grande mudança de layout entre o conteúdo inicial e a montagem da experiência pública.
- Rótulos de senha envolvendo um botão dentro do próprio `label`, com leitura acessível pouco clara.
- Erros de campos dependentes principalmente da mensagem nativa do navegador.
- “Meus terrenos” e “Meus estudos” identificando a mesma biblioteca; contador de fontes fixo em quatro para uma lista com cinco referências.
- Ação de Google apresentada mesmo sem integração disponível.

## 2. Melhorias implementadas

### Estrutura visual e componentes

Foram criados tokens de espaçamento em múltiplos de 4 px, tamanhos de texto, margens fluidas, raios, superfícies, limites de leitura e foco. Uma camada compartilhada normaliza botões, formulários, cards, tabelas, diálogos e metadados das páginas públicas e internas.

O site público usa container de até 1.360 px; o workspace, de até 1.600 px. A hierarquia de títulos e descrições, a organização do hero, os textos da comparação e a apresentação da biblioteca foram ajustados sem mudar a identidade visual.

### Navegação e acessibilidade

- Menu público móvel com expansão identificada, fechamento por Escape e retorno de foco.
- Abas do estúdio em grade de duas linhas no celular, mantendo as quatro ferramentas visíveis.
- Continuidade da navegação por teclado entre abas, menus, campos e diálogos.
- Campos com mensagens próximas ao erro, associação por `aria-describedby` e indicação por `aria-invalid`.
- Rótulos de senha separados dos botões de revelar/ocultar.
- Controles principais com área mínima de 44 px; campos com texto de 16 px.
- Créditos dos mapas com links maiores; leitura de metadados, legendas, recuos e limites documentais ampliada.
- Foco visível nos controles; títulos com foco programático não recebem aparência de botão.
- Preferência de movimento reduzido preservada.

### Experiência 3D

A casa permanece pronta desde o primeiro acesso. A câmera se ajusta à região disponível; os controles não dependem de arrastar o modelo. Foi acrescentado o comando “Girar por toque”, que permite explorar o modelo conscientemente e manter a rolagem da página quando desligado. A renderização continua sob demanda, com resolução e sombras ajustadas para dispositivos menores.

### Desempenho e estabilidade

- Marca otimizada para **117.849 bytes**, redução de aproximadamente **92,2%**. O original foi preservado; o derivado contém o mesmo recorte já mostrado pelo CSS.
- MapLibre passa a carregar somente ao abrir a visualização de relevo, com tratamento de falha e descarte de uma solicitação que perdeu o contexto.
- Preconexão das fontes e remoção do `@import` aninhado no CSS.
- HTML público pré-renderizado pelos mesmos templates/dados usados no navegador. O conteúdo, cards e comparação já possuem sua geometria inicial antes de o JavaScript montar o canvas.
- O comando de inicialização regenera o HTML público; `npm run build:public` está disponível separadamente.

## 3. Componentes e páginas modificados

| Grupo | Arquivos principais |
| --- | --- |
| Tokens e componentes | `dist/design-tokens.css`, `dist/ui-system.css` |
| Menu e mensagens de formulário | `dist/ui-navigation.js`, `dist/auth.js` |
| Documento e marca | `dist/index.html`, `dist/styles.css`, `dist/brand.css`, `dist/assets/viabileasy-logo.png` |
| Workspace e conteúdo | `dist/app.js` |
| Modelo público e toque | `dist/experience3d/ui.js`, `controller.js`, `scene.js` |
| Relevo sob demanda | `dist/map-explorer.js` |
| Geração inicial | `scripts/render-public.mjs`, `package.json` |
| Fixture e evidências | `scripts/ui-audit-preview.mjs`, `scripts/ui-audit-client.js`, `docs/qa/*.json` |

O vocabulário e as regras de manutenção estão em [design-system.md](../design-system.md).

## 4. Redundâncias consolidadas

- Tokens e componentes compartilhados substituem novas correções isoladas por página.
- Biblioteca, breadcrumb e menus usam “Meus estudos”.
- O contador de fontes acompanha `sourceData.length`.
- A descrição da seção de recursos explica seu papel, em vez de repetir a orientação de login já presente no hero.
- Ações indisponíveis de Google deixam de competir com o acesso por e-mail; o perfil informa a indisponibilidade.
- A identificação do modelo não usa mais numeração de uma sequência construtiva removida.
- A especificação técnica da implementação foi retirada do cabeçalho interno; permanece a indicação de protótipo.

## 5. Validação e resultados

### Regressão automatizada

- **50 testes passaram**, sem falhas: contas, privacidade, recuperação, sessão, Google com adaptador de teste, estudos, recentes, geometria, pavimentos, recuos e experiência 3D.
- **144 verificações geométricas e de limites passaram.**
- Verificações de sintaxe dos módulos alterados.
- Regeneração do HTML público a partir dos templates compartilhados.

### Layout no navegador

Foi usada uma fixture de navegador com a mesma aplicação e um banco temporário. Os presets foram **320, 375, 390, 768, 1024, 1280, 1440 e 1920 px**, além de amostras em **2560 e 3840 px** e um menu em **320 × 568 px**.

O navegador incorporado arredonda o preset de 375 para 374 px nessa configuração. Os JSONs preservam tanto `requestedWidth` quanto `width`, sem substituir o valor medido. Os demais presets da matriz corresponderam às larguras esperadas.

| Tela / fluxo | Evidência |
| --- | --- |
| Público e comparação pública | [public-after.json](public-after.json) |
| Login / cadastro | [login-after.json](login-after.json), [register-after.json](register-after.json) |
| Recuperação / confirmação | [recovery-after.json](recovery-after.json), [recovery-confirmation-after.json](recovery-confirmation-after.json) |
| Visão geral / biblioteca | [overview-after.json](overview-after.json), [projects-after.json](projects-after.json) |
| Cadastro / revisão geométrica | [parcel-after.json](parcel-after.json), [review-dialog-after.json](review-dialog-after.json) |
| Possibilidades / recuos | [potential-after.json](potential-after.json) |
| Estúdio / comparação / viabilidade | [studio-after.json](studio-after.json), [comparison-after.json](comparison-after.json), [finance-after.json](finance-after.json) |
| Relatório | [report-after.json](report-after.json) |
| Fontes / perfil / mapa | [sources-after.json](sources-after.json), [profile-after.json](profile-after.json), [map-after.json](map-after.json) |
| 2K / 4K / menu compacto | [workspace-2560.json](workspace-2560.json), [workspace-3840.json](workspace-3840.json), [menu-320x568.json](menu-320x568.json) |

As matrizes finais dos fluxos principais não apresentaram rolagem horizontal da página nem falhas no contraste calculado dos textos HTML com fundo sólido. As tabelas extensas mantêm sua rolagem interna identificada. A barra de abas do estúdio, que antes extrapolava a área visível no celular, passou na nova medição sem esse problema.

Os links de crédito do mapa eram menores que 24 px na primeira medição e foram ampliados depois. Algumas legendas e textos decorativos de 10–11 px também foram ampliados após as medições correspondentes; os JSONs são registros de cada conferência, não uma declaração de certificação final.

### Fluxos exercitados

Menu público e Escape; acesso por e-mail; obrigatoriedade de campos; cadastro e recuperação em tela; confirmação com envio simulado; login/logout; cadastro manual de 12 × 30 m e revisão; abertura de exemplo; salvamento e recuperação de Jardim Oceania; navegação por setas entre abas; comparação e viabilidade; relatório; biblioteca; fontes; perfil com retorno do foco; mapa e abertura do relevo carregado sob demanda.

Nenhum e-mail real foi enviado pelo ambiente de auditoria. Os estudos da instalação principal não foram usados nos testes.

### Métricas locais de carregamento

Uma medição separada, **sem a matriz de redimensionamento**, registrou no público a 390 px:

| Indicador | Antes da pré-renderização | Depois |
| --- | ---: | ---: |
| CLS observado nos primeiros 3 s | 0,831 | 0,000 |
| LCP observado | 64 ms | 80 ms |

Evidências: [public-loading.json](public-loading.json) e [public-loading-after.json](public-loading-after.json). A diferença de LCP entre duas cargas locais não é uma tendência estatística. As observações de desempenho dentro das matrizes de larguras incluem redimensionamentos deliberados e não devem ser usadas como Core Web Vitals de uma visita normal.

## 6. Pendências e oportunidades

- Validar VoiceOver/TalkBack e uso por toque em dispositivos físicos, além da árvore de acessibilidade e dos controles testados no navegador.
- Conferir zoom real do navegador, impressão/PDF e modos de alto contraste em navegadores e sistemas adicionais. A matriz de reflow não substitui esses testes.
- O formulário de redefinição com token válido e a entrega real por SMTP/Google permanecem sujeitos à configuração dos serviços. As regras de tokens/sessões foram cobertas pela suíte automatizada.
- Medir LCP, INP e CLS em rede/dispositivo representativos e, em produção, no percentil 75. As amostras locais e de eventos não equivalem a uma aprovação de Core Web Vitals.
- A verificação automática de contraste não cobre pixels de canvas, texturas, reflexos, gradientes e todos os estados de interação. Esta revisão não é uma certificação WCAG.
- A fixture usa banco temporário; ela foi mantida aberta para a conferência do usuário em `http://127.0.0.1:4181/`. O servidor principal continua em 4173.
- A consolidação integral do CSS histórico pode ser feita em uma etapa posterior, mantendo os tokens e os componentes novos como referência.

## Referências

[W3C — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C — tamanho mínimo de alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) e [web.dev — Core Web Vitals e diferença entre dados locais e de campo](https://web.dev/articles/vitals).

## Conferência visual da área autenticada

[Captura da área interna aberta para o usuário](area-interna.png). A sessão de teste permaneceu autenticada após recarregar a versão final. O ambiente isolado foi mantido em execução para a conferência manual do usuário.
