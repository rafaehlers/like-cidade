# Relatos fictícios das cidades de teste

Este conjunto adiciona **60 relatos**: 20 de Balneário Camboriú, 20 de Itajaí e 20 de Navegantes. Os pins indicam posições aproximadas para a demonstração; não representam problemas reais nos locais indicados.

Os relatos cobrem as seis categorias do aplicativo, os cinco moradores fictícios e as quatro situações de atendimento. Apoios, comentários e histórico também são simulados. Todos são gravados com `sample=1` e aparecem como **Exemplo fictício** na interface.

As 12 fotos são miniaturas JPEG obtidas no Wikimedia Commons, relacionadas à categoria do problema. São de outros locais e não documentam as cidades de teste. A descrição de cada relato informa isso e apresenta autor, licença e link da fonte. `photo-credits.json` registra os créditos completos e o SHA-256 de cada arquivo. As fotos mantêm suas licenças originais; nenhuma imagem foi alterada além da miniatura fornecida pelo próprio Commons.

## Importar

Após `npm run build`, execute `npm run seed:demo` na raiz do projeto. O script usa `SQLITE_PATH` do `.env`, valida o conjunto inteiro antes de gravar e insere os registros em uma transação. Faça um backup antes de executar em um banco em uso.

Na VPS:

```sh
docker compose exec -T app node dist-server/server/backup.js
docker compose exec -T app node dist-server/server/seed-demo.js
docker compose restart app
```

O reinício faz as conexões SSE reconectarem e receberem a nova revisão do banco. Na versão local, reinicie `npm run dev` pelo mesmo motivo.

Os identificadores `demo-city-v1-*` tornam a importação repetível: se o registro já existe, ele é preservado integralmente, incluindo alterações de situação, apoios, comentários, fotos e datas. Os relatos anteriores, inclusive os três exemplos originais, continuam intactos. A importação é manual e não roda automaticamente a cada inicialização.

`scripts/fetch-demo-photos.py` permite baixar novamente os arquivos e atualizar o manifesto de créditos a partir dos metadados públicos do Commons. Não é necessário executá-lo para importar os dados já incluídos neste diretório.
