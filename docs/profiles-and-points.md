# Perfis e pontuação — protótipo local

Base: documento “Plataforma de zeladoria gamificada”, seções Conta e perfil, Gamificação, Regras de negócio e Pontuação, níveis e conquistas, consultado em 11/11/2026. A orientação posterior de Rafael excluiu check-in e todas as conquistas que dependiam dele.

## Experiência

No menu de usuário, abra **Meu perfil**. É possível editar apelido público (2–30 caracteres), foto opcional, município do piloto e apresentação opcional (160 caracteres). Fotos são redimensionadas no navegador para até 320 px e convertidas para JPEG, sem os metadados do arquivo original. A API limita a imagem final a 512 KB. Trocar de conta continua sendo uma simulação sem login. Apelidos não são identificadores de conta e podem se repetir.

O perfil tem visão geral, nível, progresso, conquistas, extrato com créditos/estornos e relatos publicados. Autores de relatos e comentários abrem o perfil público. Nome completo, e-mail e identificadores do provedor de login não fazem parte das respostas públicas.

## Regras implementadas

- Registrar uma ocorrência: +10 pontos para morador.
- Apoiar a ocorrência de outra pessoa: +2. Cada apoio ativo vale uma vez; retirar estorna e recolocar repõe, sem aumentar o saldo líquido.
- Autoapoio é rejeitado. Gestores e administradores não acumulam pontos.
- Comentários, exemplos fictícios e apoios a exemplos não pontuam.
- Remover uma ocorrência pela administração estorna seus créditos e os apoios associados. A exclusão do conteúdo não apaga o extrato.
- O saldo e o nível vêm do servidor. O cliente não pode escrever pontos, papéis, conquistas ou vínculos de identidade.
- Limiares de nível: 0, 100, 300, 700, 1500; títulos conforme o documento.
- Primeiro Passo: primeiro relato válido; Guardião da Acessibilidade: 10 relatos nas subcategorias de rampas de acesso ou piso tátil, dentro de Calçada. Esta é a definição provisória de acessibilidade na taxonomia atual.
- Conquistas/progresso são derivados dos créditos ainda válidos; estornos podem revogar progresso, nível e conquista. Não há bônus adicional por badge.

## Fluxos ainda pendentes

O app continua com os quatro status existentes. A validação da solução por moradores e a conclusão são uma entrega futura; **Resolvida não concede pontos de conclusão**. Os valores de +5 pela validação e +15 pela conclusão do relato do autor estão documentados e exibidos como pendentes, mas não há endpoint para concedê-los nem botão para simular créditos. Olho Vivo fica bloqueado enquanto não houver o fluxo de confirmação/contestação. Rankings, missões e temporadas não foram incluídos nesta entrega.

## Persistência e migração

SQLite versão 3: `profiles`, `user_identities` e `point_ledger`. Perfis são inicializados com os IDs já usados pelos moradores fictícios, preservando vínculos com relatos, comentários e apoios. Relatos anteriores não fictícios recebem seu crédito de criação com a data original. Apoios anteriores sem data são importados na data da migração, com indicação explícita no motivo; não se inventa uma data original. Exemplos são ignorados. Uma marca de migração e chaves únicas impedem repetir a importação.

A tabela de pontos é append-only (triggers rejeitam UPDATE/DELETE). Cada crédito tem uma chave de origem única; cada estorno referencia um crédito e só pode existir uma vez. Contribuição, crédito/estorno e revisão SSE são gravados na mesma transação. O saldo por lançamento segue a ordem contábil de inserção; a data mostra quando a ação ocorreu (ou a data de importação, se desconhecida). Fotos ficam como BLOB no perfil, fora do snapshot; URLs possuem uma versão para invalidar cache. Alterações de perfil também atualizam a revisão e são transmitidas via SSE.

## Preparação para WorkOS

A identidade de aplicação é um `UserId` estável, independente do apelido, e-mail e provedor de login. `user_identities(provider, subject, user_id)` reserva o vínculo com o `user.id` verificado do WorkOS; esse vínculo é exclusivamente de servidor. O ponto de integração é `createApp({ resolveActor })`, usado em todas as mutações. O teste do adaptador comprova um ID interno fora da lista demo e ignora o ator forjado no corpo da requisição.

Hoje `resolveDemoActor` confia no seletor fictício, por design do protótipo. **Isto não implementa autenticação e não deve ser tratado como controle de acesso para usuários reais.** Na futura integração, substituir o adaptador por uma sessão verificada no servidor, resolver o vínculo existente ou criar um novo perfil transacionalmente, e substituir o seletor fake no cliente pela sessão. Nunca vincular contas automaticamente por apelido/e-mail. Os registros de pontos e perfis permanecem na aplicação; nenhuma chave secreta deve ser exposta em `VITE_*`.

Documentação consultada: https://workos.com/docs/reference/authkit/user e https://workos.com/docs/authkit/metadata.

## Validação local

`npm test` cobre migração/reabertura, limites dos níveis, conquistas, reversões, apoios concorrentes/idempotentes, exclusão, fotos, validações da API, campos protegidos, identidade verificada injetável e notificações SSE. `npm run build` verifica a compilação cliente/servidor. Nada desta entrega foi enviado à VPS.

## Rankings e demonstração (11/11/2026)

Entrega de ranking de moradores: Top 10 geral/por cidade; semana, mês e total; filtros por relatos, apoios e acessibilidade; posição do usuário fora do Top 10; empates com a mesma posição e ordem estável. O período usa America/Sao_Paulo e se atualiza também com a revisão SSE e a passagem do tempo, sem apagar pontos anteriores. Rankings de bairros, cidades e prefeituras continuam pendentes.

SQLite versão 4 acrescenta `point_locations` (atribuição imutável da cidade do lançamento real, preservada em estornos mesmo após excluir a ocorrência) e `demo_point_ledger` (simulações separadas do extrato real). A cidade real é reconhecida na referência do relato; quando não há um município único reconhecível, o lançamento conta apenas no geral. Não se usa o município do perfil para atribuir pontos a uma cidade.

`npm run seed:ranking` adiciona, explicitamente e uma única vez, 491 ações fictícias distribuídas por cidades e datas para Rafael, Felipe, Gabriel, Sérgio e Ricardo. Não cria ocorrências no mapa nem altera créditos, fotos, comentários ou apoios existentes. Os totais da demonstração são 1520, 990, 700, 390 e 190 pontos, respectivamente, acrescidos da pontuação real de cada perfil. O perfil/extrato identifica simulações e separa os dois subtotais. Atividades simuladas podem liberar os badges já implementados; check-in e pontuação de validação/conclusão continuam excluídos ou pendentes conforme descrito acima. Reexecutar a carga não duplica eventos nem muda as datas da primeira carga.
