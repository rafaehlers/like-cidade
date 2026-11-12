# Compartilhamento de relatos

Os detalhes do relato, o atendimento no CRM e a confirmação após publicar oferecem WhatsApp, Facebook, X, copiar link e, nos navegadores compatíveis, o compartilhamento nativo do dispositivo. Não há publicação automática nem SDK de redes sociais. O usuário escolhe o destino e confirma o envio na rede ou aplicativo.

O link público tem o formato `/relatos/:id`. Ao abrir esse endereço, o app mostra o relato e centraliza seu ponto no mapa, mesmo quando o perfil selecionado normalmente abriria o CRM. O app evita pedir localização automaticamente nessa entrada. Voltar e avançar pelo navegador atualiza o relato aberto; fechar os detalhes retorna à raiz. Relatos removidos recebem uma tela de indisponibilidade.

As mensagens e prévias usam uma lista explícita de informações públicas: título, categoria, referência, situação e link. A prévia também pode usar a foto pública do relato. Comentário do morador, comentários internos, fotos de evidência do atendimento e identidade de acesso não entram no conteúdo compartilhado. O servidor ignora a identidade de quem pede a prévia e consulta somente colunas públicas.

Em produção, `GET /relatos/:id` entrega a página do app com título, descrição, URL canônica e Open Graph próprios do relato. Fotos são servidas pelo endpoint público já existente; sem foto, a prévia usa a marca do app. A origem das URLs vem de `PUBLIC_SITE_URL`, com padrão `https://likecidade.com.br`, e não do cabeçalho Host enviado pelo visitante. A página de um relato ausente usa HTTP 404 e `noindex`. Não há mudança de esquema no banco.

O compartilhamento nativo depende do navegador e dos aplicativos disponíveis; o app não promete envio direto ao Instagram ou Stories. Cancelar o seletor nativo não mostra erro. Se o navegador recusar acesso à área de transferência, o campo do link é selecionado para cópia manual.

`npm test` cobre URLs e caracteres especiais, dados privados fora das mensagens, limites do texto no X, escape de HTML, prévias anônimas, origem confiável, fotos públicas e relatos removidos. O fluxo de publicação é conferido em um banco separado, sem criar relatos de teste em produção.
