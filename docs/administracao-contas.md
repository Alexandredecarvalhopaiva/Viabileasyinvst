# Cadastro administrado e liberação de acesso

## Preparação da instalação

No Cloudflare Pages com Supabase, aplique as migrações em ordem no ambiente de homologação.

1. `supabase/migrations/202610300001_pages.sql`
2. `supabase/migrations/202611050001_accounts.sql`

Configure `SUPABASE_SECRET_KEY` como segredo criptografado das Pages Functions. Esse valor autoriza a Admin API do Supabase e a função `viabil_accounts`. A chave publishable continua sendo usada com o JWT da pessoa nas operações de estudos, documentos, aprovação e saldo. O segredo administrativo fica exclusivamente no servidor. A API aceita a chave secret atual do provedor e a chave JWT legada `service_role`.

O cadastro permanece fechado também nas configurações do Supabase Auth. `Email` precisa estar habilitado. As contas são criadas pela Admin API com senha aleatória desconhecida do operador e confirmação de e-mail pendente. A pessoa define sua senha pelo link privado. O resgate libera o login por senha no provedor, enquanto `emailVerified` permanece falso no aplicativo. A posse de um link entregue manualmente não comprova controle da caixa de e-mail. A criação e a aprovação preservam essa distinção. O painel mostra o estado de verificação.

Na instalação Python, `REGISTRATION_MODE=admin` é o padrão e usa o mesmo painel. O banco recebe colunas e tabelas adicionais na inicialização. `REGISTRATION_MODE=approval` mantém o cadastro público sujeito à aprovação para instalações que já dependem desse contrato. O modo administrado permite produção sem provedor de e-mail, com recuperação pelo operador.

## Conferir o administrador inicial

No SQL Editor privado do Supabase, confira a conta do responsável e o estado da identidade antes de operar o painel.

```sql
select p.email, p.role, p.account_status, p.disabled_at,
       p.credentials_defined, u.email_confirmed_at
from viabil_private.profiles p
join auth.users u on u.id = p.id
where p.role = 'super_admin';
```

É necessário um perfil `super_admin`, aprovado, com credencial definida e `disabled_at` vazio. A criação inicial continua sob controle do responsável no painel do provedor e no SQL Editor privado, conforme a seção de primeiro administrador em `cloudflare-pages.md`. O formulário da aplicação cria somente usuários comuns.

Na instalação Python, consulte `users` no banco configurado para conferir `role`, `account_status` e `disabled_at`. A atribuição de perfil de uma conta existente é uma operação local do responsável pelo comando `python -m backend.cli set-role EMAIL super_admin`. O comando usa o banco indicado pelo arquivo privado de configuração. Para uma instalação Python nova e vazia, crie a primeira conta em ambiente local controlado com `REGISTRATION_MODE=approval`, atribua o perfil pelo CLI e reinicie com `REGISTRATION_MODE=admin` antes de expor o serviço.

## Operação do painel

1. Entre como superadministrador e abra Administração.
2. Selecione **Cadastrar pessoa**, informe nome e e-mail e confirme. A conta começa pendente, com saldo zero e senha pendente. E-mails são normalizados e duplicidades são recusadas.
3. Copie o link privado exibido no diálogo e entregue à pessoa por um canal privado após conferir sua identidade. O diálogo informa a entrega manual. A operação não envia e-mail.
4. A pessoa abre o link e define sua própria senha. A URL perde o fragmento com o token antes de exibir o formulário. No Supabase, a senha exige pelo menos 12 caracteres e suporta até 72 bytes UTF-8. No Python, o limite é de 128 caracteres.
5. Confira o cadastro na fila e selecione **Aprovar acesso** ou **Recusar**. A senha definida não aprova a conta. A aprovação não concede saldo.
6. Em **Gerenciar usos por usuário**, selecione **Liberar usos** e informe a quantidade e o motivo da liberação. A pessoa aprovada com saldo zero recebe a orientação de solicitar usos ao administrador.
7. A análise de um terreno novo consome um uso quando o estudo é persistido. Reabrir o estudo, reenviar o mesmo salvamento e ajustar o cenário mantêm o consumo anterior. As transações preservam o saldo em falhas e concorrência.
8. Para recuperar o acesso, confirme a identidade e use **Gerar link de acesso** na linha da conta. Informe o motivo e entregue o novo link privadamente. A reemissão invalida o anterior.
9. Use **Bloquear** com um motivo para encerrar sessões e invalidar links de acesso. **Desbloquear** preserva a decisão de aprovação anterior e exige novo login.

