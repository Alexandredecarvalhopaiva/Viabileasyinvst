# Ajustes para publicação — 27/10/2026

## Alterações concluídas no código

- Migração HTTP completa do backend Node para Python/FastAPI, mantendo os contratos do frontend, contas, senhas e estudos existentes.
- SQLite local e PostgreSQL para hospedagem, com transações e bloqueio de usuário para impedir gastos concorrentes do mesmo crédito.
- Migração SQLite → PostgreSQL vazio, backup consistente, restauração testada e comando local para ativar o primeiro administrador.
- Retomada direta do cenário 3D pelo botão **Abrir estudo** da biblioteca.
- Blueprint Render Free, Dockerfile sem usuário root e workflow GitHub para SQLite, PostgreSQL, frontend, geometria, build Linux e inicialização do container em modo de produção.
- API HTTPS Brevo como primeira opção de e-mail no Blueprint. Resend e SMTP TLS continuam disponíveis. O remetente ainda precisa ser verificado no provedor; nenhum e-mail real foi enviado durante os testes.
- O comando `.venv/bin/python -m backend.cli check-deploy` informa todas as pendências de produção de uma vez, não altera banco e não imprime credenciais.
- Configuração de produção exige origem HTTPS, PostgreSQL externo com SSL e remetente/provedor de e-mail. Não foi removida a proteção para iniciar com configurações incompletas.

## Validação local

- 63 testes Python aprovados; 4 parametrizações não aplicáveis ignoradas.
- 35 testes do frontend e 144 verificações geométricas aprovados.
- Modo `APP_ENV=production` exercitado com PostgreSQL temporário, origem HTTPS, cookie Secure, cadastro, bootstrap administrativo e login.
- Envio HTTPS Brevo e Resend testado com transporte simulado; recusas dos provedores não expõem chave ou resposta privada.
- Ruff, formatação e diff-check aprovados.
- Wheels das dependências de runtime disponíveis para Linux x86_64/Python 3.14.

O workflow publicado valida também a imagem Docker em Linux e o endpoint `/api/ready` de um container com PostgreSQL de teste. Resultados remotos atuais: [GitHub Actions](https://github.com/Alexandredecarvalhopaiva/Viabileasyinvst/actions).

## O que depende da sua conta/configuração externa

1. Criar/conectar o projeto Neon Free e configurar `DATABASE_URL` privada com SSL.
2. Criar/configurar a conta do provedor de e-mail, verificar o remetente e preencher `BREVO_API_KEY` e `MAIL_FROM`. Para Resend, substituir a variável Brevo por `RESEND_API_KEY` no serviço.
3. Conectar o Render Free ao repositório e aplicar `render.yaml`. A origem pública é obtida de `RENDER_EXTERNAL_URL` quando `APP_URL` estiver vazia.
4. Migrar os dados locais antes de começar a usar o banco publicado, caso queira conservá-los. Depois, cadastrar/ativar a primeira conta administrativa no banco de destino.
5. Conferir os fluxos no endereço HTTPS público e a entrega de e-mail real. Configurar armazenamento e agenda de backup fora do serviço.

Esses passos não foram simulados como se estivessem concluídos. Nenhum recurso pago foi contratado. Google continua opcional. Os cálculos urbanísticos existentes permanecem preliminares, conforme as limitações no README e no relatório de prontidão.

## Referências

- [Brevo: cadastrar e verificar remetente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).
- [Brevo: API transacional](https://developers.brevo.com/docs/send-a-transactional-email).
- [Render: versão do Python](https://render.com/docs/python-version).
- [Guia do projeto](../backend-python.md).
