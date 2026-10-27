# Contas do ViabilEasy

A versão 0.13 usa um servidor Node.js 24+, SQLite e cookies de sessão HttpOnly. Cadastro com e-mail/senha, perfil, fotos e estudos privados já funcionam localmente. Google e entrega de e-mails reais dependem das credenciais abaixo.

## Rodar

Na pasta do projeto:

    npm install
    npm run prototype

Abra http://127.0.0.1:4173. A apresentação do site é pública; usar as ferramentas exige uma conta aprovada e login. Use “Criar minha conta” ou “Entrar → Criar conta” para solicitar seu acesso. Novos cadastros aguardam validação do superadministrador. Não existe senha padrão ou usuário administrativo pré-configurado.

A aplicação lê o arquivo .env automaticamente. Copie .env.example para .env caso ele ainda não exista. Reinicie o servidor após alterar a configuração.

## Ativar o Google

1. Abra https://console.cloud.google.com/auth/overview e selecione ou crie um projeto.
2. Na Google Auth Platform, preencha a marca do aplicativo, o e-mail de suporte e o público. Se usar o modo de teste para público externo, inclua os e-mails dos usuários de teste.
3. Em Clientes, crie um cliente OAuth do tipo **Aplicativo da Web**.
4. Cadastre este URI de redirecionamento autorizado, exatamente:

       http://127.0.0.1:4173/api/auth/google/callback

5. Copie o ID do cliente e o segredo para .env:

       GOOGLE_CLIENT_ID=seu-id.apps.googleusercontent.com
       GOOGLE_CLIENT_SECRET=seu-segredo

6. Reinicie o servidor e use “Continuar com Google”.

Apenas nome, e-mail e foto básica são solicitados. O aplicativo não pede acesso ao Gmail, Drive ou contatos. A identidade é validada no servidor pela biblioteca Google Auth Library, com audiência, assinatura, expiração e nonce. O fluxo usa state, cookie de vínculo com o navegador e PKCE.

Se o e-mail já tiver uma conta com senha, entre com a senha e use **Perfil → Conectar Google**. O e-mail do Google precisa coincidir com o da conta. Contas não são mescladas automaticamente apenas por terem o mesmo e-mail.

Documentação oficial: https://developers.google.com/identity/openid-connect/openid-connect

## Enviar e-mails de redefinição

Use as credenciais SMTP do seu provedor de e-mail transacional. Preencha em .env:

    SMTP_HOST=smtp.seu-provedor.com
    SMTP_PORT=587
    SMTP_SECURE=false
    SMTP_USER=seu-usuario
    SMTP_PASS=sua-senha-ou-chave-smtp
    MAIL_FROM=ViabilEasy <contato@seu-dominio.com.br>

A porta 587 usa STARTTLS obrigatório; para TLS desde a conexão, use a porta 465 e SMTP_SECURE=true. Configure o remetente e o domínio no provedor.

