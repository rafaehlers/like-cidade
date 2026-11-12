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
2. Habilite também **Geocoding API**, usada para identificar a cidade no centro do mapa. Crie uma chave para uso em navegador. Restrinja a chave às APIs Maps JavaScript e Geocoding e aos sites autorizados, por exemplo `http://localhost:5173/*` e, `https://likecidade.com.br/*` e `https://www.likecidade.com.br/*`.
3. Não é necessário Map ID: o mapa usa estilo local para ocultar nomes e ícones de pontos de interesse e transporte, mantendo ruas, seus nomes e a geografia. Os pins dos relatos e a localização usam HTML overlays. A variável antiga `VITE_GOOGLE_MAPS_MAP_ID`, se existir no `.env`, não é utilizada.

Este mockup não usa Places. O nome da cidade na barra superior acompanha o centro do mapa usando geocodificação reversa do Google. A consulta acontece 700 ms após o mapa parar de se mover, não é repetida ao apenas mudar o zoom sem mover o centro, e respostas de posições anteriores são ignoradas. Sem resultado ou em caso de falha, aparece “Região do mapa”. A rua do relato também é sugerida pela Geocoding API a partir das coordenadas do pin/GPS, e o morador pode corrigir ou acrescentar uma referência. As variáveis com prefixo `VITE_` ficam acessíveis ao navegador após o build; o `.env` não transforma a chave de navegador em segredo. Restrinja seu uso no Google Cloud.

