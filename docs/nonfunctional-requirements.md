# Revisão dos requisitos não funcionais

Revisão em 12/11/2026. Escopo autorizado nesta etapa: implementar o Graveyard e avaliar RNF005, RNF006, RNF007 e RNF011. O login Google/WorkOS foi adiado por Rafael. Esta revisão técnica não certifica conformidade legal ou acessibilidade integral.

| Requisito | Situação | Evidência e pendências |
| --- | --- | --- |
| RNF005 — LGPD | Parcial; não considerar atendido | Há separação de comentários/evidências internos nas respostas da API, compartilhamento com campos públicos explícitos e aviso sobre fotos/dados pessoais. Foram acrescentados termos, política de privacidade, página de armazenamento, controlador/canal e controles preparados de exportação/exclusão. Faltam autenticação real para ativá-los, validação das bases legais/transferências e operação de retenção/backups. Veja privacy-and-account.md. |
| RNF006 — HTTPS e login Google sem senhas locais | HTTPS ativo; OAuth pendente | O domínio redireciona HTTP para HTTPS (301), responde por HTTPS e carrega Google Maps via HTTPS. API, fotos e SSE usam a mesma origem. Não existe armazenamento de senha no aplicativo, mas o seletor de perfis não autentica ninguém. O login Google via WorkOS continua pendente. |
| RNF007 — WCAG 2.1 AA | Parcial; não considerar atendido | Existem idioma pt-BR, controles com rótulo, foco visível, diálogos nativos, abas do ranking com teclado e lista alternativa ao mapa. Foram encontrados contrastes insuficientes em textos pequenos do tema claro. Ainda é necessária avaliação das telas e estados com teclado, leitor de tela, zoom/reflow e contraste. |
| RNF011 — Log de todas as ações administrativas e mudanças de status | Parcial | Atribuições guardam ator, data e antes/depois em `admin_audit`; atendimento grava comentários, status, prioridade e evidência em `service_events`, com histórico público de status. Essas tabelas rejeitam UPDATE/DELETE em ações normais; a eliminação de conta tem uma exceção transacional controlada. A exclusão de relato e outras mutações feitas por Admin não possuem um log administrativo geral. A identidade do ator ainda vem do seletor de teste. |

## Graveyard

- **Em aberto** é a visualização inicial: Registrada, Em análise e Em andamento.
- **Graveyard** mostra apenas ocorrências encerradas, tanto no mapa quanto na lista.
- **Todas** permite comparar pendentes e encerradas no mesmo recorte.
- Nesta versão, somente **Resolvida** representa encerramento. Isso não equivale à confirmação da solução pelo morador; esse fluxo continua pendente.
- Pins encerrados usam lápide e cinza escuro, inclusive na visualização Todas. Agrupamentos compostos somente de encerradas usam lápide, quantidade e cinza; grupos mistos mostram a quantidade usual.
- Categoria, busca, situação e limites do mapa continuam combináveis com o filtro. O acesso está disponível no mapa mobile e na lista.
- Links diretos e abertura pelo perfil ajustam a visualização para tornar uma ocorrência encerrada localizável. O SSE move ocorrências de um recorte para outro quando seu status muda.
- Graveyard não exclui dados, não altera status e não recupera registros removidos pela administração. Novos status terminais devem ser definidos primeiro no fluxo de atendimento e incluídos em `isClosedStatus`.

## LGPD: decisões e trabalho necessário

Inventário mínimo observado: apelido, município, apresentação e foto do perfil; autoria, coordenadas, referência, título e foto do relato; comentário do morador, evidências do atendimento, histórico, apoios e pontuação. O título, ponto do problema, referência, foto e autoria podem ser públicos. A localização do dispositivo centraliza o mapa; ao publicar, as coordenadas do ponto escolhido passam a fazer parte do relato. O Google recebe dados necessários ao mapa/geocodificação. A consulta de informações municipais usa Wikipédia/Wikidata no servidor.

