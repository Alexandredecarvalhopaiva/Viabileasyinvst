# Cloudflare Pages + Supabase: login com e-mail e senha

A versão atual de nuvem usa somente Cloudflare Pages e Supabase. O acesso padrão
é por e-mail e senha. Não requer Google Cloud, Render, Brevo ou Resend.

Para operar sem envio de e-mails, as contas são cadastradas pelo administrador,
que valida a identidade da pessoa e fornece o primeiro acesso por atendimento.
A recuperação de senha também exige atendimento. Não há cadastro público nem
promessa de recuperação automática por e-mail nesta modalidade.

## Arquitetura

- Pages publica `dist/` e executa `functions/api/[[path]].js`.
- `server/pages-supabase.mjs` autentica pelo Supabase Auth, usando o fluxo nativo
  de senha. Tokens ficam em cookies Secure/HttpOnly; senhas não são salvas pelo
  aplicativo, pelo navegador em localStorage ou nas tabelas de estudos.
- O PostgreSQL recebe o JWT do usuário. O schema `viabil_private` não permite
  acesso direto de `anon`/`authenticated`; funções com permissões explícitas
  validam aprovação, papel, propriedade dos dados, créditos e quotas.
- PDFs e fotos continuam no PostgreSQL e contam na franquia de armazenamento.
- A instalação local por `npm run prototype` continua usando Python e SQLite,
  com as contas e estudos anteriores. Os dados não são migrados automaticamente.

## 1. Preparar o banco

Use o projeto dedicado `viabileasy`. Execute no SQL Editor do Supabase:

`supabase/migrations/202610300001_pages.sql`

Se aplicou a versão inicial com Google obrigatório, reaplique este arquivo atual:
ele atualiza as funções sem apagar contas, estudos ou documentos. Não utilize
novamente o SQL antigo `202610300001_pages_google.sql`.

Confira:

```sql
select public.viabil_ready();
select has_function_privilege('anon','public.viabil_api(text,jsonb)','execute');
select has_function_privilege('authenticated','public.viabil_api(text,jsonb)','execute');
```

Os resultados devem ser `{"status":"ready"}`, `false`, `true`.

Esta arquitetura exige Data API ativada **depois** da migração e da revisão das
permissões. Não exponha `viabil_private`. Se houver tabelas antigas em `public`,
confira RLS e revogue acessos anônimos antes de ativar a Data API. A orientação
anterior de mantê-la desativada era específica da arquitetura Python/Render.

## 2. Preparar as contas sem Google e sem e-mail transacional

Em **Authentication → Sign In / Providers**, mantenha **Email** habilitado.
Não é necessário habilitar Google. Mantenha a confirmação de e-mail ativa para
cadastros não administrativos; não a desative como atalho para criar contas.
Se o projeto for exclusivo desta instalação, desabilite o cadastro público para
que contas só possam ser criadas pela administração do Supabase.

Em **Authentication → Users → Add user → Create new user**:

1. Informe o e-mail e a senha inicial da pessoa.
2. Use a opção administrativa de confirmação automática apenas depois de
   conferir a identidade/e-mail dessa pessoa por atendimento.
3. Crie a conta diretamente, sem **Send invitation**, que depende de e-mail.
4. A própria pessoa deve inserir a nova senha nos passos que exigem esse segredo;
   nunca poste senhas no GitHub, em documentação ou neste chat.

A criação de uma conta confirmada no Auth não dá perfil de administrador nem
créditos automaticamente. No primeiro login o aplicativo cria o perfil pendente.

Para redefinir uma senha sem e-mail, valide a identidade e use o fluxo administrativo
de alteração de senha do Supabase. Revogue sessões anteriores conforme os controles
disponíveis no painel antes de orientar a pessoa a entrar novamente. Não compartilhe
credenciais do painel Supabase com usuários da aplicação.

## 3. Configurar Cloudflare Pages

No projeto Pages `viabileasy`, use o ambiente **Production**:

