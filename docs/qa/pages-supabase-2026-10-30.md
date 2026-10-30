> Atualização: o fluxo padrão passou a usar e-mail e senha, sem Google obrigatório.
> Contas são criadas pelo administrador no Supabase Auth, sem e-mail transacional.
> Os 57 testes JavaScript e 11 testes SQL locais passaram após essa alteração.
> Consulte `docs/cloudflare-pages.md` para a configuração atual. O restante abaixo
> registra a conferência anterior da implementação Google, agora opcional.

# Migração Pages + Supabase — verificação local de 30/10/2026

Implementação adicionada: Pages Functions com Google OAuth via Supabase Auth,
PKCE, cookies HttpOnly/Secure, renovação e revogação de sessão. O PostgreSQL
recebe operações autenticadas pelo JWT da pessoa, sem service-role key no Pages.

A migração cria o schema privado `viabil_private` e duas funções públicas com
grants explícitos. Aprovação, créditos, idempotência, quotas e validações são
executados no banco, inclusive para chamadas diretas ao RPC. Uma tentativa
recusada mantém a contagem de requisições, enquanto sua mutação é revertida.
PDFs e fotos permanecem no PostgreSQL. Fotos têm limite e assinatura de raster;
não há decodificação completa equivalente à validação Pillow do Python.

## Evidências

- 52 testes JavaScript passaram: inclui os 12 cenários do adaptador Supabase e
  os testes anteriores do proxy, geometria, cenários e recuos.
- 11 testes da migração passaram em cluster PostgreSQL 17 local descartável:
  grants privados e anônimos, reaplicação da migração, exigência de identidade
  Google verificada, bloqueio de cadastros pendentes, proibição de autoaprovação,
  administração, créditos idempotentes, duas gravações simultâneas, último crédito,
  privacidade, validação, quotas, identidade geométrica com arredondamento,
  exclusão, PDFs privados/gerais, duplicatas, metadados e limites de requisições.
- 43 testes Python existentes passaram; 4 combinações específicas de outro backend
  foram puladas. Um aviso de depreciação de httpx no TestClient permanece.
- 144 verificações geométricas passaram.
- Worker compilado com Wrangler 4.155.0 e data de compatibilidade 2026-10-30.
- Pré-renderização pública, sintaxe JavaScript, Ruff e `git diff --check` passaram.
- Tela de entrada Google conferida no Chrome em fixture local isolada de interface,
  sem formulário de senha. A fixture não autentica nem usa banco externo.

## Pendências externas

A migração não foi aplicada ao banco Supabase remoto. O provedor Google estava
desativado e sem Client ID/Secret no painel inspecionado. A Data API permanece
desativada; a orientação nova para ativá-la só se aplica depois da migração e da
conferência das permissões. O login Google real, PostgREST remoto, cookies em
HTTPS público e deploy Pages ainda precisam ser exercitados com a configuração
real. O teste SQL usa substitutos mínimos das tabelas Auth, não o serviço Auth
completo. O workflow CI foi atualizado, mas não foi executado remotamente.

Contas e estudos locais não foram migrados, nem vinculados automaticamente por
e-mail. `npm run prototype` continua usando o backend Python e seus dados atuais.
O administrador da instalação Supabase deve ser promovido por SQL privado,
conforme `docs/cloudflare-pages.md`.
