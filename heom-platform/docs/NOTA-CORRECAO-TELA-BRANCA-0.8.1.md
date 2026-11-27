# HEOM 0.8.1 — Correção de tela branca

## Causa identificada

A dashboard passou a consumir `categories` e `coverage` para montar o infográfico. A implementação da API demonstrativa em `local-demo-api.ts` ainda retornava o contrato anterior sem `coverage`. O componente tentava ler `data.coverage.total` durante a renderização e lançava uma exceção, impedindo a montagem da interface.

## Correções

- A API local agora calcula categorias e cobertura cadastral sobre todos os bens não arquivados.
- Os indicadores permanecem derivados dos registros reais da demonstração local, sem números artificiais.
- A dashboard usa acesso opcional ao objeto `coverage` para tolerar dados antigos em memória/cache.
- Foi criada uma função de cálculo isolada com testes automatizados para as contagens.
- Foi adicionado um React Error Boundary para exibir uma mensagem de erro útil em vez de deixar uma tela branca em falhas de renderização futuras.

## Verificações

A causa foi confirmada pela comparação do contrato tipado `DashboardData`, o retorno da API institucional e o retorno divergente da API local. O build completo ainda precisa ser executado no computador de desenvolvimento com as dependências instaladas.
