$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm não encontrado.' }
if (-not (Test-Path '.env')) { throw 'Crie o .env e configure JWT_SECRET, DATABASE_URL e MQTT_URL.' }
$envText = Get-Content '.env' -Raw
if ($envText -match 'JWT_SECRET=SUBSTITUA_POR_' -or $envText -notmatch '(?m)^DATABASE_URL=postgres') { throw 'Configure JWT_SECRET e DATABASE_URL no .env.' }
if (-not (Test-Path 'node_modules')) { npm install; if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' } }
node -e "try { require('esbuild'); process.exit(0) } catch { process.exit(1) }"
if ($LASTEXITCODE -ne 0) {
    npm install-scripts approve esbuild
    if ($LASTEXITCODE -ne 0) { throw 'Aprove o postinstall do esbuild com: npm install-scripts approve esbuild' }
    npm rebuild esbuild
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao reconstruir o esbuild.' }
}
Write-Host 'Aplicando migrações do PostgreSQL local...' -ForegroundColor Cyan
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível conectar ao PostgreSQL. Confirme o serviço e a DATABASE_URL.' }
npm run db:seed
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar a conta administrativa.' }
Write-Host 'Iniciando modo institucional. O PostgreSQL e Mosquitto devem estar ativos como serviços nativos.' -ForegroundColor Green
if (-not $env:VITE_DEV_HOST) { $env:VITE_DEV_HOST = '0.0.0.0' }
npm run dev:infra
if ($LASTEXITCODE -ne 0) { throw 'A API institucional encerrou com erro.' }
