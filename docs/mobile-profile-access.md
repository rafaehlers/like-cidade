# Acesso a perfil e ranking no Safari

Correção de 12/11/2026.

## Falha e causa

O menu tinha dois problemas distintos: rolagem ocultando os atalhos em telas pequenas (corrigido anteriormente) e fechamento antecipado durante cliques no Safari. A verificação em Chrome com viewport móvel não reproduzia o segundo comportamento.

O menu foca programaticamente o primeiro item ao abrir. O Safari pode tirar o foco do botão durante o clique sem atribuí-lo ao próximo botão (`relatedTarget = null`). O `onBlur` tratava esse evento como saída do menu e o desmontava antes de o `onClick` do item escolhido abrir a janela.

A condição agora fecha por foco apenas quando existe um próximo alvo conhecido fora do menu. Cliques/toques fora continuam sendo tratados pelo listener de `pointerdown`, e Escape e saída de foco por teclado mantêm seu comportamento. Não se substituiu o clique por eventos de toque ou por abertura no pointerdown, evitando ativações durante rolagem.

Referência: [comportamento de foco de botões — MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus).

## Regressão manual

O comportamento foi reproduzido no **Safari do macOS** na versão publicada: abrir o menu e clicar em Ranking fechava o menu sem exibir a janela. O mesmo fluxo, com a correção local, abriu Ranking; Meu perfil também abriu pelo menu. Isso testa WebKit/Safari real, além da conferência de layout e teclado em Chrome com viewport móvel. Não representa uma execução diretamente no iPhone do usuário.

Ao validar futuras alterações:

1. Abrir o menu pelo nome, clicar em Ranking e conferir o modal com abas Moradores/Cidades.
2. Fechar a janela, reabrir o menu e clicar em Meu perfil; conferir perfil, pontos e privacidade.
3. Verificar saída por clique fora, Escape e Tab, preservando a navegação entre itens.
4. Em viewport móvel, repetir ambos os atalhos e a troca de usuário, inclusive após rolar a lista de contas.
5. Repetir no Safari, pois apenas reduzir a largura do Chrome não cobre o comportamento de foco que causou esta falha.