Documentação: [carregamento](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [estilo do mapa](https://developers.google.com/maps/documentation/javascript/examples/hiding-features), [overlays](https://developers.google.com/maps/documentation/javascript/customoverlays), [restrições](https://developers.google.com/maps/api-security-best-practices).

## Como experimentar

- Ao abrir, o navegador pede acesso à localização. Se negar, o mapa começa em Itajaí. O botão de localização permite tentar novamente, respeitando as permissões do navegador.
- Troque o seletor no topo: **Rafael, Felipe, Gabriel, Sérgio e Ricardo, moradores**, **Marcos, representante do órgão**, ou **Admin, administrador**. Cada morador tem identidade própria, com apoios e comentários independentes. Não existe login nem verificação real de permissões.
- Moradores e administrador: clique em **Reportar algo**, depois no ponto do mapa. Complete título, categoria e foto opcional.
- No celular, o botão **+** de reportar fica na barra inferior, à direita de **Relatos**, disponível tanto no mapa quanto na lista. No desktop, continua na barra superior.
- Depois de escolher a categoria no formulário, aparecem dez subcategorias correspondentes. A escolha é opcional (**Não especificar**) e é limpa ao trocar de categoria. Quando informada, a subcategoria fica salva no SQLite, aparece nos detalhes e pode ser encontrada pela busca. A atualização do banco adiciona um campo opcional, preservando os relatos anteriores.
- A rua é sugerida automaticamente a partir do ponto marcado, do GPS ou das coordenadas ajustadas, usando a Geocoding API já configurada. O campo continua editável. Uma referência digitada não é sobrescrita; nesse caso, é possível aplicar a sugestão explicitamente. Sem resultado ou conexão, o preenchimento manual continua disponível.
- Sem a chave configurada, o restante do mockup funciona, com localização inicial de Itajaí e ajuste manual de coordenadas no formulário. O mapa não é simulado nem substituído por outro fornecedor.
- Clique em um relato na lista ou em um pin para abrir detalhes, apoiar e comentar.
- Use **Ruas / Satélite**, no canto inferior esquerdo do mapa, para alternar a visualização. A escolha é lembrada neste navegador; pins, agrupamentos e registro de relatos funcionam nos dois estilos.
- O botão de lua/sol na barra superior alterna entre **modo claro e escuro**, incluindo cartões, formulários e o mapa de ruas. A preferência é salva neste navegador e aplicada antes da primeira renderização; sem uma escolha salva, acompanha o tema do sistema. As imagens de satélite mantêm suas cores originais.
- Representante e administrador podem atualizar a situação. O administrador pode remover relatos.
- Os filtros e a lista acompanham a área visível do mapa. Os três relatos iniciais são exemplos fictícios, identificados na interface.

Para popular as cidades de teste, execute `npm run build` e `npm run seed:demo`. O conjunto em `demo-data/` adiciona 20 relatos fictícios por cidade (Balneário Camboriú, Itajaí e Navegantes), com fotos ilustrativas licenciadas, créditos, apoios, comentários e históricos simulados. Os registros existentes são preservados e executar novamente não duplica os exemplos nem desfaz suas interações. Reinicie a aplicação após importar para atualizar as conexões SSE. Veja `demo-data/README.md` para os comandos da VPS e detalhes das fontes.

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

## Publicação na VPS

A demonstração está publicada em **https://likecidade.com.br**, também acessível por **https://www.likecidade.com.br**. Ambos redirecionam HTTP para HTTPS e usam certificado Let's Encrypt gerenciado pelo Nginx Proxy Manager.

- VPS: `76.13.123.75`; instalação em `/opt/like-cidade`.
- Container `like-cidade-app`, Node.js 22, iniciado por `compose.yaml` com reinício automático.
- A porta 3000 fica apenas na rede Docker `proxy-network`, compartilhada com o Nginx. Não há nova porta pública da aplicação.
- SQLite persistente em `/opt/like-cidade/data/like-cidade.sqlite`, montado como `/data`. A pasta deve pertencer ao UID/GID `1000:1000`, usado pelo Node no container.
- O proxy dos dois domínios encaminha para `http://like-cidade-app:3000`, com **Force SSL** e **HTTP/2 Support** ativos.
- `nginx-proxy-manager.conf.example` registra a configuração avançada aplicada ao host. A localização exata `location = /api/events` evita que uma regra geral de SSE do servidor encaminhe os eventos para outro aplicativo. Buffering e cache ficam desativados para os eventos.

### Atualizar a aplicação

1. Na máquina de desenvolvimento, mantenha a chave de navegador no `.env` e gere os arquivos com `npm ci` e `npm run build`. A chave Google deve autorizar os dois domínios acima.
2. Envie `dist/`, `dist-server/`, `demo-data/`, `package.json`, `package-lock.json`, `Dockerfile`, `.dockerignore` e `compose.yaml` para `/opt/like-cidade`. Preserve a pasta `data/` e o `.env` do servidor.
3. O `.env` do servidor contém `LIKE_CIDADE_RELEASE`, usado como etiqueta da imagem. Atualize essa etiqueta para identificar a nova versão. Ele não precisa receber a chave do Maps, já incorporada no build do navegador.
4. Em `/opt/like-cidade`, execute `docker compose up -d --build`. O Dockerfile instala somente as dependências de produção e usa os arquivos compilados previamente; não executa o build do React.
5. Confira `docker compose ps` e `https://likecidade.com.br/api/health`. O banco continua no volume, e as conexões SSE reconectam após o reinício.

A primeira publicação iniciou um banco próprio com os três relatos fictícios. O banco local de desenvolvimento permanece independente. Os perfis de demonstração e o tema ficam em cada navegador; relatos e interações da versão publicada são compartilhados pelo banco da VPS.

### Backup do SQLite

Na VPS, em `/opt/like-cidade`:

```sh
docker compose exec -T app node dist-server/server/backup.js
```

Em uma instalação local:

```sh
npm run backup
# Ou informe um arquivo de destino que ainda não exista:
npm run backup -- /caminho/backup-like-cidade.sqlite
```

O backup usa a API de backup online do SQLite, incluindo as transações do WAL, e pode rodar com a aplicação aberta. Por padrão fica em `backups/` ao lado do banco. O usuário do serviço precisa poder gravar nessa pasta. Guarde cópias fora da VPS. Para restaurar, pare o serviço, preserve o banco atual e seus arquivos `-wal`/`-shm`, substitua o banco pelo backup e reinicie. Não copie apenas o arquivo principal de um banco em uso.

## Assets

O favicon e símbolo do cabeçalho usam a extração do mapa colorido do logo aprovado, com apoio da ferramenta de geração de imagens. O PNG possui transparência alpha e o símbolo preenche a área disponível, sem fundo ou moldura branca.

### Perfis e pontos (local)

Abra **Meu perfil** no menu de usuário para editar apelido, foto, município e apresentação, acompanhar nível/conquistas e consultar o extrato de pontos e os próprios relatos. A pontuação é persistida e calculada no servidor; apoios retirados ou relatos removidos geram estornos. Check-in foi excluído do escopo. O login segue fictício; a separação de identidade está preparada para o WorkOS. Regras, limites desta versão e plano de integração estão em [docs/profiles-and-points.md](docs/profiles-and-points.md).

O ranking de moradores está disponível no topo e no menu de perfil, com filtros por cidade, semana/mês/total e tipo de contribuição. Para preencher os cinco moradores fictícios com pontuações simuladas, execute `npm run build` e `npm run seed:ranking`. A carga é idempotente e mantém as ações fictícias separadas dos pontos reais; o perfil e o extrato identificam essa distinção. Faça um backup antes da primeira carga.
