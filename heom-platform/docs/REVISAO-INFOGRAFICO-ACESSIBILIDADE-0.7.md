# HEOM 0.7.0 — infográfico e acessibilidade

## Objetivo

Aprimorar a visão geral do patrimônio e ampliar os controles de acessibilidade existentes sem recriar a aplicação, substituir integrações ou inserir números de demonstração no infográfico.

## Infográfico da visão geral

Os componentes visuais são calculados a partir dos dados retornados pelo endpoint `/api/dashboard`. As agregações de categoria e cobertura foram incluídas tanto no servidor PostgreSQL quanto no servidor de demonstração; não dependem da quantidade de linhas renderizadas na tela de inventário:

- **Situação operacional:** métricas do endpoint `/api/dashboard` (`total`, `operating`, `maintenance` e `unavailable`). A quantidade residual é mostrada como “Outras situações”. Os segmentos visuais são acompanhados de quantidade, percentual e nome textual; os itens da legenda abrem o inventário correspondente.
- **Patrimônio por setor:** coleção `departments` do endpoint `/api/dashboard`, ordenada pela quantidade de bens. Bens sem setor atribuído ou vinculados a setores inativos entram em uma linha residual explícita, para que a distribuição não esconda parte do total. A primeira visualização destaca até seis grupos; a tabela expansível permite consultar todos.
- **Categorias patrimoniais:** categorias agregadas pela API diretamente sobre todos os bens ativos do banco de dados; a visualização não depende do limite de 500 registros da rota de listagem `/api/assets`. A primeira visualização destaca até sete categorias; a tabela expansível lista todas.
- **Cobertura cadastral:** contagem dos campos já presentes nos registros de ativos: setor associado, ambiente informado, fabricante e modelo, número de série, etiqueta/referência oficial e etiqueta de rastreamento cadastrada. O percentual médio é uma referência descritiva; campos opcionais podem não se aplicar a alguns tipos de patrimônio.
- **Disponibilidade:** o medidor principal informa quantidade e percentual de bens em operação.

Quando não há dados, os gráficos são substituídos por mensagens explicativas. As barras não são a única forma de acessar os números: rótulos, contagens, percentuais e tabelas são fornecidos como alternativa textual.

## Central de acessibilidade

Preferências persistidas em `localStorage` no navegador atual:

- Tema claro ou escuro.
- Alto contraste.
- Redução de transparências.
- Ampliação de 100%, 110%, 125%, 150%, 175% e 200%.
- Aumento do espaçamento do texto.
- Fonte sem serifa de leitura simples.
- Sublinhado de links e ações.
- Destaque reforçado do foco de teclado.
- Redução de animações.
- Ativação opcional do widget VLibras, dependente de conexão externa.

A central recebe foco ao abrir, fecha com `Esc` e devolve o foco ao botão que a acionou. Os recursos também respeitam as preferências de movimento e contraste configuradas no sistema operacional, quando o navegador as disponibiliza.

## Limites e validação

Esta atualização não declara conformidade WCAG 2.2 AA. A ampliação em 200%, a combinação de temas e contraste, os leitores de tela e os dispositivos móveis ainda precisam de ensaios manuais nos navegadores e equipamentos de uso institucional.

A tentativa de instalar as dependências no ambiente de autoria excedeu o limite de tempo. A sintaxe TSX foi verificada com o compilador TypeScript disponível e o balanceamento de chaves CSS foi conferido, mas **typecheck completo, build e testes automatizados não foram aprovados nesta sessão**. Execute localmente a partir desta pasta:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Não foram adicionadas dependências nem alterados endpoints, persistência, permissões, perfis ou regras de negócio.


## Refinamentos após revisão

- A distribuição por setor inclui o saldo de bens sem setor associado ou vinculado a setor inativo; a soma dos grupos passa a representar o total não arquivado.
- A central usa alvos de toque de pelo menos 48 px nos controles principais e de acessibilidade.
- O CSS respeita automaticamente `prefers-reduced-motion`, mesmo quando a preferência manual ainda está desligada.


## Recursos adicionais de acessibilidade — voz, memória e mobilidade

- **Leitura em voz alta:** botão “Ouvir opções” utiliza a API de síntese de voz do navegador, em português do Brasil, e narra o nome e o estado atual de cada configuração. “Parar leitura” interrompe imediatamente a fala. A disponibilidade da voz depende do navegador e das vozes instaladas no dispositivo.
- **Comando por voz:** botão “Comando de voz” inicia o reconhecimento de fala somente após ação explícita do usuário. Comandos aceitos: “ler opções” e “parar leitura”. É exibido um estado textual acessível. O reconhecimento pode não existir em todos os navegadores, pode exigir permissão do microfone e pode utilizar processamento externo do próprio navegador; não deve ser usado para ditar dados de pacientes.
- **Apoio à memória e orientação:** o “Modo de orientação simplificada” mantém visível o módulo atual, mostra uma explicação curta do que pode ser feito naquela tela e oferece um botão grande e consistente para retornar à visão geral. Os módulos não são ocultados.
- **Apoio à mobilidade e tremores:** o “Modo de interação motora facilitada” aumenta alvos de interação, alarga espaçamentos e elimina movimentos decorativos e transformações ao passar o ponteiro. A configuração não executa ações automaticamente nem muda permissões.

Esses recursos oferecem apoio de interface para pessoas com dificuldades de memória, orientação, tremores ou movimentos menos precisos. Não substituem avaliação especializada, treinamento ou recursos de tecnologia assistiva do sistema operacional. O reconhecimento de fala depende de suporte e das políticas de privacidade do navegador.