Antes de aceitar dados reais, definir controlador e contato, finalidades e bases legais, fornecedores/transferências, prazos de retenção e política de backups; publicar aviso de privacidade; implantar autenticação e atribuições verificadas; criar procedimento de consulta/correção/exportação/eliminação ou anonimização quando aplicável. Não presumir que um checkbox de consentimento resolve todas as finalidades. Auditoria e ledger imutáveis precisam de política de minimização e retenção compatível com os direitos dos titulares.

Fonte: [direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados) e [guia de segurança da informação — ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-publica-guia-de-seguranca-para-agentes-de-tratamento-de-pequeno-porte).

## HTTPS e identidade

Verificação do domínio nesta revisão: `http://likecidade.com.br` respondeu 301 com destino HTTPS; `https://likecidade.com.br` respondeu 200. O serviço Node se comunica com o proxy na rede Docker interna; não se configura certificado dentro do React. A renovação do certificado e a configuração HTTPS devem continuar sendo acompanhadas na hospedagem.

Quando retomado, o login Google pelo WorkOS deve usar sessão verificada no servidor, cookies seguros, proteção dos endpoints e vínculo estável `user_identities`; o seletor livre não pode permanecer como alternativa em produção autenticada. A aplicação não deve receber ou armazenar senhas Google. Também será necessário definir o vínculo entre as contas reais e os perfis/pontos atuais, sem associar administradores automaticamente por nome ou e-mail. Referência: [GoogleOAuth no WorkOS](https://workos.com/docs/reference/authkit/authentication/get-authorization-url).

## Acessibilidade: problemas concretos

Contrastes calculados pela luminância relativa das cores em `src/style.css`, sem arredondamento para aprovação. Para texto pequeno, o critério 1.4.3 exige pelo menos 4,5:1:

| Elemento no tema claro | Cores texto/fundo | Contraste aproximado |
| --- | --- | --- |
| Texto secundário sobre branco | #7b817f / #ffffff | 3,97:1 |
| Texto branco do botão principal | #ffffff / #e8423b | 3,98:1 |
| Registrada | #b18455 / #fcf0e7 | 2,98:1 |
| Em análise | #8a6bb1 / #f2edf8 | 3,79:1 |
| Em andamento | #6489b8 / #edf3fd | 3,24:1 |
| Resolvida | #658958 / #edf5eb | 3,58:1 |

Essas combinações precisam de ajuste antes de declarar AA. O pin cinza novo tem contraste branco/cinza de 6,89:1 e usa ícone/texto acessível, sem depender apenas da cor. A revisão completa deve incluir estados de erro/carregamento, campos de arquivo, edição de perfil, abas do perfil, acesso à localização/pin sem gestos de precisão e retorno de foco após fechar os modais. A existência de lista alternativa ao mapa ajuda, mas não comprova que todos os fluxos sejam acessíveis.

Referência normativa: [WCAG 2.1 — W3C](https://www.w3.org/TR/WCAG21/), especialmente 1.4.3 (contraste), 1.4.10 (reflow), 2.1.1 (teclado), 2.4.3 (ordem do foco), 2.4.7 (foco visível), 3.3.1/3.3.2 (erros e instruções) e 4.1.2/4.1.3 (nome/papel/valor e mensagens de status).

## Auditoria: lacunas e critério de aceite

O RNF011 não está atendido integralmente. Hoje, `IssueDatabase.remove` elimina o relato e seus históricos com cascata sem registrar o ator/removido em um log geral; o método interno `status` mantém somente o histórico ligado ao relato. Criação de relato, apoios e edição do perfil executados por Admin também não entram em uma trilha administrativa única. Os logs existentes permanecem válidos para atribuições e atendimento, mas não cobrem toda a superfície administrativa.

Próxima implementação proposta: registrar as mutações administrativas e transições de status em uma trilha append-only, na mesma transação da ação, com ator verificado, data UTC, ação, alvo/ID e mudanças antes/depois estritamente necessárias. Preservar a referência após remoção do alvo; não copiar comentários privados, fotos, tokens ou senhas para logs. Oferecer consulta paginada e restrita à administração; definir retenção, backup e revisão de acesso. Testar reinício, rollback, concorrência, acesso negado e preservação da trilha após exclusão. Não inventar registros para ações antigas sem evidência.
