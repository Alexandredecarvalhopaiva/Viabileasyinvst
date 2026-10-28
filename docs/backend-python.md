# Backend Python — ViabilEasy v0.15

## Executar

Requer Python 3.12+ (validado localmente em 3.14.6). Node 24+ é necessário somente para build e testes do frontend. O serviço publicado usa somente Python e os arquivos estáticos versionados em `dist/`.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m backend
```

Em Windows use `.venv\Scripts\python.exe`. No macOS/Linux também funciona `npm run prototype`: o launcher procura `.venv`, depois Python do sistema; `PYTHON_EXECUTABLE` permite selecionar outro executável.

O servidor entrega o frontend e `/api/*` na mesma origem. Use exatamente a origem de `APP_URL`: `localhost` e `127.0.0.1` não compartilham origem/cookies. Desenvolvimento: `http://127.0.0.1:4173`.

## Contrato e módulos

| Módulo | Responsabilidade |
|---|---|
| `config.py` | Configuração e requisitos de produção |
| `db.py` | Schema, migração aditiva e transações SQLite/PostgreSQL |
| `security.py` | Senhas, sessões, autorização, limites e validação compartilhada |
| `accounts.py` | Cadastro, login, recuperação, Google e perfil |
| `studies.py` | Estudos por conta, últimos acessos e consumo atômico de créditos |
| `documents.py` | PDFs, quotas, hashes, escopos e download autenticado |
| `admin.py` | Aprovações, créditos, visão geral e bootstrap local |
| `mail.py` | Brevo/Resend HTTPS, SMTP TLS e caixa local de desenvolvimento |
| `main.py` | HTTP, headers, CSRF, limite de corpo, frontend e saúde |
| `cli.py` | Migração de dados, backup e atribuição de perfis |
| `preview.py` | QA isolado, disponível apenas quando iniciado explicitamente |

Documentação HTTP: `/api/docs`; schema OpenAPI: `/api/openapi.json`. Os objetos JSON de entrada seguem os formatos já enviados por `dist/auth.js`, `dist/admin.js`, `dist/documents.js` e `dist/usage.js`. Os contratos reais são exercitados pelos testes de integração; as entradas JSON compartilhadas aparecem como objetos genéricos no Swagger.

| Rotas | Comportamento |
|---|---|
| `GET /api/auth/session` | Sessão da conta e disponibilidade do Google |
| `POST /api/auth/register` | Cadastro pendente, sem sessão e sem escolha de perfil |
| `POST /api/auth/login`, `/api/auth/logout` | Sessões HttpOnly; logout revoga a sessão |
| `POST /api/auth/forgot-password`, `/api/auth/reset/check`, `/api/auth/reset-password` | Resposta genérica, tokens expirantes e uso único; troca de senha revoga sessões |
| `GET /api/auth/google`, `/api/auth/google/callback` | OAuth com state, PKCE S256, nonce e ID token verificado |
| `PUT /api/profile`, `GET/PUT /api/profile/photo` | Nome e foto da própria conta; imagem decodificada e validada |
| `GET /api/studies`, `GET/PUT/DELETE /api/studies/{id}` | Estudos isolados por proprietário |
| `POST /api/studies/{id}/open` | Registra acesso sem sobrescrever o cenário |
| `GET /api/usage` | Saldo e consumo da própria conta |
| `GET/POST /api/documents`, `GET /api/documents/{id}/file`, `DELETE /api/documents/{id}` | PDFs privados e biblioteca legislativa compartilhada |
| `GET /api/admin/overview` | Contas, pendências, créditos, sessões e estudos; sem segredos |
| `POST /api/admin/users/{id}/review`, `/api/admin/users/{id}/credits` | Exclusivo do superadministrador |
| `GET /api/health`, `/api/ready` | Processo e conexão/esquema do banco |

Todas as alterações em `/api/*` exigem `Origin` igual a `APP_URL` e `X-Viabileasy-Request: 1`. Há limite de corpo também para uploads fragmentados. PDFs têm até 10 MB e quota por conta; imagens de perfil têm até 450 KB após processamento no frontend. Dados do usuário não são incluídos em mensagens internas de erro. Os endpoints novos de exclusão não acrescentam botões de exclusão à interface nesta entrega.

## Contas existentes e SQLite

Sem `DATABASE_URL`, o Python usa o mesmo `.data/accounts.sqlite` do servidor anterior. Campos e tabelas foram preservados. As senhas scrypt usam o mesmo formato `salt:hash`, e os hashes de sessão e de recuperação permanecem compatíveis. A migração aditiva cria colunas ausentes sem apagar estudos. Somente contas anteriores à introdução da aprovação mantêm sua aprovação ao migrar o schema antigo.

Antes de trocar o processo, faça um backup consistente. Não rode Node e Python simultaneamente escrevendo no mesmo banco durante o corte de versão.

```sh
.venv/bin/python -m backend.cli backup backups/antes-do-python.sqlite
.venv/bin/python -m backend.cli init-db
```

O comando de backup usa a API SQLite para incluir WAL, verifica integridade e cria o arquivo com permissão `0600`. Não sobrescreve um backup existente. Guarde uma cópia fora do servidor; `backups/` está no `.gitignore`.

## Primeiro administrador

1. Cadastre uma conta pela interface.
2. No computador do operador, usando as mesmas configurações do servidor:

```sh
.venv/bin/python -m backend.cli set-role pessoa@exemplo.com super_admin
```

3. Entre na aplicação. O primeiro superadministrador pode ser ativado pelo operador local. Depois de existir um administrador ativo, atribuir esse perfil não aprova cadastros pendentes automaticamente.
4. Aprove outros cadastros e libere seus usos na Administração. Contas comuns começam com zero; o administrador usa sem limite.

No Render gratuito, execute o comando no seu computador com `DATABASE_URL` do Neon configurada em um arquivo `.env` privado. O Render gratuito não oferece shell SSH. Não coloque a URL com senha no código nem no comando compartilhado no chat.

## Migrar SQLite para PostgreSQL

Crie um banco vazio no Neon e configure a conexão PostgreSQL em `DATABASE_URL`, incluindo `sslmode=require`. Não a grave no Git. Pause gravações na origem para o corte definitivo.

```sh
.venv/bin/python -m backend.cli migrate-sqlite /caminho/privado/accounts.sqlite
```

A importação trabalha sobre um snapshot, inicializa o schema de destino e importa contas, estudos, PDFs e créditos em uma única transação. Ela recusa um destino que já contenha dados e confere a quantidade de registros. Não modifica a origem. Sessões, resets e estados OAuth não são importados: as pessoas devem entrar novamente após o corte. Não é uma sincronização contínua nem mescla dois bancos já em uso.

## Publicação gratuita preparada

Checklist atualizado, credenciais e sequência do primeiro deploy:
[primeiro-deploy-render.md](primeiro-deploy-render.md).

`render.yaml` descreve **um único serviço Free** Python com frontend e backend na mesma origem. A documentação oficial confirma [FastAPI no Render](https://render.com/docs/deploy-fastapi). O banco é externo: o [filesystem gratuito é efêmero e as portas SMTP usuais são bloqueadas](https://render.com/docs/free).

Passos que exigem suas contas:

1. Criar um projeto Free no Neon. Copiar sua conexão PostgreSQL para o campo privado `DATABASE_URL` do Render. Se usar o pooler do Neon, preserve os parâmetros SSL fornecidos. [Plano gratuito do Neon](https://neon.com/blog/neon-free-plan-1-gb-per-project).
2. Configurar um provedor de e-mail. O Blueprint usa `BREVO_API_KEY` por HTTPS, com `MAIL_FROM` de um remetente verificado. A [documentação do Brevo](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email) descreve a verificação do remetente por código quando o domínio não está autenticado; disponibilidade e entrega dependem da aprovação/configuração da conta do provedor. `RESEND_API_KEY` continua disponível como alternativa: nesse caso substitua a variável Brevo no serviço. Para envio real no Resend, use domínio validado. SMTP TLS também funciona em hospedagens que permitem essas portas.
3. Criar o serviço pelo Blueprint do Render e preencher `DATABASE_URL`, `BREVO_API_KEY` e `MAIL_FROM`. O serviço usa `RENDER_EXTERNAL_URL` automaticamente se `APP_URL` estiver vazio. Se configurar `APP_URL`, use exatamente o endereço HTTPS público.
4. Antes de iniciar, execute `.venv/bin/python -m backend.cli --env-file .env.production check-deploy --check-database` com as configurações de destino no arquivo privado: o comando lista pendências e testa conexão sem alterar o banco nem imprimir segredos. Variáveis do processo têm prioridade sobre o arquivo. O preflight exige `APP_ENV=production`; o serviço usa `HOST=0.0.0.0` e a porta informada pelo provedor. SQLite em produção é recusado para impedir perda acidental de dados no Render. Sem `--check-database`, só a configuração é verificada. No Render, o `.env` local é ignorado e `MAIL_REQUIRE_HTTPS=true` exige uma API de e-mail.
5. Se necessário, cadastrar os valores Google e o URI `https://endereco-publico/api/auth/google/callback` no Google Cloud. Isso é opcional para login por senha.
6. Criar a primeira conta, atribuir `super_admin` pelo CLI local, entrar e conferir cadastro/aprovação, créditos, documentos, estudos e recuperação real de senha.

O Render gratuito pode suspender por inatividade e por limites de uso; não fornece disponibilidade garantida. Não há garantia de gratuidade ilimitada. Nenhuma conta, recurso pago, domínio, credencial ou serviço externo foi criado por esta implementação.

`FORWARDED_ALLOW_IPS` controla quais proxies podem informar o IP real do cliente. O padrão local é `127.0.0.1`. O Blueprint usa `*` exclusivamente para a implantação atrás do ingress gerenciado do Render. Não reutilize esse valor em um servidor diretamente exposto, pois o rate limiting depende do IP confiável.

## Docker e verificação

O Dockerfile executa Python como usuário sem privilégios e recebe segredos por variáveis de ambiente. Usa `dist/` já gerado, sem depender de Node em execução. `.dockerignore` impede envio de `.env`, dados e backups ao build.

```sh
docker build -t viabileasy .
docker run --rm -p 127.0.0.1:4173:4173 --env-file .env viabileasy
```

Para produção, o arquivo privado precisa conter PostgreSQL, HTTPS e e-mail. Se executar o container em desenvolvimento com SQLite, monte um volume para `DATA_DIR` e configure `APP_ENV=development` explicitamente.

Validação:

```sh
.venv/bin/python -m pytest -q
.venv/bin/ruff check backend tests/python
.venv/bin/ruff format --check backend tests/python
npm run test:frontend
npm run verify:geometry
```

Com `PG_TEST_DATABASE_URL` apontando para PostgreSQL local de teste, os cenários são repetidos nos dois bancos. Os schemas de teste são temporários e a suíte recusa um host remoto nesse parâmetro. A execução local foi validada com PostgreSQL 17.10. O workflow `.github/workflows/verify.yml` prepara PostgreSQL 16 para combinar com os clientes pg_dump/pg_restore do runner Ubuntu 24.04 e executa as verificações sem credenciais de produção, incluindo build Linux do Dockerfile e inicialização do container em modo de produção com banco de teste.

`npm run audit:ui` inicia uma fixture Python em `http://127.0.0.1:4181/__audit` com banco temporário. Credenciais exclusivamente sintéticas: `ui-audit@example.test` / `ViabilEasy auditoria 2026!`. Essa conta não existe na instalação normal e as rotas de QA não são montadas pelo servidor de produção.

## Backup PostgreSQL e restauração

Com o cliente PostgreSQL (`pg_dump`) instalado e `DATABASE_URL` configurada:

```sh
.venv/bin/python -m backend.cli backup backups/viabileasy.dump
```

O dump usa formato custom, mantém credenciais em variáveis de processo e não inclui a URL com senha nos argumentos. Faça a restauração em **banco vazio separado**, com `pg_restore`, confirme contagens e teste o login antes de qualquer substituição de produção. A migração para PostgreSQL e backups locais estão implementados; o agendamento e o armazenamento externo de backups dependem da infraestrutura escolhida e ainda precisam ser configurados.
