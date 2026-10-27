# Cadastro de documentos oficiais — 26/10/2026

Implementada a área **Documentos oficiais**, acessível pelo menu, pela Administração e pela análise do terreno. Suporta legislação geral cadastrada pelo superadministrador e anexos vinculados a estudos próprios salvos. PDFs e metadados persistem no SQLite privado, com autorização no servidor para listagem e download.

Os 42 testes de contas, documentos, recuos e capacidade passaram: `node --test test/documents.test.mjs test/accounts.test.mjs test/setbacks.test.cjs test/building-capacity.test.cjs`.

## Verificação funcional

- Upload de PDF pela interface usando seletor de arquivo e formulário, em instância temporária separada (`localhost:4182`). Resultado: documento salvo e listado com identificação, tamanho, origem e referência.
- Documento vinculado a estudo sintético: **Usar como referência → Informar pavimentos** preencheu identificação e URL; o campo numérico permaneceu vazio até o preenchimento explícito.
- **Informar recuos** abriu formulário com IDs próprios no diálogo, referência e URL do anexo. Os três recuos permaneceram vazios até o preenchimento explícito. Após aplicar valores sintéticos, a análise exibiu **Documento informado · não validado** e o link para o arquivo.
- Arquivos são disponibilizados como download autenticado de PDF. O visualizador nativo do navegador interno não apresentou o PDF durante a verificação, portanto a interface oferece **Baixar PDF**.
- Formulário conferido em desktop e em 375 × 844: sem rolagem horizontal, sem campos sem nome acessível e sem alvos abaixo do mínimo detectados pelo fixture de QA. A medição encontrou zero ocorrências de contraste baixo ou texto pequeno, segundo os critérios do fixture; não é certificação integral de acessibilidade.
- A conta real permanece em `127.0.0.1:4173`, sem arquivos ou estudos sintéticos inseridos nela.

## Limites do recurso

PDF até 10 MB; até 100 documentos ou 100 MB por conta. Cadastro e download não equivalem à validação de autenticidade, vigência ou aplicabilidade. Não há leitura automática, OCR ou alteração automática de índices. O operador informa os parâmetros a partir do documento e salva o estudo para persistir a referência.
