# Primeiro deploy do ViabilEasy no Render

Revisão de 28/10/2026. O código está preparado para um serviço Python com FastAPI,
frontend e API na mesma origem e PostgreSQL externo. A publicação real ainda depende
das contas e credenciais abaixo. Nenhum recurso externo foi criado nesta revisão.

## O que foi conferido e corrigido

- O `render.yaml` fica na raiz do repositório **Viabileasyinvst**, dentro desta
  pasta `prototipo-urba`. Usa `pip install -r requirements.txt`, `python -m backend`
  e `/api/ready`. Não precisa de Node no serviço: `dist/` está versionado. Após
  alterações nos templates públicos, execute `npm run build:public` antes de publicar.
- O processo respeita `HOST=0.0.0.0` e a `PORT` do Render. O schema é inicializado
  no startup; não é necessário executar migração como build ou pre-deploy command.
- PostgreSQL guarda contas, sessões, estudos, PDFs, fotos e créditos. SQLite é
  recusado em produção, pois o filesystem gratuito do Render é efêmero.
- `APP_ENV` desconhecido agora impede a inicialização. O preflight também exige
  `APP_ENV=production`, evitando aprovar uma configuração que iniciaria em desenvolvimento.
- No Render (`RENDER=true`), o backend ignora o `.env` local automaticamente.
  `APP_URL` explícita tem prioridade; sem ela, usa `RENDER_EXTERNAL_URL`.
- O Blueprint define `MAIL_REQUIRE_HTTPS=true`: SMTP sozinho não passa na
  validação. Brevo ou Resend são necessários no plano Free.
- O CLI aceita um arquivo privado explícito e pode testar a conexão com `SELECT 1`.
  A checagem não inicializa tabelas, não envia e-mail e não revela erros do driver
  nem valores de credenciais. A conexão PostgreSQL usa timeout de 10 segundos.

## O que você precisa fornecer

| Item | Onde obter/configurar | Obrigatório |
|---|---|---|
| Repositório atualizado | Publicar estas alterações no GitHub e autorizar o Render a acessar o repositório | Sim |
| `DATABASE_URL` | Criar PostgreSQL persistente no Supabase ou Neon; copiar URI com usuário, senha, banco e `sslmode=require`. Para Supabase, seguir [supabase.md](supabase.md) antes de inicializar | Sim |
| `BREVO_API_KEY` | Chave da API transacional HTTPS do Brevo, com a conta habilitada para envio | Sim, ou Resend |
| `RESEND_API_KEY` | Alternativa ao Brevo; cadastrar manualmente no Render e deixar `BREVO_API_KEY` vazia/removida | Alternativa |
| `MAIL_FROM` | Nome e e-mail de remetente verificado no provedor, por exemplo `ViabilEasy <acesso@DOMINIO-VERIFICADO>` | Sim |
| URL pública HTTPS | Render fornece `RENDER_EXTERNAL_URL`; para domínio próprio, configurar DNS/TLS e `APP_URL` com a origem exata, sem caminho | Automática ou domínio próprio |
| Conta do primeiro administrador | E-mail e senha escolhidos por você, cadastrados na interface publicada | Sim para liberar o uso |
| `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` | Cliente OAuth Web do Google Cloud, com origem pública e callback `https://SEU-HOST/api/auth/google/callback` | Só para login Google |
| Backup externo | Destino privado, periodicidade, retenção e teste de restauração | Antes do uso com dados importantes |

Brevo tem prioridade quando ambas as chaves estão preenchidas. Não use chave de
SMTP como chave da API. Validar o formato de `MAIL_FROM` não comprova que o provedor
aprovou esse remetente; é necessário testar a entrega real. Google é opcional para
cadastro e login com senha e exige os dois valores juntos.

## Sequência de publicação

