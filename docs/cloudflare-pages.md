# ViabilEasy completo: Cloudflare Pages + FastAPI no Render

O Pages serve `dist/` e executa a função `functions/api/[[path]].js` para `/api/*`.
O backend FastAPI permanece no Render, conectado ao PostgreSQL e ao provedor de
e-mail. O navegador usa uma única origem para login, estudos, documentos e OAuth.

## Configuração do Pages

Crie um projeto **Pages**, importando o repositório `Viabileasyinvst`:

| Campo | Valor |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build:public` |
| Build output directory | `dist` |
| Root directory | Raiz do repositório |
| `NODE_VERSION` | `24` |
| `API_ORIGIN` (variável de runtime Production) | URL HTTPS real do serviço Render, por exemplo `https://NOME-REAL.onrender.com` |

Não invente o hostname do backend: copie o endereço do serviço criado no Render.
`API_ORIGIN` não tem caminho, query, usuário ou senha. Somente hostnames
`*.onrender.com` são aceitos por esta integração. Não coloque credenciais de banco
ou e-mail no Pages: elas pertencem ao ambiente privado do Render.

As Functions são compiladas pela integração Git ou pelo Wrangler. O upload de
somente `dist/` pela interface de arrastar arquivos não inclui a função da API.
O arquivo `dist/_routes.json` reserva `/api` e `/api/*` para a função; os demais
arquivos continuam estáticos. As Pages Functions consomem a quota correspondente
da Cloudflare; confira os limites da sua conta antes de uso operacional.

## Configuração do backend

Conclua [o primeiro deploy do Render](primeiro-deploy-render.md), incluindo
`DATABASE_URL` com SSL, `BREVO_API_KEY` (ou Resend) e `MAIL_FROM` verificado.
O PostgreSQL pode ser Supabase; nesse caso siga [supabase.md](supabase.md) antes da inicialização.
Depois que o endereço Pages for conhecido, defina **no Render**:

```text
APP_URL=https://SEU-PROJETO.pages.dev
```

Esse valor é a origem pública canônica, sem caminho. Ele substitui a origem
automática do Render e é usado em CSRF, cookies Secure e links de recuperação.
Se usar domínio próprio, substitua pelo domínio e abra o site somente por ele.
O callback Google, se habilitado, deve ser:
`https://SEU-HOST-PUBLICO/api/auth/google/callback`.

Não configure CORS permissivo nem altere os `fetch('/api/...')` do frontend.
A função mantém `Origin`, cookies, corpo e status; devolve redirects OAuth ao
navegador sem segui-los no servidor e transmite PDFs como stream. Respostas da
API recebem `Cache-Control: no-store`. O IP encaminhado vem do header
`CF-Connecting-IP` fornecido pela borda Cloudflare, substituindo cadeias de proxy
do cliente. O backend Render continua atrás do ingress gerenciado.

URLs de preview não são origens canônicas: operações de escrita são recusadas
pelo backend configurado para produção. Para testes com login em preview, use um
backend e banco de homologação separados, com `APP_URL` correspondente. Não
aponte um preview com modificações não revisadas para o banco de produção.

## Verificações antes de declarar a publicação funcional

1. `/api/ready` deve retornar HTTP 200 e `{"status":"ready"}` pelo domínio Pages.
2. Cadastre a conta inicial e atribua `super_admin` pelo CLI, com o PostgreSQL real,
   seguindo o guia do Render. Aprove uma segunda conta e conceda créditos.
3. Confirme login, sessão após recarregar, salvamento/reabertura de estudo,
   upload/download de PDF, perfil e logout pelo domínio público.
4. Solicite e confira a recuperação real de senha; valide que o link usa o domínio
   Pages/canônico. Teste Google real se as credenciais estiverem habilitadas.
5. Reinicie o backend e confirme a persistência; configure backup externo.

Sem `API_ORIGIN` válida ou com falha de rede do backend, a função retorna JSON
HTTP 503 sem expor detalhes internos. Isso evita tratar o HTML estático como
resposta de API, mas não substitui configurar e iniciar o backend.

Teste local do contrato de proxy: `node --test test/pages-proxy.test.mjs`.
Ele cobre JSON, cookies múltiplos, redirects OAuth, PDF binário, erros e headers
de origem/IP. A publicação real exige também os testes acima com os serviços.

Fontes oficiais: [Pages Functions e rotas](https://developers.cloudflare.com/pages/functions/routing/),
[configuração do Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/)
e [variáveis e bindings](https://developers.cloudflare.com/pages/functions/bindings/).
