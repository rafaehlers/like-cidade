# Páginas legais e controle de dados da conta

Implementado em 12/11/2026, com responsável e contato informados por Rafael: Rafael de Menezes Ehlers, rafaehlers@gmail.com. As páginas refletem as funcionalidades e limitações atuais. Sua publicação não representa certificação de conformidade com a LGPD nem substitui as decisões e a validação jurídica sobre bases legais, retenção e transferências.

## Páginas e acesso

- `/termos`: funcionamento, uso responsável, autoria, moderação, pontuação, limites do serviço, direitos e contato.
- `/privacidade`: controlador, dados/finalidades, visibilidade, localização, fornecedores, conservação, direitos e atendimento.
- `/cookies`: preferências locais, Google Maps, armazenamento e gestão pelo navegador. Não há banner para aceitar rastreamento não implementado.
- `/conta-excluida`: orientação após conclusão da exclusão, sem informações pessoais na URL.

Páginas independentes do mapa: abrir uma página legal não inicializa geolocalização ou Google Maps. Têm sumário, link para pular ao conteúdo, título próprio, navegação por teclado e temas claro/escuro. Links estão no rodapé lateral e em Meu perfil > Privacidade e dados, no desktop e mobile. O contato utiliza `mailto:`; abrir o link não envia mensagem automaticamente.

A versão dos textos é `2026-11-12`, definida em `src/legal.ts`. A publicação dos termos não cria um aceite retroativo e não é tratada como consentimento genérico. O cadastro futuro deve apresentar os termos e registrar a versão/aceite necessário; consentimentos opcionais devem ser separados por finalidade.

## Proteção de identidade

Rafael decidiu adiar Google/WorkOS. Por isso **os controles privados ficam bloqueados por padrão**, tanto no cliente quanto na API; solicitação por e-mail permanece disponível. Não há variável de ambiente para liberar exclusão com identidade selecionada no cliente.

A integração futura deve fornecer `createApp({ resolvePrivacySession })`, que retorna apenas uma sessão realmente verificada no servidor: `{userId, authenticatedAt}` (data de autenticação/reauth em milissegundos desde Unix epoch). Não use cabeçalhos do cliente, apelido, corpo ou query para resolver o titular. Esse adaptador é separado de `resolveDemoActor` para que a existência de outro resolvedor de identidade não libere acidentalmente os recursos sensíveis. A mesma sessão deve ser adotada no restante da aplicação quando o login for ativado.

- `GET /api/account/privacy`: indica disponibilidade; sem sessão verificada, nenhuma conta é exposta.
- `GET /api/account/export`: exporta exclusivamente a conta da sessão, sem aceitar alvo selecionado. A resposta é JSON com download, sem cache e `nosniff`.
- `DELETE /api/account`: exige sessão verificada, autenticação há no máximo 10 minutos, JSON, origem permitida, confirmação literal `EXCLUIR MINHA CONTA` e `acknowledged:true`. Alvos extras no corpo são rejeitados. A sessão deve ser renovada por um fluxo real de reautenticação, sem endpoint para renovar apenas a marca de tempo.

O adaptador de teste usa cabeçalhos apenas em servidores efêmeros de testes, não no processo da aplicação. Testes de API validam que `X-Demo-User` e IDs forjados não liberam o recurso. Os controles do perfil também conferem que o perfil exibido corresponde à conta verificada.

## Exportação

O arquivo inclui perfil/foto, referências de identidade (sem senhas ou tokens), relatos e fotos de autoria do titular com o comentário enviado, apoios, comentários de autoria do titular, seus próprios atendimentos/evidências, histórico público de suas ações, pontos, responsabilidades e registros de atribuição relacionados ao titular. Imagens são JPEG em data URL, para não depender de URLs que deixem de existir.

Não são exportados comentários ou evidências de outras pessoas somente por estarem no relato do titular. O arquivo explica o escopo: base ativa do aplicativo, sem backups ou dados mantidos diretamente por terceiros.

