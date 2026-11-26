# Redesign visual HEOM 0.3.1

## Objetivo
Aprimorar a leitura da dashboard e das telas operacionais sem alterar contratos da API ou exigir serviços externos.

## Mudanças
- Hero da central de operações com identidade institucional e ações diretas para inventário e identificação fotográfica.
- Indicador circular da participação de equipamentos em operação no total cadastrado; valor derivado da resposta real de `/dashboard`.
- Cartões de indicadores com maior hierarquia, tipografia ampliada e ações de navegação preservadas.
- Composição do inventário calculada a partir de em operação, em manutenção, indisponíveis e demais situações.
- Prioridades operacionais com aviso de verificação antes de decisões.
- Barras de disponibilidade dos setores calculadas pela relação entre equipamentos em operação e total do setor.
- Melhorias de tipografia, contraste, superfícies, navegação e estados de foco.
- Responsividade para telas menores e respeito a `prefers-reduced-motion`.

## Compatibilidade offline
As fontes são escolhidas entre famílias locais (`Aptos`, `Segoe UI Variable`, `Segoe UI`, `Inter` e fontes de sistema). Não foi adicionada fonte remota, CDN ou serviço externo. Nenhuma dependência npm adicional foi introduzida.

## Observações dos dados
A planta continua marcada como ilustrativa até que HEOM forneça desenhos oficiais. O indicador circular mostra apenas o percentual de equipamentos cujo status cadastrado é `EM_OPERACAO`; não representa disponibilidade clínica, prontidão para uso nem certificação técnica. A barra de composição apresenta os estados operacionais registrados no inventário.
