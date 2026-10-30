# Supabase no ViabilEasy

Para a publicação nova com **apenas Supabase e Cloudflare Pages**, siga
[cloudflare-pages.md](cloudflare-pages.md): login com e-mail e senha, Pages Functions e
migração SQL própria. Nesse modo, a Data API é necessária e só deve ser habilitada
após a migração e a revisão de permissões.

## Configuração anterior: Python no Render

As instruções abaixo pertencem à configuração Python/Render, mantida para
instalações existentes. A orientação de desativar Data API abaixo não se aplica
à configuração nova.

O backend FastAPI existente usa SQLAlchemy e psycopg para conectar ao PostgreSQL.
O Supabase pode fornecer esse banco sem trocar o sistema de contas, sessões,
aprovações, estudos, créditos ou PDFs do ViabilEasy. O frontend continua no Pages;
a API permanece no Render. O e-mail transacional continua dependendo do Brevo ou Resend.

## Preparar o projeto

1. Entre em `https://supabase.com/dashboard` e selecione a organização desejada.
2. Use um **projeto dedicado** chamado `viabileasy`, para não interferir em outros
   aplicativos. Confira plano e custos antes de confirmar a criação. Informe a
   senha do banco diretamente no painel e guarde-a de forma privada.
3. Antes de executar `init-db`, migração ou startup do backend, abra a integração
   **Data API** e desative **Enable Data API**. O acesso aos dados será pela API
   FastAPI autenticada. Não publique as tabelas de sessões, senhas ou documentos
   por REST/GraphQL do Supabase. Não altere essas opções em um projeto compartilhado.

O estado de exposição das tabelas varia entre projetos e versões do Supabase.
Este procedimento desativa a Data API explicitamente, sem depender dos grants
padrão. O preflight local não verifica essa opção remota: confira-a no painel.

## Conexão no Render

No projeto Supabase, clique em **Connect**, escolha **Session pooler** e copie a
URI PostgreSQL. Esse modo atende backends persistentes em redes IPv4 e suporta
prepared statements. Use o hostname e usuário fornecidos pelo painel, a porta
**5432** e a senha do banco, com `sslmode=require`:

```text
postgresql://postgres.REFERENCIA:SENHA-CODIFICADA@HOST-DO-SESSION-POOLER:5432/postgres?sslmode=require
```

O exemplo contém placeholders: não o copie como credencial. Caracteres reservados
na senha devem estar codificados para URL. Use a conexão do banco; o endereço
`https://REFERENCIA.supabase.co`, a chave publishable/anon e a service-role key
não substituem `DATABASE_URL`.

Preencha essa URI no campo privado **DATABASE_URL do Render**. Se já tiver
parâmetros de query, acrescente `&sslmode=require`, preservando os demais valores.
A conexão direta costuma exigir IPv6 ou o adicional IPv4; Session pooler evita
essa dependência. O modo **Transaction**, porta 6543, não é o alvo desta configuração
e exige adaptar prepared statements e revisar uso de estado de sessão.

Para conferir localmente, use o arquivo privado `.env.production` com a mesma
configuração de destino e execute:

```sh
.venv/bin/python -m backend.cli --env-file .env.production check-deploy --check-database
```

O comando testa conexão sem criar tabelas. O startup cria/atualiza o schema
automaticamente. Siga [o checklist de publicação](primeiro-deploy-render.md) e
[a integração Pages–Render](cloudflare-pages.md) para o administrador e os testes reais.

Para `pg_dump`/`pg_restore`, planeje uma conexão direta com conectividade compatível,
ou um mecanismo de backup do provedor. Não considere o pooler como substituto
automaticamente validado para backup/restauração. Nenhum backup remoto está agendado
por esta configuração.

Fontes oficiais: [conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres),
[prepared statements](https://supabase.com/kb/troubleshooting/disabling-prepared-statements-qL8lEL)
e [proteção/desativação da Data API](https://supabase.com/docs/guides/api/securing-your-api).