## Exclusão e persistência

SQLite versão 7 acrescenta `privacy_receipts`, apenas com protocolo aleatório e data de conclusão. O protocolo não guarda usuário, nome ou email. Não há reconstituição de perfis apagados durante a inicialização: a carga inicial dos perfis passa a ocorrer apenas antes da inicialização original de pontos.

A operação é síncrona e transacional:

1. Remove foto e perfil, identidades vinculadas na aplicação, atribuições de cidade/categoria e versões.
2. Remove apoios e comentários do titular, pontos reais/adicionais e localização de pontos.
3. Remove relatos e fotos publicados pelo titular e os dados vinculados a esses relatos, inclusive interações e pontos relacionados de outros participantes. Pontuações/rankings são recalculados sobre os dados restantes.
4. Em relatos de outras pessoas, preserva apenas a cronologia dos atendimentos do titular, usando um ator neutro compartilhado, sem nome original, comentário ou evidência. Históricos públicos também perdem o identificador/nome do titular. O ator neutro não aparece no seletor ou ranking.
5. Elimina registros de atribuição cujo ator ou alvo é a conta excluída, evitando manter IDs pessoais no JSON da trilha.
6. Grava protocolo/data, incrementa a revisão e avisa os clientes pelo SSE após o commit.

A escrita habitual de pontos/auditoria/atendimentos permanece append-only. Para atender a eliminação, os triggers permitem uma **exceção restrita à transação privada de exclusão na mesma conexão**. O autorizador é uma função SQLite registrada no processo, cujo estado privado volta ao bloqueio no `finally`, inclusive após rollback. Não existe tabela, variável de ambiente ou endpoint para destravar genericamente esse histórico. Os testes verificam rollback e a permanência do bloqueio após falha. Esse desenho não protege contra um operador com acesso integral ao arquivo/servidor, que já pode alterar o banco diretamente.

`secure_delete=ON` é utilizado e o WAL recebe uma tentativa de checkpoint após a transação. Não se promete apagamento forense de blocos de disco ou exclusão de backups por esse procedimento.

## Antes de ativar com contas reais

- Integrar sessão, reautenticação, revogação de sessões e tratamento da conta no WorkOS; não excluir a conta Google pessoal do usuário.
- Substituir o seletor de perfis em produção e verificar os acessos em todos os endpoints. Revalidar a sessão após a exclusão para impedir escritas por identidade removida.
- Definir e operar prazos de retenção e limpeza de backups/logs. A restauração de um backup anterior não pode reativar dados de titulares excluídos: consultar os pedidos/comprovantes no canal de privacidade e reaplicar exclusões antes da reabertura do serviço. A rotina automática de restauração/expiração ainda não foi implementada.
- Tratar solicitações a provedores, caches e destinatários de links; informar ao titular qualquer conservação aplicável e seu fundamento, sem presumir uma exceção legal genérica.
- Validar bases legais por finalidade, transferências internacionais, regras para menores, procedimentos para incidentes e atendimento aos direitos. Não atribuir certificação LGPD ao conjunto de páginas.

Fontes oficiais consultadas: [Direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares), [LGPD atualizada — Câmara dos Deputados](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), [Google](https://policies.google.com/privacy?hl=pt-BR), [Hostinger](https://www.hostinger.com/br/legal/politica-de-privacidade).

## Validação

Os testes cobrem exportação com anexos e proteção de conteúdo alheio, bloqueio do seletor/IDs forjados, confirmação, origem, autenticação recente, exclusão de dados/relatos/pontos e vínculos, retirada de identificadores do atendimento, integridade de chaves, falha com rollback e reinício sem ressuscitar perfis. Nenhuma exclusão de conta da base publicada foi utilizada para testar. A avaliação visual cobre páginas e área de privacidade no desktop/mobile e nos dois temas.
