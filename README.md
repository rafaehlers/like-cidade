# Like Cidade

Mockup funcional para a disciplina Cidades Inteligentes e Sustentáveis. Vite + React + TypeScript, Tailwind CSS e Lucide Icons. Mapa com Google Maps JavaScript API.

## Rodar localmente

Requer Node.js 22.18 ou superior. SQLite usa o módulo nativo do Node, sem instalar um servidor de banco separado.

```sh
npm install
npm run dev
```

Abra `http://localhost:5173`. O arquivo `.env` já está criado. Preencha localmente:

```dotenv
VITE_GOOGLE_MAPS_API_KEY=SUA_CHAVE_DE_NAVEGADOR
VITE_MAP_CLUSTERING_ENABLED=true
HOST=127.0.0.1
PORT=3001
SQLITE_PATH=./data/like-cidade.sqlite
```

O comando `npm run dev` inicia a API em `127.0.0.1:3001` e o Vite em `localhost:5173`, com proxy para a API e o fluxo SSE. O front-end tem atualização automática em desenvolvimento; reinicie o comando depois de alterar o servidor ou o `.env`. Não cole a chave no chat. A pasta ou JSON de credenciais de conta de serviço não é necessária e não deve entrar no front-end.

`VITE_MAP_CLUSTERING_ENABLED=true` ativa o agrupamento dos pins próximos ao afastar o mapa (padrão). Use `false` para mostrar sempre os ícones individuais. Cada grupo mostra a quantidade de relatos; clicar aproxima o mapa até separar o grupo. Os agrupamentos respeitam os filtros e ficam verdes quando todos os seus relatos estão resolvidos. A localização do usuário não entra nos grupos. Após alterar o `.env`, reinicie o Vite; para publicação, gere um novo build.

### Google Cloud

1. Habilite **Maps JavaScript API** em um projeto com faturamento configurado.
2. Habilite também **Geocoding API**, usada para identificar a cidade no centro do mapa. Crie uma chave para uso em navegador. Restrinja a chave às APIs Maps JavaScript e Geocoding e aos sites autorizados, por exemplo `http://localhost:5173/*` e, quando for publicar, o endereço HTTPS escolhido em `rafaellers.cloud`.
3. Não é necessário Map ID: o mapa usa estilo local para ocultar nomes e ícones de pontos de interesse e transporte, mantendo ruas, seus nomes e a geografia. Os pins dos relatos e a localização usam HTML overlays. A variável antiga `VITE_GOOGLE_MAPS_MAP_ID`, se existir no `.env`, não é utilizada.

Este mockup não usa Places. O nome da cidade na barra superior acompanha o centro do mapa usando geocodificação reversa do Google. A consulta acontece 700 ms após o mapa parar de se mover, não é repetida ao apenas mudar o zoom sem mover o centro, e respostas de posições anteriores são ignoradas. Sem resultado ou em caso de falha, aparece “Região do mapa”. O morador escreve a rua ou referência e a localização do relato vem das coordenadas do pin/GPS. As variáveis com prefixo `VITE_` ficam acessíveis ao navegador após o build; o `.env` não transforma a chave de navegador em segredo. Restrinja seu uso no Google Cloud.

