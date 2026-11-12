# Informações sobre a cidade no mapa

O botão de informação ao lado da cidade no topo abre um modal com um trecho geográfico do artigo em português, população e ano de referência, área territorial, altitude, coordenadas, seções do artigo e site oficial quando disponíveis. O nome segue a identificação do município no centro do mapa; o botão fica desabilitado enquanto a cidade está sendo identificada.

A identificação do Google Maps mantém município, estado, sigla e país do mesmo resultado. `GET /api/city-info?name=...&region=...&regionCode=...&countryCode=...` consulta as APIs públicas da Wikipédia e do Wikidata. Não envia coordenadas do visitante nem dados do perfil a essas fontes. O endpoint é público e não altera o SQLite ou a pontuação dos rankings.

O serviço procura títulos qualificados por estado/sigla e, quando necessário, pesquisa artigos. Antes de aceitar os dados, verifica nome/aliases, país, região administrativa (até três níveis) e coordenadas de uma entidade geográfica terrestre. Páginas de desambiguação e candidatos de outros estados não são usados. Sem uma correspondência segura, o modal oferece nova tentativa e busca direta na Wikipédia.

A população usa a declaração P1082 válida e datada mais recente, sem misturar a estimativa numérica do resumo em texto. Declarações futuras, depreciadas e inválidas são descartadas; o ano aparece no cartão. Área (P2046) e altitude (P2044) são apresentadas quando a fonte declara, respectivamente, km² e metros. Valores ausentes ou unidades não reconhecidas não são inventados. As coordenadas P625 são uma referência pública da cidade.

Os links de História, Geografia, Demografia, Economia, Turismo e Cultura são montados com os títulos e âncoras existentes na página. Nenhum HTML remoto é injetado no app. O resumo é atribuído à Wikipédia com link de licença retornado pela API; os dados estruturados têm link para o item do Wikidata. A data da consulta acompanha as fontes.

As respostas ficam em memória por 24 horas, com até 64 cidades e compartilhamento de consultas simultâneas. As buscas têm limite de tempo, mensagem de erro e tentativa manual. O frontend cancela consultas antigas e não mostra dados de uma cidade sob o título de outra.

Validação: testes de identificação pelo município, homônimos em estados diferentes, ano e unidades, links seguros, erros, cache, concorrência e endpoint público. Conferência visual desktop/mobile, temas claro/escuro e navegação de Itajaí para Navegantes. As três cidades do piloto foram consultadas nas fontes reais.

Referências: [MediaWiki Action API](https://www.mediawiki.org/wiki/API:Main_page), [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API), [parse/sections](https://www.mediawiki.org/wiki/API:Parsing_wikitext).
