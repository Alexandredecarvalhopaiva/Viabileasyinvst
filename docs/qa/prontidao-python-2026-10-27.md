# Conferência funcional e prontidão — 27/10/2026

> Atualização após ajustes de publicação: 63 testes Python passaram e 4 parametrizações não aplicáveis foram ignoradas. O modo de produção foi exercitado com PostgreSQL/HTTPS e cookies seguros; os adaptadores Brevo e Resend foram testados sem envio real. A contagem de 52 abaixo registra a primeira conferência. Consulte também [o registro dos ajustes](ajustes-publicacao-2026-10-27.md).

## Resultado

O backend HTTP foi substituído por Python/FastAPI. O frontend existente funciona com as mesmas rotas e estruturas JSON. Foram implementados SQLite local, PostgreSQL, migração, backup, saúde do serviço, configuração para Render e CI. O serviço Python foi iniciado na instalação local em `http://127.0.0.1:4173`; `/api/health` identifica o backend Python e `/api/ready` confirma o banco.

**Isso não equivale a publicação na nuvem ou a homologação dos cálculos urbanísticos.** Os pontos dependentes de contas externas, remetente de e-mail, dados oficiais e validação técnica permanecem abaixo.

## Evidências automatizadas

| Verificação | Resultado |
|---|---|
| Integração Python em SQLite e PostgreSQL 17.10 | 52 testes passaram; 3 combinações não aplicáveis foram ignoradas |
| Frontend, 3D, identidade da análise, capacidade e recuos | 35 testes passaram |
| Geometria e limites | 144 verificações passaram |
| Ruff, formatação e `git diff --check` | Passaram |
| Dependências Python | `pip check` não encontrou dependências quebradas |
| Compatibilidade com senha scrypt Node | Hash produzido pelo Node usado com sucesso no login Python |
| Schema SQLite antigo | Migração preservou estudo e aprovação de conta antiga; cadastro novo continuou pendente |
| Importação SQLite → PostgreSQL | Contas/senhas preservadas; destino com dados recusado; origem preservada |
| Backup SQLite | Integridade conferida, permissão 0600 e recusa de sobrescrita |
| Backup PostgreSQL | Dump restaurado em outro banco descartável e contagem de contas conferida |

Os 3 skips são intencionais: backup SQLite não se aplica à parametrização PostgreSQL; importação para PostgreSQL não se aplica à parametrização SQLite; restauração PostgreSQL não se aplica à parametrização SQLite. As contrapartidas aplicáveis foram executadas. A biblioteca Starlette emitiu um aviso de depreciação sobre o transporte httpx do TestClient; não houve falha de teste.

Resumo legível por máquina: [backend-python-resultados.json](backend-python-resultados.json). Os testes de backend Node foram substituídos pela suíte Python; o histórico Git mantém a implementação anterior para consulta. Os testes do motor geométrico/3D continuam no frontend.

## Fluxos conferidos

| Funcionalidade | Estado | Evidência |
|---|---|---|
| Site público e arquivos estáticos | Funcional localmente | HTTP 200 e navegador |
| Cadastro pendente e bloqueio de autoaprovação | Funcional | Testes HTTP com campos de perfil/saldo forjados |
| Primeiro administrador | Funcional via operação local | Teste de bootstrap; CLI `set-role` |
| Aprovação e recusa | Funcional | Decisão única, sessão obrigatória, proteção administrativa |
| Login, logout e sessão | Funcional | Hashes no banco, cookies HttpOnly/Secure, expiração e reinício |
| Perfil e foto | Funcional | Imagens decodificadas, formatos/tamanho e isolamento |
| Recuperação de senha | Funcional com caixa local/provedor de teste | Uso único, expiração, entrega falha e revogação de sessões |
| OAuth Google | Implementado; integração externa pendente | Adaptador de teste: state, PKCE, nonce, conflito, vínculo e aprovação |
| Estudos privados e recentes | Funcional | Persistência, ordem de atividade e isolamento entre contas |
| Créditos | Funcional | Liberação idempotente; duas gravações concorrentes não gastam o último uso duas vezes |
| Falha de salvamento/limite de estudos | Funcional | Crédito e lançamento contábil revertidos na mesma transação |
| Documentos PDF | Funcional | Quotas, estrutura, hash, duplicatas, biblioteca e estudo privado |
| Download de PDF | Funcional | Sessão, escopo, attachment, nosniff e sandbox |
| Exclusão de estudos/documentos | Disponível por HTTP | Proprietário/admin conforme escopo; anexos do estudo removidos juntos |
| Simulação 3D, recuos e comparação | Funcional no navegador | Testes JS e jornada manual com terreno 12 × 30 m |
| API e frontend na mesma origem | Funcional | Uso real da interface com o servidor Python |
| Docker/Render/CI | Configuração preparada | Arquivos versionáveis; execução remota ainda pendente |

As rotas novas de exclusão não possuem novos botões no frontend. O upload de PDF verifica a estrutura básica e serve o arquivo como anexo privado; não realiza OCR, interpretação jurídica nem varredura antimalware.

## Conferência manual no navegador

