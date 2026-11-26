# Modo de demonstração local sem Docker

## Objetivo

Permitir que a equipe valide a interface e os fluxos essenciais do HEOM sem instalar Docker Desktop, PostgreSQL ou Mosquitto.

## Como funciona

- A interface React é servida pelo Vite em `localhost:5173`.
- A API de demonstração roda em `localhost:4000`.
- Os dados são persistidos em `apps/api/data/heom-demo.json`.
- As senhas são armazenadas com hash bcrypt.
- A autenticação usa token assinado localmente.
- O WebSocket local transmite atualizações para as telas abertas.
- O simulador atualiza a localização estimada, cria eventos e pode gerar alertas.

## Limitações importantes

- O arquivo JSON não é apropriado para concorrência e disponibilidade de uma implantação hospitalar.
- Não há broker MQTT neste modo.
- Não há integração com BLE, RFID ou UWB físico.
- As localizações dos equipamentos são simulações didáticas.
- A planta é ilustrativa e aguarda desenho oficial validado pelo HEOM.
- Não inserir dados pessoais, dados de pacientes ou patrimônio real.

## Retornar ao modo completo

O modo completo continua no arquivo `apps/api/src/server.ts`, usando PostgreSQL e MQTT. A implantação deve ser configurada e homologada separadamente.