Sem SMTP, apenas no desenvolvimento, o servidor grava as mensagens em .data/mail/*.json, com acesso restrito ao usuário do sistema. Abra o arquivo mais recente para testar o link. Nenhum e-mail é enviado para a internet e não há rota HTTP para consultar essa caixa.

O fluxo é: informar e-mail → confirmação genérica → abrir link → nova senha e confirmação → voltar ao login. O link expira em 30 minutos, funciona uma única vez e é removido da barra de endereço ao abrir. Redefinir a senha revoga todas as sessões e os demais links daquela conta. A resposta não confirma se um e-mail está cadastrado.

Contas criadas com Google também podem solicitar esse e-mail para estabelecer uma senha.

Documentação SMTP: https://nodemailer.com/smtp

## Fotos e estudos

- Clique na foto/iniciais no cabeçalho para editar o perfil.
- Escolha PNG, JPEG ou WebP de até 5 MB. No celular há também a opção de câmera, conforme o suporte do aparelho.
- A imagem é recortada ao centro e reduzida a 256 × 256 pixels antes de ser enviada. O servidor verifica tipo, assinatura e limite de tamanho.
- A foto enviada só é servida à própria sessão autenticada. A foto básica do Google pode ser usada quando fornecida pelo provedor.
- “Salvar estudo” guarda geometria, identificação e cenário no servidor; o botão deve ser usado novamente após alterações.
- Na tela inicial, “Continue seus estudos” lista os seis estudos salvos ou abertos mais recentemente, com data/hora e atalho para retomar o cenário. O último acesso fica salvo na conta e não sobrescreve o cenário.
- A biblioteca começa vazia em cada conta. Exemplos continuam disponíveis para explorar, sem se misturarem aos estudos salvos.
- Dados antigos do armazenamento do navegador não são associados automaticamente a uma conta.

## Armazenamento e operação

O banco fica em .data/accounts.sqlite, fora da pasta pública dist. .env, .data e node_modules estão no .gitignore. Senhas usam scrypt com salt individual; sessões e links de recuperação são armazenados como hashes. Há limites de tentativas, verificação de origem nas alterações e consultas de estudos filtradas pelo usuário autenticado.

## Acesso de superadministrador

Contas novas recebem o perfil `user`. O operador local pode atribuir o perfil administrativo a uma conta já cadastrada:

```sh
npm run account:role -- pessoa@exemplo.com super_admin
```

O comando usa o mesmo `DATA_DIR` do servidor (por padrão, `.data`), salva o perfil no SQLite e preserva a senha e os estudos. Para retirar o perfil administrativo, execute o comando com `user`; a conta continuará sendo uma conta comum aprovada. Não existe atribuição de perfil pelo formulário de cadastro ou edição do perfil.

Em uma instalação nova, ainda sem superadministrador ativo, o operador local usa esse comando para ativar a primeira conta de superadministrador já cadastrada e pendente. Essa configuração inicial exige acesso ao servidor; o cadastro público não ativa o primeiro usuário automaticamente. Quando já existe um superadministrador ativo, atribuir o perfil por esse comando preserva a pendência do cadastro, que deve ser analisado pelo superadministrador.

O superadministrador entra diretamente em **Administração**, com totais de contas, estudos, cadastros pendentes e sessões ativas, os 100 cadastros mais recentes e os 20 últimos estudos salvos. O endpoint `/api/admin/overview` valida o perfil da sessão no servidor em cada consulta. Senhas, hashes, tokens e links de recuperação não fazem parte dessa resposta. A área pessoal de estudos continua vinculada à própria conta.

## Aprovação de novas contas

Cadastros por e-mail e contas novas pelo Google nascem com situação **Pendente** e perfil comum. Não recebem sessão de acesso às ferramentas. O superadministrador encontra os pedidos em **Administração → Cadastros aguardando aprovação**, confere nome, e-mail e perfil e escolhe **Aprovar acesso** ou **Recusar**. A fila exibe até 100 pedidos, dos mais antigos aos mais recentes; o restante entra na fila exibida conforme as decisões são concluídas.

Depois da aprovação, a pessoa entra com as credenciais já cadastradas. A decisão preserva o perfil atribuído à conta e registra data e responsável. Uma conta recusada continua bloqueada, inclusive após redefinir a senha. Aprovações e recusas não enviam e-mails automaticamente e não podem sobrescrever uma decisão já concluída pelo mesmo endpoint.

A validação é aplicada pelo servidor a estudos, documentos, perfil e administração. O endpoint `POST /api/admin/users/:id/review` aceita apenas `approved` ou `rejected`, exige sessão de superadministrador aprovado e impede a validação do próprio cadastro. Não há autoaprovação pelo cadastro, edição de perfil, Google ou recuperação de senha.

As contas existentes antes desta migração mantêm seu acesso aprovado, incluindo o superadministrador já configurado. Reiniciar o servidor não aprova cadastros posteriores que ainda estejam pendentes. Execute `npm run test:approvals` para verificar migração, bloqueios, aprovação, recusa, concorrência e persistência com dados sintéticos.

## Documentos oficiais para análise

Abra **Documentos oficiais** pelo menu ou pelo botão da Administração. O superadministrador pode anexar legislação geral, disponível às contas autenticadas. Para certidões, matrículas e plantas de um lote, selecione um estudo salvo no campo **Vincular a**. Na análise também existe o botão **Documentos do terreno**; se necessário, ele oferece salvar o estudo antes de anexar o arquivo.

O cadastro recebe PDF de até 10 MB, título, órgão emissor, identificação, link da publicação e indicação de páginas ou artigos. Os arquivos ficam no SQLite privado em `.data`, com identificador e SHA-256; a listagem não carrega os bytes dos PDFs. O limite por conta é de 100 documentos ou 100 MB. A leitura e o download exigem sessão: documentos de terreno são acessíveis ao responsável e ao superadministrador; legislação geral é compartilhada entre as contas. Não há publicação dos arquivos em `dist`.

**Usar como referência** abre os formulários de recuos ou pavimentos com a identificação e o link do PDF. O usuário consulta o arquivo e informa os números, depois salva o estudo para persistir os parâmetros. O sistema não faz OCR, extração automática de índices, consolidação normativa ou homologação da aplicação do documento ao lote. Os links de PDFs exigirão autenticação também quando estiverem em relatórios.

Verificação: `npm run test:documents` cobre upload, validação, persistência, escopos e download autenticado. Os testes usam banco temporário e documentos sintéticos.

Use o mesmo endereço de APP_URL no navegador. localhost e 127.0.0.1 têm origens e cookies diferentes.

Para publicar, configure NODE_ENV=production, APP_URL=https://seu-dominio, SMTP, uma pasta persistente em DATA_DIR, backup e o redirecionamento HTTPS correspondente no Google. O servidor recusa produção sem HTTPS e SMTP. O padrão escuta somente em 127.0.0.1; para colocar atrás de um proxy/container, configure HOST de forma adequada.

O SQLite fica no computador/servidor em que a aplicação roda. Acesso em vários dispositivos exige hospedar esse mesmo servidor em um endereço acessível aos dispositivos.

O HTML independente e os ZIPs antigos preservam a demonstração anterior e não oferecem contas. Use a versão servida por npm run prototype.

## Verificação

    npm run test:accounts
    npm run verify:geometry

Os testes de contas usam banco temporário, mensagens capturadas e um adaptador Google de teste. Cobrem cadastro, cookies, senha incorreta, isolamento entre contas, estudos, perfil, rejeição de fotos inválidas, persistência, links expirados/reutilizados, revogação de sessões, state/PKCE, conflito de e-mails, conexão Google e logout.

O login real no Google e a entrega SMTP precisam ser conferidos depois de configurar credenciais válidas.
