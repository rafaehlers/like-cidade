# Administração e central de atendimento

Implementação baseada no documento “Plataforma de zeladoria gamificada”, consultado no Google Docs: RF036–RF040 (área da prefeitura), RF043 (gestores), RN004/RN005/RN016, critérios de priorização e auditoria. As orientações posteriores de Rafael prevalecem: sem check-in e sem conversa pública; comentários do atendimento são internos.

## Administração

O perfil Admin tem as abas **Administração**, **Atendimento** e **Mapa público**. Na administração, o seletor contém as cidades reconhecidas que já possuem relatos. A coluna esquerda lista todos os perfis. Para uma pessoa selecionada, a coluna direita permite marcar categorias e informar um órgão/secretaria por categoria. Uma categoria pode ter vários responsáveis, e uma pessoa pode atender várias combinações cidade/categoria.

Os vínculos ficam em `agency_scopes`, separados do município editável e do papel básico do perfil. Uma conta de morador atribuída recebe capacidade de atendimento apenas para os vínculos concedidos; não se transforma em administrador nem perde seu histórico como morador. Administradores já têm acesso global e não recebem atribuições redundantes. A edição exige salvar ou cancelar antes de trocar usuário/cidade, evitando perder o formulário.

Cada alteração incrementa uma versão da atribuição (por pessoa/cidade), grava antes/depois em `admin_audit` e avisa os clientes pelo SSE. Escritas com versão antiga recebem 409. Reenviar as mesmas atribuições não duplica eventos nem incrementa a revisão. Revogação remove também o acesso aos textos e evidências, inclusive por API.

## Atendimento

O representante entra na central por padrão; contas de moradores atribuídas ganham a aba **Atendimento**. A API retorna somente ocorrências das combinações autorizadas. Administradores consultam todas e também podem filtrar por responsável ou por categorias sem responsável. A fila funciona independentemente do mapa, com:

- cidade, categoria, bairro reconhecido, situação, intervalo de datas e busca textual;
- ordenação por prioridade, antiguidade, registro recente ou apoios, e paginação;
- detalhe com dados do relato, texto restrito do morador, responsáveis/órgãos, histórico e evidências;
- comentário interno obrigatório em cada providência;
- mudança de status com foto obrigatória ao passar para **Resolvida**;
- prioridade automática ou manual, com a justificativa registrada no comentário;
- indicadores por cidade e categorias autorizadas: pendências, proporção informada como resolvida, tempo médio observado até esse status e frequência por categoria.

A prioridade automática segue os critérios de risco, dez apoios e trinta dias em aberto, limitada a Alta. A consulta dos critérios fica em uma seção recolhível no CRM, acima da fila de atendimento; não aparece no mapa público nem no ranking dos moradores. A taxonomia atual reúne drenagem/água/esgoto e árvores em categorias mais amplas; acessibilidade usa as subcategorias já definidas. As datas dos filtros e do histórico usam America/Sao_Paulo. Bairro/cidade são reconhecidos da referência já disponível; não se inventam bairros ausentes. Relatos sem cidade reconhecida são atendidos somente por Admin e não podem gerar atribuições por suposição. A futura produção deverá usar município/bairro estruturados e validados pela localização.

## Histórico, evidência e concorrência

`service_events` guarda comentário, autor, data, status alterado, prioridade e foto, com histórico imutável. Atualizações de status, nota, prioridade e revisão são atômicas. O servidor compara o status e a versão do atendimento para impedir sobrescrita de trabalho concorrente. O histórico público recebe apenas a mudança de status; comentários e fotos do atendimento são restritos. O antigo endpoint de conversa continua encerrado (410).

As fotos de evidência usam um endpoint protegido e são carregadas com o contexto do usuário; links públicos do mapa não expõem esses arquivos. A rota antiga de atualização de status delega às mesmas regras, sem permitir contornar atribuições, comentário obrigatório ou evidência. Os créditos das fotos ilustrativas continuam visíveis.

SQLite versão 6 acrescenta órgão à atribuição, versões de atribuição, auditoria, eventos de atendimento e prioridades manuais. Nenhum relato, comentário antigo, foto, perfil, apoio ou ponto preexistente é reclassificado ou apagado pela migração. Logs administrativos e de atendimento não são editáveis nem removíveis pela interface.

## Limites preservados

A solução informada como **Resolvida** não equivale a conclusão confirmada pelos moradores; não concede os 15 pontos de conclusão. Confirmação/contestação, recusa, duplicatas e conclusão pela comunidade continuam como entregas posteriores. O indicador usa a expressão “informadas como resolvidas”, evitando apresentar demonstração como impacto real confirmado. Registros antigos sem data confiável de resolução não entram no tempo médio. O filtro de bairro reconhece referências estruturadas existentes, sem polígono geográfico nem geocodificação adicional.

O app continua com contas fictícias livremente selecionáveis. Este protótipo demonstra permissões, mas não garante confidencialidade contra pessoas que podem selecionar Admin. A integração futura com WorkOS substitui o adaptador de identidade por sessão verificada; papéis e atribuições continuam sendo validados no servidor pelos IDs internos estáveis. Não são criadas credenciais nem integrações externas nesta entrega.

## Verificação

Testes cobrem atribuição/revogação, permissão por cidade e categoria, persistência, versões conflitantes, auditoria imutável, comentário obrigatório, evidência obrigatória, acesso protegido às fotos, ausência de texto interno no mapa público, prioridades, métricas e SSE. A conferência de interface usa um banco fictício separado para não alterar a operação existente.