| Variável | Valor |
|---|---|
| `BACKEND` | `supabase` |
| `APP_URL` | `https://viabileasy.pages.dev` (ou o domínio canônico real) |
| `SUPABASE_URL` | `https://vdbxesoqtrdwxndlsxus.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon do projeto Supabase |

A chave fica em **Supabase → Settings → API Keys**. Não use `service_role`,
chave secret, senha do banco ou Client Secret Google no Pages. Não configure
`DATABASE_URL`, `API_ORIGIN`, `BREVO_API_KEY` ou `RESEND_API_KEY` neste modo.
Deixe `GOOGLE_LOGIN_ENABLED` ausente: o acesso Google fica desabilitado por padrão.

Repita o deploy depois de alterar variáveis. Em Supabase → Authentication → URL
Configuration, ajuste Site URL para a origem pública principal. Não autorize
previews de código não revisado a usar o ambiente de produção.

### Envio direto

O pacote `ViabilEasy-publicar.zip`, na pasta MATAVA LTDA, contém `dist/` e o Worker
compilado como `_worker.js` na raiz. Ele não inclui senhas, `.env` nem SQLite.
No painel Pages, faça um novo deployment de produção e envie o pacote atualizado.
A versão anterior do pacote pode ainda conter a tela Google; use o arquivo novo.

O upload pela automação do Chrome depende da permissão de arquivos da extensão.
Se estiver bloqueado, selecione o pacote manualmente no campo **file**. Confirme
o deploy e configure as variáveis acima; apenas enviar o ZIP não configura o banco.
Projetos de envio direto não têm deploy automático pelo GitHub.

### Alternativa com integração Git

Use um projeto Pages separado, pois a modalidade de envio direto não pode ser
convertida em integração Git. Selecione o repositório atualizado `Viabileasyinvst`:

| Campo | Valor |
|---|---|
| Production branch | Branch revisada com estas alterações |
| Framework preset | None |
| Build command | `npm run build:public` |
| Build output directory | `dist` |
| Root directory | Vazio: raiz do repositório |
| `NODE_VERSION` | `24` |

As variáveis de runtime são as mesmas da tabela anterior.

## 4. Primeiro administrador

Crie sua conta de e-mail/senha pelo painel Auth. Entre no site uma vez para gerar
o perfil pendente. Depois, no SQL Editor privado, substitua o e-mail abaixo:

```sql
do $$
declare selected_id uuid;
begin
  select id into strict selected_id from viabil_private.profiles
    where lower(email)=lower('SEU_EMAIL');
  update viabil_private.profiles
    set role='super_admin', account_status='approved', reviewed_by=selected_id,
        reviewed_at=floor(extract(epoch from clock_timestamp())*1000),
        updated_at=floor(extract(epoch from clock_timestamp())*1000)
    where id=selected_id;
end $$;
```

Entre novamente. Aprove os demais perfis na Administração e conceda créditos.
O perfil do Auth e a aprovação do aplicativo são controles distintos.

## 5. Conferência funcional

- `/api/health` identifica `cloudflare-supabase`; `/api/ready` retorna `ready`.
- A tela principal de acesso pede e-mail e senha e não exibe botão Google.
- Senha incorreta recebe mensagem genérica, sem dados do provedor.
- Conta confirmada no Auth entra; conta pendente no aplicativo não usa as ferramentas.
- Após aprovação, a sessão funciona depois de recarregar.
- “Manter conectado” cria cookies persistentes; sem marcar, a sessão é do navegador.
- Salvar/reabrir estudo, alterar perfil, anexar/baixar PDF e sair funcionam.
- Outra conta não recebe os estudos e PDFs privados.
- A recuperação de acesso orienta atendimento; nenhum envio de e-mail é simulado.

## Testes e limites

```sh
node --test test/pages-supabase.test.mjs test/pages-proxy.test.mjs
.venv/bin/python -m pytest -q tests/supabase/test_database.py
npm run test:frontend
npm run verify:geometry
```

O teste SQL usa PostgreSQL local descartável com substitutos mínimos das tabelas
Auth. Não utiliza o banco remoto nem prova que as variáveis e as contas estão
configuradas na instalação publicada. `PG_BIN` pode apontar para os binários
`initdb` e `pg_ctl`; sem eles, os testes SQL são explicitamente pulados.

O backend Python anterior continua disponível; seu login local com senha não
comprova o funcionamento da versão Pages/Supabase. Contas locais não são vinculadas
às novas contas só por terem o mesmo e-mail. Os planos gratuitos têm franquias;
acompanhe uso e backups sem contratar upgrades automaticamente.

Fontes oficiais: [senhas no Supabase](https://supabase.com/docs/guides/auth/passwords),
[criação administrativa de contas](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[variáveis no Pages](https://developers.cloudflare.com/pages/functions/bindings/),
[envio direto com Worker](https://developers.cloudflare.com/pages/get-started/direct-upload/).
