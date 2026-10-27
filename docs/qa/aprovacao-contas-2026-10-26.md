# Aprovação de novos cadastros — 26/10/2026

Novas contas por e-mail ou Google aguardam aprovação do superadministrador. O servidor impede a emissão de sessão e o uso de estudos, documentos, perfil e administração enquanto a conta não estiver aprovada. Contas anteriores à migração preservam o acesso existente. O cadastro público nunca cria um administrador inicial automaticamente.

## Verificação pela interface

Fluxo realizado em instância temporária isolada em `localhost:4182`, sem criar ou aprovar usuários na base real:

1. Formulário avisou sobre a aprovação antes de cadastrar **Cadastro de teste QA**.
2. Cadastro exibiu **Seu cadastro está em análise**. Nova tentativa de login antes da aprovação exibiu a mesma situação, sem abrir ferramentas.
3. O superadministrador sintético encontrou a solicitação na fila, com nome, e-mail e ações de aprovação/recusa.
4. **Aprovar acesso** retirou a conta da fila, atualizou a situação e confirmou a liberação.
5. A conta recém-aprovada entrou normalmente no workspace, com perfil comum.

Evidências: `cadastro-pendente-2026-10-26.png` e `fila-aprovacao-qa-2026-10-26.png`. O painel da conta real foi conferido separadamente, mantendo Alexandre como superadministrador aprovado e sem inserir pedidos sintéticos.

## Verificação automatizada

`node --test test/account-approvals.test.mjs test/accounts.test.mjs test/documents.test.mjs`

Resultado final: 38 testes passaram.

Cobertura: preservação de contas legadas; pendência por padrão; ausência de sessão no cadastro; bloqueio de sessão prévia pendente; autorização e origem da revisão; impedimento de autoaprovação; preservação do perfil; data e responsável; exigência de novo login; decisões concorrentes; recusa e recuperação de senha; Google com identidade simulada; persistência após reinício; privacidade dos documentos e estudos.

A configuração do primeiro superadministrador é uma operação explícita do operador local. Depois que existe um superadministrador ativo, uma atribuição de perfil administrativo não aprova automaticamente uma conta pendente.