1. Crie o PostgreSQL de destino. Se quiser preservar os dados locais, faça backup
   e importe o SQLite **antes de criar contas no destino**; a importação exige um
   banco vazio. Instruções em [backend-python.md](backend-python.md#migrar-sqlite-para-postgresql).
   No Supabase, use um projeto dedicado, desative a Data API antes de criar tabelas
   e copie a conexão **Session pooler** conforme [o guia específico](supabase.md).
2. Publique o código no repositório GitHub e, no Render, crie um **Blueprint** a
   partir dele, usando `render.yaml`. A raiz é a pasta deste repositório; não
   configure `rootDir: prototipo-urba` quando usar o repositório Viabileasyinvst.
   Se publicar a pasta MATAVA inteira em outro repositório, selecione
   `prototipo-urba/render.yaml` e configure o serviço com `rootDir: prototipo-urba`.
3. Preencha os campos privados `DATABASE_URL`, `BREVO_API_KEY` e `MAIL_FROM`.
   Se escolher Resend, substitua Brevo conforme a tabela. Mantenha as variáveis do
   Blueprint, incluindo `APP_ENV=production` e `MAIL_REQUIRE_HTTPS=true`. Não importe
   o `.env` de desenvolvimento inteiro para o Render.
4. Para conferir do seu computador, crie `.env.production` privado, com permissão
   restrita (por exemplo `chmod 600 .env.production`), contendo as mesmas configurações
   e `APP_URL=https://SEU-HOST.onrender.com`. Esse arquivo é ignorado pelo Git.
   Inclua `APP_ENV=production`, `MAIL_REQUIRE_HTTPS=true`, `DATABASE_URL`, a chave de
   e-mail e `MAIL_FROM`. Use:

   ```sh
   .venv/bin/python -m backend.cli --env-file .env.production check-deploy --check-database
   ```

   Variáveis já exportadas no terminal têm prioridade sobre esse arquivo. Confira
   se pertencem ao mesmo destino. Sem `--check-database`, o comando valida apenas
   a configuração. Mesmo com a opção, não verifica permissão de DDL, existência do
   schema, entrega de e-mail ou OAuth; o startup e os testes abaixo completam a validação.
5. Aguarde o deploy e confira `https://SEU-HOST/api/ready` retornando
   `{"status":"ready"}`. `/api/health` só indica que o processo responde.
   Se houver domínio próprio, defina uma origem canônica em `APP_URL` e use-a para
   todos os testes: requisições de escrita de outra origem são recusadas.
6. Cadastre sua conta na interface. Ela ficará pendente. No seu computador, com o
   mesmo PostgreSQL da publicação, execute:

   ```sh
   .venv/bin/python -m backend.cli --env-file .env.production set-role SEU_EMAIL super_admin
   ```

   O primeiro administrador pendente é aprovado por esse comando. Cadastros
   posteriores precisam ser aprovados na Administração; usuários comuns começam
   com zero créditos. O Render Free não oferece shell, por isso o comando é local.
7. Entre como administrador, aprove uma segunda conta e atribua créditos. Nessa
   conta, salve/reabra um estudo, envie/baixe um PDF e confira o perfil. Reinicie o
   serviço e confirme a persistência. Solicite recuperação de senha para uma conta
   conhecida e confirme recebimento, URL HTTPS, troca de senha e invalidação do link.
   A resposta genérica da API não comprova entrega de e-mail.
8. Se habilitar Google, registre o callback exato no Google Cloud e teste o fluxo
   real. Configure backup externo e restauração antes de uso operacional.

## Evidência local e limites

A suíte de integração foi executada com SQLite e PostgreSQL 17 temporário,
incluindo migração, login com senha preservada, backup/restauração, isolamento de
contas, créditos e modo de produção com cookies Secure. Os novos testes cobrem
isolamento do `.env`, política de e-mail, ambiente de produção e preflight sem DDL.
Também foram conferidos frontend, geometria, lint e pré-renderização pública.
Resultado: 70 testes Python passaram e 5 foram pulados por serem específicos do
outro backend; 35 testes do frontend e 144 verificações geométricas passaram.
Há um aviso de depreciação de `httpx` no TestClient, sem falha na suíte.

O comando real `python -m backend` foi exercitado localmente em produção, com
PostgreSQL e configuração equivalente à do Render, sem envio de mensagens.
Isso não comprova acesso ao banco externo a partir do Render, entrega dos provedores,
OAuth real ou disponibilidade pública. Esses testes dependem das suas credenciais.

O plano Free pode suspender por inatividade e não oferece disponibilidade garantida.
O PostgreSQL Free do próprio Render expira após 30 dias; escolha conscientemente o
banco persistente e mantenha backup fora do serviço. Não guarde dados duráveis no
filesystem do web service.

Referências oficiais conferidas: [Blueprint](https://render.com/docs/blueprint-spec),
[variáveis automáticas](https://render.com/docs/environment-variables),
[versões Python](https://render.com/docs/python-version),
[restrições do Free](https://render.com/docs/free) e
[monorepos](https://render.com/docs/monorepo-support).