Cada link dura 30 minutos e tem uso único. A cópia aparece uma única vez. Se a resposta ou o link for perdido, atualize a lista e gere outro link. A repetição da operação com a mesma chave reconhece a operação anterior e preserva seu resultado. Ela não reapresenta o segredo.

## Falhas e auditoria

Na modalidade Supabase, a definição de senha envolve o banco do aplicativo e a Admin API do provedor. O servidor consome o link e encerra as sessões antes de alterar a senha. A conclusão libera a credencial no aplicativo. Se o provedor falhar ou a conclusão for interrompida, o acesso fica fechado. Uma definição iniciada impede outra reemissão até a expiração daquele link, para serializar alterações de senha. Depois da expiração, o operador pode gerar outro link. Uma conta bloqueada continua bloqueada após uma eventual resposta tardia do provedor.

Se houver interrupção entre a criação no Auth e o perfil do aplicativo, reenviar o cadastro com a mesma chave, nome e e-mail retoma somente a conta criada por aquele administrador e por aquela operação. Outra chave para o mesmo e-mail retorna conflito. Persistindo a falha, o responsável confere a identidade pendente no Auth pelo painel privado antes de repetir o atendimento.

As decisões ficam em `account_events` no Python e em `viabil_private.account_events` no Supabase, com conta, ator, ação, chave, motivo e data. Créditos e débitos continuam nos respectivos livros de saldo, com quantidade e saldo resultante. Os tokens são armazenados como hashes. Senhas são enviadas somente ao serviço de autenticação correspondente e ficam fora de logs e evidências de homologação.

O bloqueio e a recuperação revogam as sessões no banco. O dispatcher SQL verifica a existência da sessão associada ao JWT em cada chamada, incluindo clientes que acessam o RPC diretamente.

## Homologação reproduzível

```sh
npm test
.venv/bin/python -m pytest -q tests/supabase/test_database.py
```

A jornada web usa serviços reais e descartáveis, com PostgreSQL, Supabase Auth/GoTrue, PostgREST e o handler das Pages Functions. O transporte local HTTPS está em `tests/supabase/pages-server.mjs`. Os binários são fornecidos pelo operador e o teste não lê credenciais do projeto hospedado.

```sh
.venv/bin/python -m pip install playwright
.venv/bin/python -m playwright install chromium
GOTRUE_BIN=/caminho/gotrue POSTGREST_BIN=/caminho/postgrest \
PG_BIN=/caminho/postgresql/bin \
.venv/bin/python -m pytest -q tests/supabase/test_accounts_live.py
```

O teste cria contas sintéticas, percorre cadastro, senha, aprovação, concessão, análise, reenvio e bloqueio. Todos os serviços são encerrados no final. Em macOS, o PostgREST pode exigir `DYLD_LIBRARY_PATH` apontando para a biblioteca `libpq` instalada. As suítes Python também exercitam PostgreSQL quando `PG_TEST_DATABASE_URL` aponta para uma instância local descartável.

## Publicação e retorno

1. Obtenha aceite do código e da migração. Registre o deployment atual e faça backup do banco antes da publicação.
2. Aplique as duas migrações em ordem na homologação, configure o segredo do servidor e execute a jornada com contas de teste.
3. Após a confirmação do responsável, aplique a migração no banco de produção e publique o frontend e o Worker da mesma revisão. Valide o administrador inicial, cadastro controlado, uso único do link e um débito de análise em conta autorizada para homologação.
4. Para retorno, restaure o frontend e o Worker do deployment anterior e suspenda novas operações de cadastro. Preserve as tabelas adicionadas e os registros de saldo e auditoria. O dispatcher atualizado continua fazendo valer bloqueios e revogações para clientes anteriores.
5. Uma restauração completa do banco exige janela de manutenção e conciliação de operações posteriores ao backup. O responsável deve decidir o corte antes da execução.

As regras normativas e os dados demonstrativos dos estudos seguem sua trilha própria de homologação.

## Referências do provedor

As operações administrativas de criação e atualização de credenciais pertencem ao servidor. A validação da sessão no banco acompanha a recomendação do provedor para operações que exigem revogação imediata. As chaves secret atuais são enviadas no cabeçalho `apikey`. [Criação administrativa de usuários](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [sessões](https://supabase.com/docs/guides/auth/sessions), [chaves de API](https://supabase.com/docs/guides/getting-started/api-keys).
