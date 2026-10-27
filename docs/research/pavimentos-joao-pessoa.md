# Número máximo de pavimentos — João Pessoa

Consulta documental em 21/10/2026. Escopo: perfis ZH-1 a ZH-5 utilizados no protótipo. **O catálogo de recuos, sozinho, não permite informar automaticamente o máximo legal de pavimentos de um terreno.**

## O que os documentos oficiais permitem concluir

1. Na coluna **AM (altura máxima)** do Anexo IV da LC 169/2024, que substitui o Anexo V da LUOS, ZH-1, ZH-3, ZH-4 e ZH-5 têm a referência **(F)**, e ZH-2 tem **(H)**. Não consta “8 pavimentos”, “24 m” ou outro teto numérico universal para essas cinco zonas. A nota F remete à restrição da faixa de 500 m da orla; H remete às definições de IPHAN/IPHAEP nas áreas patrimoniais indicadas. [Quadro, PDF p. 4; notas, p. 5](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4).

2. **Art. 58, §1º:** nas zonas sem número máximo no Anexo V, a altura máxima resulta dos demais parâmetros de ocupação. Isso exige combinar os parâmetros aplicáveis ao terreno; não significa “altura ilimitada”. O caput estabelece a referência de medição e o §2º remete ao Código de Obras quanto a pé-direito/pé-esquerdo. **Arts. 59–61:** também incidem restrições aeronáuticas e de telecomunicações, patrimônio histórico e faixa da orla. [LUOS republicada, pp. 18–19 de 40](https://sapl.joaopessoa.pb.leg.br/media/sapl/public/normajuridica/2024/19967/166_-_29.04.24_-_luos_-_lei_de_uso_e_ocupacao_do_solo-republicada_em_23-08-2024.pdf#page=18).

3. A própria tabela demonstra a diferença: **ZBD possui 2 PV** e **ZEPA-3 possui 4 PV**, enquanto as cinco ZH não têm esse teto numérico expresso. Não transportar os limites de uma zona para outra. As fórmulas de recuo por pavimento informam o afastamento correspondente a N; não autorizam isoladamente construir todos os N para os quais a fórmula produz valor. [Anexo IV, p. 4](https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4).

4. O TJPB informou, em 21/01/2026, que manteve a validade da LUOS, exceto seu art. 62. Em março de 2026, a prefeitura apresentou uma **proposta de nova redação** em audiência. Portanto, os antigos patamares do art. 62 e a minuta de março não devem alimentar automaticamente um máximo autorizado no produto. Não foi homologada nesta pesquisa a consolidação de todos os desdobramentos judiciais ou de legislação posterior. [TJPB, notícia oficial](https://www.tjpb.jus.br/w/decis%C3%A3o-do-tjpb-mant%C3%A9m-proibi%C3%A7%C3%A3o-da-constru%C3%A7%C3%A3o-de-espig%C3%B5es-na-orla), [PMJP, audiência de 27/03/2026](https://www.joaopessoa.pb.gov.br/noticias/em-consonancia-com-mppb-prefeitura-realiza-debate-e-propoe-medidas-mais-restritivas-sobre-altura-de-predios-na-orla-de-joao-pessoa/).

## Decisão recomendada para o protótipo

- Exibir no 3D **“Pavimentos simulados: N”**, **“Altura simulada: H m”** e **“Máximo permitido: não determinado”** quando faltar enquadramento e limite documental aplicável.
- Permitir informar um limite de pavimentos ou altura proveniente de consulta/certidão/documento técnico, guardando fonte, data, referência e condição de aplicação. Identificar como **“Limite informado”**, sem sugerir validação automática do documento.
- Só apresentar um máximo numérico normativo quando houver regra expressa aplicável e os demais limitadores estiverem resolvidos. No escopo atual ZH-1 a ZH-5, não há base para preencher esse máximo apenas com a zona.
- Se o modelo calcular o último pavimento que ainda cabe no envelope de recuos, chamar de **“Limite geométrico do cenário”**, sem equipará-lo a autorização urbanística. Esse limite depende da geometria, frente/fundos, lâmina, área mínima adotada, TO, IA/CA, uso, altura e simplificações da massa.
- Não converter automaticamente um gabarito de altura em quantidade legal de andares usando “3 m por andar”. Essa conversão depende da medição prescrita, cotas do terreno/meio-fio, pé-esquerdo, cobertura e outros elementos. Com altura de piso assumida, o resultado é uma estimativa explicitamente condicionada.
- Manter a contagem visível no 3D: térreo como primeiro pavimento e os superiores numerados; isso torna o cenário inspecionável mesmo quando o máximo legal está pendente. O glossário da LUOS define o térreo como primeiro pavimento com acesso direto ao logradouro. [LUOS republicada, glossário](https://sapl.joaopessoa.pb.leg.br/media/sapl/public/normajuridica/2024/19967/166_-_29.04.24_-_luos_-_lei_de_uso_e_ocupacao_do_solo-republicada_em_23-08-2024.pdf).

O [catálogo oficial de legislação urbanística](https://planodiretor.joaopessoa.pb.gov.br/legislacaovigente/) é o ponto de partida documental, mas não substitui a identificação cadastral e as restrições incidentes sobre cada lote.
