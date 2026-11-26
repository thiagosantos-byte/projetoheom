# Perfis de demonstração HEOM 0.4.0

Os quatro perfis são personas selecionáveis, sem contas autenticadas.

| Perfil | Identificador funcional | Escopo |
|---|---|---|
| Administrador | `ADMIN` | Administração demonstrativa, lista de perfis, gateways, configurações e acesso operacional. |
| Gestor | `GESTOR` | Gestão de inventário, movimentações, aprovação, alertas e manutenção. |
| Operador | `OPERADOR` | Cadastro/edição, fotos, manutenção, solicitações e operações permitidas. |
| Consulta | `CONSULTA` | Somente leitura. |

Na primeira visita, nenhum perfil fica selecionado: escolha uma das quatro personas na tela inicial. Depois, a troca pode ser feita no seletor do cabeçalho, sem sair do sistema e sem gerar token. A função escolhida é lembrada neste navegador.

## Identificadores e armazenamento

- As funções (`ADMIN`, `GESTOR`, `OPERADOR`, `CONSULTA`) são os identificadores; não existem e-mails fictícios internos.
- A persona ativa fica em `localStorage['heom.demo.role']`.
- Dados funcionais ficam em `localStorage`; as fotografias ficam em IndexedDB.
- Todos os registros iniciais são fictícios e marcados `SIMULADO`.

## Permissões mantidas

- Consulta não pode criar/editar/arquivar, solicitar/gerenciar movimentações, tratar alertas nem criar ordens.
- Operador pode cadastrar/editar equipamento, movimentar, atuar em manutenção, fotos e alertas.
- Gestor pode aprovar movimentações, arquivar, acessar administração/gateways e gerir operações.
- Administrador tem o escopo administrativo e pode consultar os quatro perfis demonstrativos.

## Limite de segurança

Este mecanismo é para demonstração pública. Qualquer visitante pode trocar de perfil, alterar os próprios dados locais ou limpar o armazenamento. Não é autenticação, não protege dados e não deve ser usado para contas ou registros reais.