Documentação: [carregamento](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [estilo do mapa](https://developers.google.com/maps/documentation/javascript/examples/hiding-features), [overlays](https://developers.google.com/maps/documentation/javascript/customoverlays), [restrições](https://developers.google.com/maps/api-security-best-practices).

## Como experimentar

- Ao abrir, o navegador pede acesso à localização. Se negar, o mapa começa em Itajaí. O botão de localização permite tentar novamente, respeitando as permissões do navegador.
- Troque o seletor no topo: **Rafael, Felipe, Gabriel e Sérgio, moradores**, **Marcos, representante do órgão**, ou **Rafael, administrador**. Cada morador tem identidade própria, com apoios e comentários independentes. Não existe login nem verificação real de permissões.
- Moradores e administrador: clique em **Adicionar relato**, depois no ponto do mapa. Complete título, categoria e foto opcional.
- Sem a chave configurada, o restante do mockup funciona, com localização inicial de Itajaí e ajuste manual de coordenadas no formulário. O mapa não é simulado nem substituído por outro fornecedor.
- Clique em um relato na lista ou em um pin para abrir detalhes, apoiar e comentar.
- Representante e administrador podem atualizar a situação. O administrador pode remover relatos.
- Os filtros e a lista acompanham a área visível do mapa. Os três relatos iniciais são exemplos fictícios, identificados na interface.

## Dados compartilhados e atualizações em tempo real

Relatos, fotos, apoios, comentários e histórico ficam no SQLite do servidor, em `SQLITE_PATH`. Todos os navegadores que acessarem essa mesma instância veem os mesmos dados. O perfil fictício selecionado continua no localStorage de cada navegador.

Cada ação grava apenas a alteração correspondente, em transação, sem substituir a lista inteira. Apoios têm unicidade por relato/perfil e usam uma operação idempotente. Fotos são reduzidas no navegador, enviadas como JPEG (até 3 MB após o preparo), salvas no SQLite e servidas por uma rota própria; não são reenviadas a cada atualização da lista.

O navegador mantém uma conexão **SSE** com `/api/events`. Após cada gravação, o servidor envia a revisão dos dados e as telas buscam o estado atualizado. Não há recarga de página nem consulta periódica. A conexão recebe um heartbeat a cada 20 segundos e reconecta automaticamente se cair; ao reconectar, recebe a revisão atual, recuperando as mudanças perdidas. Respostas antigas não sobrescrevem versões mais novas. Falhas aparecem na interface, e um formulário que falhou mantém o texto e a foto para nova tentativa.

Execute **uma única instância do processo Node** para esta demonstração: os avisos SSE são distribuídos em memória para suas conexões. Múltiplas instâncias exigiriam um barramento de eventos compartilhado. SQLite usa WAL e os dados sobrevivem ao reinício do servidor.

Os três exemplos são criados somente na primeira inicialização do banco, inclusive se depois todos forem apagados. O IndexedDB da versão anterior permanece intacto no navegador, mas não é importado automaticamente para o banco compartilhado. Os novos dados passam a usar exclusivamente o servidor. Não há envio à prefeitura.

Os perfis continuam fictícios e sem login. O servidor valida os perfis e as ações permitidas de cada papel para a demonstração; qualquer participante pode escolher inclusive o administrador no seletor. Isso preserva o mockup e não representa autenticação real.

## Verificar e gerar a aplicação

```sh
npm test
npm run build
npm start
```

O build gera `dist/` (React) e `dist-server/` (servidor). `npm start` serve aplicação, API e SSE juntos em `http://127.0.0.1:3001`. `npm run preview` faz o mesmo. A rota `/api/health` confirma o acesso ao SQLite. Os testes usam bancos temporários, sem alterar os dados da demonstração.

As variáveis `VITE_` são incorporadas no build: depois de alterar a chave do Maps ou o agrupamento, gere novamente. `HOST`, `PORT` e `SQLITE_PATH` são configurações do servidor, lidas na inicialização, e não entram no JavaScript do navegador.

## Preparação para a VPS

A aplicação está preparada, mas ainda não foi publicada na VPS. Sugestão de endereço: `likecidade.rafaellers.cloud`.

1. Instale Node.js 22.18 ou superior. Coloque o projeto em `/opt/like-cidade` e execute `npm ci` e `npm run build`, com o `.env` preenchido para o domínio final.
2. Crie o usuário de serviço `likecidade` e a pasta `/var/lib/like-cidade`, com permissão de escrita para esse usuário. No `.env` da VPS, use `HOST=127.0.0.1`, `PORT=3001` e `SQLITE_PATH=/var/lib/like-cidade/like-cidade.sqlite`. Mantenha o banco fora da pasta de publicação.
3. Ajuste o caminho do Node no `like-cidade.service.example`, instale como serviço systemd e inicie-o. O serviço deve executar uma única instância de `dist-server/server/index.js`.
4. Configure o DNS do subdomínio e use `Caddyfile.example` como proxy para a porta 3001. O `flush_interval -1` mantém a entrega imediata dos eventos SSE. Caddy fornece HTTPS, necessário para GPS fora de localhost. A raiz do domínio existente não precisa ser alterada.
5. Autorize o domínio final nas restrições da chave Google. Em atualizações, preserve `.env` e a pasta do SQLite; substitua os arquivos da aplicação, gere o build e reinicie o serviço. Os clientes SSE reconectam automaticamente.

### Backup do SQLite

```sh
npm run backup
# Ou informe um arquivo de destino que ainda não exista:
npm run backup -- /caminho/backup-like-cidade.sqlite
```

O backup usa a API de backup online do SQLite, incluindo as transações do WAL, e pode rodar com a aplicação aberta. Por padrão fica em `backups/` ao lado do banco. O usuário do serviço precisa poder gravar nessa pasta. Guarde cópias fora da VPS. Para restaurar, pare o serviço, preserve o banco atual e seus arquivos `-wal`/`-shm`, substitua o banco pelo backup e reinicie. Não copie apenas o arquivo principal de um banco em uso.

## Assets

O favicon e símbolo do cabeçalho usam a extração do mapa colorido do logo aprovado, com apoio da ferramenta de geração de imagens.
