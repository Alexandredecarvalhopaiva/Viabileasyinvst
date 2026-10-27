# Pendências para publicar o ViabilEasy — 27/10/2026

> Este documento registra a inspeção anterior aos ajustes. A execução posterior está em [ajustes-publicacao-2026-10-27.md](ajustes-publicacao-2026-10-27.md). O Blueprint agora usa BREVO_API_KEY como primeira opção; Resend permanece compatível.

## Verificação realizada

- O servidor local respondeu `/api/health` com backend `python`, versão `0.15.0`, e `/api/ready` com `ready`.
- O repositório remoto `Alexandredecarvalhopaiva/Viabileasyinvst`, branch `main`, ainda contém `serve.mjs` e `server/` da versão Node. Não contém `backend/`, `requirements.txt`, `render.yaml` ou o workflow Python. A consulta ao GitHub não retornou execuções de Actions.
- Esses arquivos Python/infraestrutura estão locais e ainda não foram adicionados a um commit. Há também alterações e exclusões de arquivos versionados da migração.
- As dependências de runtime foram resolvidas e seus wheels baixados para Linux x86_64/Python 3.14, respeitando `requirements.lock`. Isso confirma disponibilidade de instalação, mas não substitui a execução no ambiente Linux do provedor.
- Sem expor valores privados, a configuração local foi conferida: desenvolvimento, URL HTTP local, sem `DATABASE_URL` PostgreSQL, sem chave Resend, sem SMTP e sem remetente real. Google também está desabilitado, mas é opcional.
- A validação de produção com essa configuração recusa a inicialização, começando pela exigência de HTTPS. PostgreSQL e e-mail também são obrigatórios no código.
- O daemon Docker não estava disponível. O deploy Python nativo do `render.yaml` não depende de Docker local.

## Ordem das ações necessárias

| Ordem | Ação | Situação observada |
|---|---|---|
| 1 | Registrar e enviar a migração Python completa para o GitHub | Falta executar; o repositório remoto está desatualizado |
| 2 | Executar o workflow de verificação no GitHub | Ainda não há execução remota; depende do envio |
| 3 | Disponibilizar PostgreSQL persistente e configurar `DATABASE_URL` | Não configurado localmente; existência de recurso Neon não confirmada |
| 4 | Configurar API de e-mail e `MAIL_FROM` validado | Não configurado localmente; necessário testar entrega real |
| 5 | Criar/conectar serviço Render ao repositório e preencher as variáveis privadas | Não há acesso autenticado ao painel do provedor nesta verificação; aplicação do Blueprint não confirmada |
| 6 | Validar URL HTTPS e `/api/ready` após o deploy | Endereço público ainda não fornecido/confirmado |
| 7 | Configurar primeira conta administrativa no banco publicado | Precisa ser realizado no banco de destino; não há senha administrativa padrão |
| 8 | Repetir a jornada no endereço público | Cadastro, aprovação, créditos, salvar/reabrir estudo, PDF e recuperação real de senha |

Se quiser conservar contas/estudos/documentos locais, importe o SQLite para um PostgreSQL vazio **antes de começar a cadastrar dados no banco publicado**. A ferramenta recusa um destino já utilizado. Faça backup antes do corte.

## Variáveis relevantes no Render

O Blueprint já define `APP_ENV=production`, `HOST=0.0.0.0`, Python 3.14.6 e os comandos de build/start. O Render informa sua porta e `RENDER_EXTERNAL_URL`; o código usa essa URL quando `APP_URL` estiver vazio.

Devem ser fornecidas em campos privados do provedor:

- `DATABASE_URL`: conexão PostgreSQL persistente, com os parâmetros SSL do Neon.
- `RESEND_API_KEY`: credencial da API HTTPS de e-mail.
- `MAIL_FROM`: remetente validado no provedor. O modo de testes do Resend não substitui envio para usuários arbitrários.

Google é opcional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e callback do endereço HTTPS publicado. Não é necessário comprar domínio para usar o endereço padrão do serviço; o remetente de e-mail tem requisitos próprios.

## Limites da conclusão

Esta verificação não criou recursos, não alterou as contas de provedores e não publicou código. Não foi possível verificar um painel Render/Neon nem testar credenciais de produção, pois não há sessão/configuração disponível para esses provedores nesta tarefa. A ausência de configuração local não prova que uma conta ou projeto remoto não exista.

Os testes locais e os resultados funcionais anteriores estão em [prontidao-python-2026-10-27.md](prontidao-python-2026-10-27.md). Publicar o serviço permitirá usar os fluxos do protótipo pela internet; não transforma os cálculos demonstrativos em análise urbanística homologada.