Uma fixture Python em `127.0.0.1:4181` foi usada com banco temporário e conta **sintética**. A instalação principal e seus dados não foram usados para gerar estudos de teste.

1. Página pública e tela de entrada abriram.
2. Login da conta sintética abriu a Administração.
3. Terreno retangular de 12 × 30 m foi cadastrado: 360 m² e perímetro 84 m.
4. O cenário foi salvo pelo frontend no backend Python.
5. Após recarregar, a sessão e o estudo foram recuperados do banco.
6. A biblioteca abriu o cenário salvo no 3D com 6 pavimentos e suas premissas.

Foi identificado e corrigido um desvio anterior: o botão **Abrir estudo** da biblioteca selecionava o lote, mas voltava ao formulário. Ele agora usa o mesmo fluxo de retomada dos estudos recentes e abre diretamente o cenário 3D. O ajuste foi conferido no navegador.

Evidência: [backend-python-3d-2026-10-27.png](backend-python-3d-2026-10-27.png).

## O que falta para disponibilizar a usuários externos

| Pendência | Por que é necessária | Próxima ação concreta |
|---|---|---|
| Conta Render e serviço Free | O código local não cria a hospedagem | Conectar o repositório e aplicar `render.yaml` |
| Projeto Neon e `DATABASE_URL` | Contas/documentos precisam sobreviver a reinícios | Criar banco Free e guardar a URL somente no ambiente privado do serviço |
| Remetente e chave de e-mail | Recuperação real depende de entrega | Validar remetente/provedor e testar recebimento em um endereço real |
| Domínio/remetente no Resend | O remetente de teste restringe destinatários | Validar domínio próprio ou escolher um provedor que atenda ao cenário sem domínio |
| Google OAuth, se desejado | Requer cliente e callback HTTPS do serviço | Configurar credenciais no Google Cloud e testar entrada real |
| Primeiro administrador na nuvem | Não há usuário ou senha administrativa padrão | Cadastrar conta e rodar CLI local conectado ao PostgreSQL correto |
| Backups externos agendados | Backups locais não protegem contra perda do servidor | Definir retenção, armazenamento fora do serviço e agenda; repetir restauração |
| Monitoramento externo e limites | Hospedagem Free suspende por ociosidade/quotas | Acompanhar `/api/ready`, disponibilidade e consumo dos provedores |

Nenhuma credencial foi inventada, enviada ao Git ou usada para simular um serviço externo real. Os arquivos de infraestrutura estão preparados, mas não foram aplicados no Render/Neon. O Dockerfile não foi compilado localmente porque o daemon Docker estava indisponível. O workflow GitHub foi preparado e ainda não foi executado remotamente nesta entrega.

## Lacunas de produto e domínio identificadas

Estas lacunas foram identificadas no código e na documentação existente, sem afirmar atualização/homologação jurídica de fontes:

- **Base cadastral e matrícula:** o mapa localiza um ponto/perímetro informado; não consulta matrícula ou cadastro oficial de propriedade. Endereço não comprova os limites do lote.
- **Zoneamento automático:** a zona continua informada pelo usuário. Bairro e coordenadas não confirmam o regime aplicável. Não há integração oficial de zoneamento por polígono.
- **Regras urbanísticas completas:** o catálogo de recuos cobre um subconjunto documentado de ZH1–ZH5; orla, patrimônio, ambiente, regimes especiais e outras zonas ficam pendentes. Não foram inventados novos índices.
- **CA, TO, permeabilidade e altura:** parte das premissas continua demonstrativa. O limite documental de pavimentos é uma referência informada, sem homologação automática.
- **Cálculo oficial no servidor:** o Python valida os payloads, escopos e créditos; os cálculos geométricos/econômicos existentes continuam no JavaScript. Para um motor técnico auditável, falta portar/validar esse cálculo em servidor, com regras versionadas e resultados reproduzíveis que não dependam de dados calculados pelo navegador.
- **Documentos:** upload e rastreabilidade funcionam; OCR, extração de índices e interpretação normativa não foram implementados.
- **Economia:** a simulação é estática. Não há fluxo mensal, outorga, tributos detalhados, VPL, TIR, financiamento ou cotações de mercado conectadas.
- **Projeto físico:** terreno plano assumido; não há levantamento topográfico, análise de insolação, dimensionamento arquitetônico ou projeto de vagas.
- **Relatórios:** impressão/PDF e JSON são produzidos no navegador. Não há assinatura técnica ou laudo oficial emitido pelo backend.
- **Pagamentos:** usos são liberados manualmente pelo administrador; não há checkout nem cobrança financeira automática.
- **Operação comercial:** retenção/exportação integral de conta, gestão de consentimento e procedimentos de atendimento precisam ser definidos antes de escalar o uso com dados reais. Exclusão de estudos e documentos já tem rotas, mas não há um fluxo completo de encerramento de conta.

O software funciona localmente como ferramenta de organização e simulação preliminar. Torná-lo um sistema de viabilidade urbanística conclusiva requer as integrações, o motor técnico e a validação profissional descritos acima; a troca de linguagem do backend não resolve essas dependências.
