# Sistema de interface · ViabilEasy

Referência da revisão de 26/10/2026. A identidade permanece em `dist/brand.css`; os valores compartilhados estão em `dist/design-tokens.css` e os componentes, em `dist/ui-system.css`.

## Tokens

| Uso | Padrão |
| --- | --- |
| Espaçamento | 4, 8, 12, 16, 20, 24, 32, 40, 48 e 64 px |
| Texto auxiliar | `--text-xs`, 0,75 rem |
| Texto de interface | `--text-sm`, 0,875 rem |
| Campos e texto principal | `--text-base`, 1 rem |
| Botões e campos | altura mínima de 44 / 48 px |
| Raio de controles / cards / diálogos | 10 / 16 / 24 px |
| Container público | máximo de 1.360 px |
| Container do workspace | máximo de 1.600 px |
| Margens da página | `clamp(16px, 3vw, 48px)` |
| Texto secundário | `#455c55` |
| Foco | contorno de 3 px em `#176c91`, afastado 3 px |

As cores oficiais da marca continuam disponíveis como `--brand-*`. Estados positivos, pendentes e bloqueados mantêm textos e estilos próprios; não dependem somente de cor.

## Componentes e comportamento

- Ações: botões primários e secundários compartilham dimensão, raio, espaçamento e foco. Botões de ícone mantêm nome acessível.
- Formulários: rótulo explícito, campos de 16 px e mensagens junto ao campo inválido. Os erros são associados por `aria-describedby` e `aria-invalid`; as regras de validação originais são mantidas.
- Navegação pública: os mesmos links atendem desktop e celular. O botão móvel controla a expansão; Escape fecha e devolve o foco.
- Navegação interna: menu lateral no desktop, atalhos no celular e painel móvel com contenção de foco. “Meus estudos” é o termo comum entre menu, título e breadcrumb.
- Estúdio: as quatro abas formam duas linhas no celular. As tabelas largas continuam em regiões de rolagem identificadas e acessíveis por teclado.
- Diálogos: altura limitada à janela, rolagem própria, cabeçalho legível e ações que podem quebrar linha.
- 3D público: a casa inicia concluída. Controles de câmera e teclado permanecem disponíveis. “Girar por toque” é uma ação explícita; desativada, a área permite rolar a página.
- Movimento: efeitos e transições respeitam `prefers-reduced-motion`. A renderização 3D permanece sob demanda e é suspensa fora da área ativa.

## Organização e manutenção

1. Alterar tokens compartilhados em `design-tokens.css`.
2. Alterar componentes compartilhados em `ui-system.css`.
3. Manter regras de layouts específicos nos respectivos módulos.
4. Ao editar templates públicos, executar `npm run build:public`. `npm run prototype` já executa essa geração antes de iniciar.
5. Usar `node scripts/ui-audit-preview.mjs` para a fixture local com banco temporário. Ela não usa os estudos da instalação principal.

A camada final mantém compatibilidade com os estilos anteriores. A remoção integral das regras históricas não faz parte desta revisão, para evitar regressões nos três layouts do protótipo.
